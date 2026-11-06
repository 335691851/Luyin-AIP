import { describe, it, expect } from "vitest";
import { insightPrompts } from "../src/lib/insight-prompts";
describe("ERP common questions", () => {
  it("keeps question drafts conversational instead of exposing query instructions", () => {
    const rows = insightPrompts("2026-10", undefined, [
      "profit.view",
      "coordination.view",
    ]);
    for (const row of rows) {
      expect(row.question).not.toMatch(
        /stock_balance|qty|reserved_qty|packaging|unknown|sea|SQL|ERP|字段|小于等于|仅统计|不分摊|按.*分组|不要混加/,
      );
      expect(row.question.length).toBeLessThan(65);
      expect(row.question).toMatch(/？$/);
    }
  });

  it("offers at least six distinct sales questions without privileged topics", () => {
    const rows = insightPrompts("2026-10");
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.every((r) => r.group === "销售分析")).toBe(true);
    expect(rows.every((r) => r.question.includes("2026年10月"))).toBe(true);
  });
  it("uses explicit yearly periods and permission-specific cost/stock topics", () => {
    const rows = insightPrompts("2026-10", "2026", [
      "profit.view",
      "coordination.view",
    ]);
    expect(rows).toHaveLength(12);
    expect(rows.find((r) => r.id === "trend")?.question).toContain(
      "2026年的销售额每个月",
    );
    expect(rows.find((r) => r.id === "available-stock")?.question).toContain(
      "现在各公司",
    );
    expect(rows.find((r) => r.id === "cost-coverage")?.question).toContain(
      "缺少成本数据",
    );
    expect(
      insightPrompts("2026-10", undefined, ["profit.view"]).some(
        (r) => r.group === "库存分析",
      ),
    ).toBe(false);
  });
});
