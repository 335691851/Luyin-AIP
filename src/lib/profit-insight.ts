import { buildReport, type Sale } from "./report-model";

const money = (n: number) =>
  `${(n / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万元`;

/** Uses the same filtered order lines and cost coverage rules as the report. */
export function profitInsight(sales: Sale[]) {
  if (!sales.length) return [];
  const total = buildReport(
    sales.map((s) => ({ ...s, company: "合计" })),
    "company",
  )[0];
  const products = buildReport(sales, "product");
  const companies = buildReport(sales, "company");
  const orders = buildReport(sales, "order");
  const positiveProducts = products
    .filter((r) => r.profit !== null && r.profit > 0)
    .sort((a, b) => b.profit! - a.profit!);
  const leadingCompany = companies
    .filter((r) => r.profit !== null)
    .sort((a, b) => b.profit! - a.profit!)[0];
  const losses = orders.filter((r) => r.profit !== null && r.profit < 0);
  const lossAmount = losses.reduce((n, r) => n - r.profit!, 0);
  const incompleteOrders = orders.filter((r) => r.profit === null).length;
  const complete = total.profit !== null;
  const overview =
    `覆盖${companies.length}家公司、${orders.length}笔订单，不含税收入${money(total.revenue)}；` +
    (complete
      ? `名义利润${money(total.profit!)}，整体利润率${total.margin === null ? "不适用（收入为零）" : `${total.margin.toFixed(2)}%`}。`
      : `成本有效覆盖${total.coverage}行，暂不输出整体利润及利润率。`);
  const leaders = positiveProducts[0];
  const contribution =
    (leaders
      ? `正利润贡献最高产品为「${leaders.name}」（${money(leaders.profit!)}）`
      : "当前无可确认的正利润产品") +
    (leadingCompany && leadingCompany.profit! > 0
      ? `；公司贡献领先为「${leadingCompany.name}」（${money(leadingCompany.profit!)}）。`
      : "。") +
    (!complete ? "仅比较成本完整的分组，排名不代表全部范围。" : "");
  const risk = losses.length
    ? `已确认${losses.length}笔亏损订单，亏损额合计${money(lossAmount)}；优先逐单核对成交价与ERP行成本。`
    : "成本完整的订单未发现负名义利润；仍需关注低利润订单及成本准确性。";
  const recommendation = incompleteOrders
    ? `先补齐${incompleteOrders}笔订单的缺失成本，再评估产品和公司整体表现。`
    : leaders
      ? "结合高贡献产品的销量与库存制定销售优先级；对亏损订单核对定价与成本，确认后再调整。"
      : "优先复核成本口径和负利润产品，避免仅依据收入规模评价经营质量。";
  return [
    { label: "经营概况", text: overview },
    { label: "贡献结构", text: contribution },
    { label: "风险关注", text: risk },
    { label: "管理建议", text: recommendation },
  ];
}
