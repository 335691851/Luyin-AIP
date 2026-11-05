import { describe, expect, it } from "vitest";
import { buildAnnualReport } from "../src/lib/annual-report";
import type { Sale } from "../src/lib/report-model";
const sale: Sale = {
  id: "1",
  number: "SO-1",
  date: "2026-01-10",
  company: "甲",
  department: "",
  product: "盐",
  category: "盐",
  region: "",
  qty: 10,
  unit: "吨",
  revenue: 10000,
  unitCost: 800,
  costAmount: 8000,
  status: "approved",
};
describe("annual report", () => {
  it("covers exactly twelve months and reconciles order lines to the year", () => {
    const r = buildAnnualReport(
      [
        sale,
        {
          ...sale,
          id: "2",
          date: "2026-02-01",
          number: "SO-2",
          revenue: 20000,
        },
        { ...sale, id: "3", date: "2025-12-31" },
      ],
      "2026",
    );
    expect(r.months).toHaveLength(12);
    expect(r.summary.revenue).toBe(30000);
    expect(r.summary.profit).toBe(14000);
    expect(r.summary.margin).toBe(46.67);
    expect(r.orderCount).toBe(2);
    expect(r.months[2].revenue).toBeUndefined();
    expect(r.months[0].profit).toBe(2000);
  });
  it("keeps unknown costs and mixed units out of annual profit and quantity", () => {
    const r = buildAnnualReport(
      [
        sale,
        {
          ...sale,
          id: "2",
          date: "2026-02-01",
          unit: "袋",
          unitCost: null,
          costAmount: null,
        },
      ],
      "2026",
    );
    expect(r.summary.profit).toBeNull();
    expect(r.summary.qty).toBeNull();
    expect(r.months[0].profit).toBe(2000);
    expect(r.months[1].profit).toBeNull();
  });
});
