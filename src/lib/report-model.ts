import Decimal from "decimal.js";
export type Sale = {
  id: string;
  number?: string;
  costAmount?: number | null;
  costBasis?: string;
  date: string;
  company: string;
  department: string;
  product: string;
  category: string;
  region: string;
  qty: number;
  unit: string;
  revenue: number;
  unitCost: number | null;
  status: string;
};
export type Dimension =
  "company" | "category" | "region" | "product" | "date" | "order";
export type ReportRow = {
  id: string;
  name: string;
  count: number;
  qty: number | null;
  revenue: number;
  share: number;
  avgPrice: number | null;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  coverage: string;
};
export function buildReport(sales: Sale[], dimension: Dimension): ReportRow[] {
  const groups = new Map<string, Sale[]>();
  sales.forEach((s) => {
    const name =
      dimension === "order"
        ? `${s.company} / ${s.number || s.id}`
        : s[dimension];
    groups.set(name, [...(groups.get(name) || []), s]);
  });
  const total = sales.reduce((n, s) => n.plus(s.revenue), new Decimal(0));
  return [...groups]
    .map(([name, rows]) => {
      const revenue = rows.reduce((n, s) => n.plus(s.revenue), new Decimal(0));
      const qty = rows.reduce((n, s) => n.plus(s.qty), new Decimal(0));
      const units = new Set(rows.map((s) => s.unit));
      const comparable = units.size === 1 && units.has("吨");
      const covered = rows.filter((s) => s.unitCost !== null);
      const cost =
        covered.length === rows.length
          ? covered.reduce(
              (n, s) =>
                n.plus(s.costAmount ?? new Decimal(s.qty).mul(s.unitCost!)),
              new Decimal(0),
            )
          : null;
      const profit = cost === null ? null : revenue.minus(cost);
      const out = (n: Decimal) => Number(n.toFixed(2));
      return {
        id: name,
        name,
        count: rows.length,
        qty: comparable ? out(qty) : null,
        revenue: out(revenue),
        share: total.isZero()
          ? 0
          : Number(revenue.div(total).mul(100).toFixed(1)),
        avgPrice: comparable && !qty.isZero() ? out(revenue.div(qty)) : null,
        cost: cost === null ? null : out(cost),
        profit: profit === null ? null : out(profit),
        margin:
          profit === null || revenue.isZero()
            ? null
            : Number(profit.div(revenue).mul(100).toFixed(2)),
        coverage: `${covered.length}/${rows.length}`,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
