import { describe, it, expect } from "vitest";
import { sameOrigin } from "../src/lib/request-origin";
import {
  nominalProfit,
  monthCutoff,
  isTailStock,
  frameCoversYear,
  aggregateReview,
  requireReview,
} from "../src/lib/domain";
describe("confirmed business boundaries", () => {
  it("accepts public host through local routing but rejects cross-origin requests", () => {
    expect(
      sameOrigin(
        new Request("http://localhost:3100/api/chat", {
          headers: { host: "127.0.0.1:3100", origin: "http://127.0.0.1:3100" },
        }),
      ),
    ).toBe(true);
    expect(
      sameOrigin(
        new Request("http://localhost:3100/api/chat", {
          headers: { host: "127.0.0.1:3100", origin: "https://other.example" },
        }),
      ),
    ).toBe(false);
  });
  it("simple nominal profit excludes expense allocation and preserves missing cost", () => {
    expect(nominalProfit(10000, 10, 800)).toEqual({
      cost: "8000.00",
      profit: "2000.00",
      margin: "20.00",
    });
    expect(nominalProfit(10000, 10, null).profit).toBeNull();
    expect(nominalProfit(0, 1, 1).margin).toBeNull();
  });
  it("subtracts natural months with month-end clamp", () => {
    expect(monthCutoff("2026-11-04")).toBe("2026-08-04");
    expect(monthCutoff("2026-05-31")).toBe("2026-02-28");
    expect(monthCutoff("2024-05-31")).toBe("2024-02-29");
  });
  it("strictly excludes cutoff date and 0.5 ton boundary", () => {
    expect(isTailStock("2026-11-04", "2026-08-03", 0.49)).toBe(true);
    expect(isTailStock("2026-11-04", "2026-08-04", 0.49)).toBe(false);
    expect(isTailStock("2026-11-04", "2026-08-03", 0.5)).toBe(false);
    expect(isTailStock("2026-11-04", null, 0.2)).toBe(false);
  });
  it("requires full natural year and formal annual framework", () => {
    expect(frameCoversYear(2026, "2026-01-01", "2026-12-31", true, true)).toBe(
      true,
    );
    expect(frameCoversYear(2026, "2026-02-01", "2026-12-31", true, true)).toBe(
      false,
    );
    expect(frameCoversYear(2026, "2026-01-01", "2026-12-31", false, true)).toBe(
      false,
    );
  });
  it("retains independent line review and requires an opinion", () => {
    expect(aggregateReview(["已通过", "待审核"])).toBe("处理中");
    expect(aggregateReview(["已通过", "已驳回"])).toBe("部分通过");
    expect(() => requireReview("已通过", "重复审批")).toThrow();
    expect(() => requireReview("待审核", " ")).toThrow();
  });
});
