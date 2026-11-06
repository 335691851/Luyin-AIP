import { describe, expect, it, vi } from "vitest";
import {
  runPricingGraph,
  type PricingGraphTools,
  type PricingLine,
} from "../src/lib/agents/pricing-graph";

const lines: PricingLine[] = [
  {
    id: "A",
    materialId: 1,
    product: "食盐",
    original: 100,
    requested: 90,
    qty: 0.3,
    reason: "申请促销",
  },
  {
    id: "B",
    materialId: 2,
    product: "海盐",
    original: 200,
    requested: 210,
    qty: 2,
    reason: "原料上涨",
  },
];
function tools(): PricingGraphTools {
  return {
    sales: vi
      .fn()
      .mockResolvedValue([{ material_id: 1, qty: "10", revenue: "800" }]),
    inventory: vi
      .fn()
      .mockResolvedValue([
        { material_id: 1, company: "泰安", qty: "0.3", reserved: "0.1" },
      ]),
    history: vi.fn().mockResolvedValue({ rows: [], warning: "历史调价不可用" }),
    assess: vi.fn().mockResolvedValue("**需补证**，不得自动批准。"),
  };
}

describe("LangGraph batch pricing assessment", () => {
  it("joins all evidence before one batch assessment and computes every line deterministically", async () => {
    const t = tools();
    const result = await runPricingGraph("泰安", lines, t);
    expect(t.assess).toHaveBeenCalledTimes(1);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toMatchObject({
      lineId: "A",
      priceChange: -10,
      priceChangePercent: -10,
      requestedAmount: 27,
      salesQty30Days: 10,
      averageNetPrice30Days: 80,
    });
    expect(result.findings[0].inventoryByCompany[0].available).toBe(0.2);
    expect(result.findings[1]).toMatchObject({
      lineId: "B",
      priceChangePercent: 5,
      salesQty30Days: null,
      averageNetPrice30Days: null,
    });
    expect(result.findings[1].missing.join(" ")).toContain("不能按零库存判断");
    expect(result.evidence.missing).toContain("历史调价不可用");
    expect(result.evidence.priceBasis).toContain("不可直接比价");
    expect(result.workflow.engine).toBe("langgraph");
  });
  it("waits for the slow evidence branch instead of evaluating incomplete data", async () => {
    const t = tools();
    let release!: (value: { rows: [] }) => void;
    vi.mocked(t.history).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const running = runPricingGraph("泰安", lines, t);
    await vi.waitFor(() => expect(t.history).toHaveBeenCalled());
    expect(t.assess).not.toHaveBeenCalled();
    release({ rows: [] });
    await running;
    expect(t.assess).toHaveBeenCalledTimes(1);
  });
  it("fails on required evidence errors without asking the model to invent missing facts", async () => {
    const t = tools();
    vi.mocked(t.sales).mockRejectedValue(Error("ERP unreachable"));
    await expect(runPricingGraph("泰安", lines, t)).rejects.toThrow(
      "ERP unreachable",
    );
    expect(t.assess).not.toHaveBeenCalled();
  });
  it("does not produce a successful empty assessment", async () => {
    const t = tools();
    vi.mocked(t.assess).mockResolvedValue("  ");
    await expect(runPricingGraph("泰安", lines, t)).rejects.toThrow(
      "PRICE_ASSESSMENT_EMPTY",
    );
  });
  it("does not start evidence tools for a cancelled request", async () => {
    const t = tools();
    await expect(
      runPricingGraph("泰安", lines, t, AbortSignal.abort()),
    ).rejects.toThrow();
    expect(t.sales).not.toHaveBeenCalled();
  });
});
