import { describe, it, expect, vi } from "vitest";
import type postgres from "postgres";
import { pricingHistory } from "../src/server/pricing-history";
describe("optional ERP pricing history", () => {
  it("reports unauthorized history as unavailable evidence", async () => {
    const sql = vi.fn().mockRejectedValue({ code: "42501" });
    const result = await pricingHistory(
      sql as unknown as ReturnType<typeof postgres>,
      [7],
    );
    expect(result.rows).toEqual([]);
    expect(result.warning).toContain("SELECT权限");
  });
  it("reports missing source without querying a nonexistent table", async () => {
    const sql = vi.fn().mockResolvedValue([{ name: null }]);
    const result = await pricingHistory(
      sql as unknown as ReturnType<typeof postgres>,
      [7],
      "鲁盐泰安",
    );
    expect(result.rows).toEqual([]);
    expect(result.warning).toContain("表不存在");
    expect(sql).toHaveBeenCalledTimes(1);
  });
  it("keeps company and product scope when history exists", async () => {
    const sql = vi
      .fn()
      .mockResolvedValueOnce([{ name: "pricechangerecord" }])
      .mockResolvedValueOnce([{ id: "1" }]);
    const result = await pricingHistory(
      sql as unknown as ReturnType<typeof postgres>,
      [7],
      "鲁盐泰安",
      ["产品A"],
    );
    expect(result.warning).toBe("");
    expect(result.rows).toEqual([{ id: "1" }]);
    expect(sql.mock.calls[1]).toContainEqual([7]);
    expect(sql.mock.calls[1]).toContainEqual(["产品A"]);
  });
  it("warns on schema drift but does not hide connection failures", async () => {
    for (const code of ["42703", "42P01"]) {
      const sql = vi.fn().mockRejectedValue({ code });
      expect(
        (
          await pricingHistory(
            sql as unknown as ReturnType<typeof postgres>,
            [7],
          )
        ).warning,
      ).toContain("结构已变化");
    }
    const sql = vi.fn().mockRejectedValue({ code: "CONNECTION_CLOSED" });
    await expect(
      pricingHistory(sql as unknown as ReturnType<typeof postgres>, [7]),
    ).rejects.toEqual({ code: "CONNECTION_CLOSED" });
  });
});
