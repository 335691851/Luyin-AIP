import { describe, it, expect } from "vitest";
import { profitInsight } from "../src/lib/profit-insight";
import type { Sale } from "../src/lib/report-model";
const base: Sale = {
  id: "1",
  number: "SO-1",
  date: "2026-10-01",
  company: "公司甲",
  department: "营销",
  product: "产品甲",
  category: "盐",
  region: "",
  qty: 10,
  unit: "吨",
  revenue: 10000,
  unitCost: 800,
  costAmount: 8000,
  status: "approved",
};
describe("profit insight evidence", () => {
  it("reports weighted overall margin and counts loss orders rather than lines", () => {
    const items = profitInsight([
      base,
      {
        ...base,
        id: "2",
        number: "SO-2",
        product: "产品乙",
        revenue: 1000,
        costAmount: 2000,
        unitCost: 200,
      },
      {
        ...base,
        id: "3",
        number: "SO-2",
        product: "产品乙",
        revenue: 1000,
        costAmount: 2000,
        unitCost: 200,
      },
    ]);
    expect(items[0].text).toContain("2笔订单");
    expect(items[0].text).toContain("0.00%");
    expect(items[2].text).toContain("1笔亏损订单");
    expect(items[1].text).toContain("产品甲");
  });
  it("does not present incomplete cost as group profit or an unrestricted ranking", () => {
    const items = profitInsight([
      base,
      { ...base, id: "2", number: "SO-2", unitCost: null, costAmount: null },
    ]);
    expect(items[0].text).toContain("暂不输出整体利润");
    expect(items[1].text).toContain("排名不代表全部范围");
    expect(items[3].text).toContain("1笔订单");
  });
  it("returns no fabricated insight when there are no orders", () => {
    expect(profitInsight([])).toEqual([]);
  });
});
