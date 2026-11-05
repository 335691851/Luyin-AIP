import { buildReport, type Sale } from "./report-model";
export function buildAnnualReport(sales: Sale[], year: string) {
  const scoped = sales.filter((s) => s.date.startsWith(`${year}-`));
  const summary = buildReport(
    scoped.map((s) => ({ ...s, company: "合计" })),
    "company",
  )[0];
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const lines = scoped.filter((s) => s.date.startsWith(month));
    const total = buildReport(
      lines.map((s) => ({ ...s, company: "合计" })),
      "company",
    )[0];
    return {
      ...total,
      id: month,
      name: `${i + 1}月`,
      count: lines.length,
      orders: new Set(lines.map((s) => `${s.company}/${s.number || s.id}`))
        .size,
    };
  });
  return {
    summary,
    months,
    products: buildReport(scoped, "product"),
    orderCount: new Set(scoped.map((s) => `${s.company}/${s.number || s.id}`))
      .size,
  };
}
