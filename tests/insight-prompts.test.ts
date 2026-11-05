import { describe, it, expect } from "vitest";
import { insightPrompts } from "../src/lib/insight-prompts";
describe("ERP common questions", () => {
  it("offers at least six distinct sales questions without privileged topics", () => {
    const rows = insightPrompts("2026-10");
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.group === "销售分析")).toBe(true);
    expect(rows.every((r) => r.question.includes("2026-10自然月"))).toBe(true);
  });
  it("uses explicit yearly periods and permission-specific cost/stock topics", () => {
    const rows = insightPrompts("2026-10", "2026", [
      "profit.view",
      "coordination.view",
    ]);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.id === "trend")?.question).toContain(
      "2026年全年按月",
    );
    expect(rows.find((r) => r.id === "available-stock")?.question).toContain(
      "不按订单期间过滤",
    );
    expect(rows.find((r) => r.id === "cost-coverage")?.question).toContain(
      "小于等于0",
    );
    expect(
      insightPrompts("2026-10", undefined, ["profit.view"]).some(
        (r) => r.group === "库存分析",
      ),
    ).toBe(false);
  });
});
