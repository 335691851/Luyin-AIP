import { it, expect } from "vitest";
import { buildDailySales } from "../src/lib/daily-sales";
import type { DailyRaw } from "../src/lib/daily-sales";
const row: DailyRaw = {
  category: "食用盐",
  variety: "小包装",
  origin: "unknown",
  packaging: "small",
  unit: "吨",
  day: "0.1",
  month: "0.3",
  year: "1.25",
  day_count: 1,
  month_count: 2,
  year_count: 3,
};
it("keeps the primary total independent of overlapping origin breakdowns", () => {
  const d = buildDailySales(
    [row, { ...row, day: "0.2", month: "0.4", year: "2.5" }],
    [{ category: "非食用盐", variety: "药用盐" }],
  );
  expect(d.total.day).toBe(0.3);
  expect(d.total.month).toBe(0.7);
  expect(d.total.year).toBe(3.75);
  expect(d.rows.find((r) => r.variety === "药用盐")?.day).toBe(0);
  expect(d.breakdown.find((r) => r.id === "origin:unknown")?.day).toBe(0.3);
});
it("does not add non-ton quantities or invalidate periods without those lines", () => {
  const d = buildDailySales(
    [
      row,
      {
        ...row,
        unit: "件",
        day_count: 0,
        month_count: 1,
        year_count: 1,
        day: "0",
        month: "9",
        year: "9",
      },
    ],
    [],
  );
  expect(d.total.day).toBe(0.1);
  expect(d.total.month).toBeNull();
  expect(d.total.year).toBeNull();
});
