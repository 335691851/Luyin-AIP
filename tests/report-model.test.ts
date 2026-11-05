import { describe, it, expect } from "vitest";
import { buildReport } from "../src/lib/report-model";
import type { Sale } from "../src/lib/report-model";
const base: Sale = {
  id: "a",
  date: "2026-10-01",
  company: "法人甲",
  department: "营销部",
  product: "产品甲",
  category: "食盐",
  region: "济南",
  qty: 10,
  unit: "吨",
  revenue: 10000,
  unitCost: 800,
  status: "已审核",
};
describe("report tables and charts share consistent aggregates", () => {
  it("aggregates ERP total line cost by order without reallocating expenses", () => {
    const [r] = buildReport(
      [
        {
          ...base,
          number: "SO-1",
          qty: 3,
          unitCost: 333.3333333,
          costAmount: 1000,
        },
        {
          ...base,
          id: "b",
          number: "SO-1",
          qty: 7,
          unitCost: 142.8571428,
          costAmount: 1000,
        },
      ],
      "order",
    );
    expect(r.name).toBe("法人甲 / SO-1");
    expect(r.count).toBe(2);
    expect(r.cost).toBe(2000);
    expect(r.profit).toBe(18000);
  });
  it("calculates weighted margin using total revenue instead of averaging row margins", () => {
    const [r] = buildReport(
      [base, { ...base, id: "b", revenue: 20000, qty: 10, unitCost: 1000 }],
      "company",
    );
    expect(r.revenue).toBe(30000);
    expect(r.profit).toBe(12000);
    expect(r.margin).toBe(40);
    expect(r.share).toBe(100);
  });
  it("keeps incomplete cost groups uncalculated and shows coverage", () => {
    const [r] = buildReport(
      [base, { ...base, id: "b", unitCost: null }],
      "company",
    );
    expect(r.profit).toBeNull();
    expect(r.cost).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.coverage).toBe("1/2");
  });
  it("does not total quantities of incompatible units", () => {
    const [r] = buildReport(
      [base, { ...base, id: "b", unit: "袋" }],
      "company",
    );
    expect(r.qty).toBeNull();
    expect(r.avgPrice).toBeNull();
    expect(r.revenue).toBe(20000);
  });
});
