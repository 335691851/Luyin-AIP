import Decimal from "decimal.js";

export type ReviewStatus = "待审核" | "已通过" | "已驳回" | "待补正";
export function nominalProfit(
  revenue: string | number,
  quantity: string | number,
  unitCost: string | number | null,
) {
  if (unitCost === null) return { cost: null, profit: null, margin: null };
  const r = new Decimal(revenue),
    c = new Decimal(quantity).mul(unitCost),
    p = r.minus(c);
  return {
    cost: c.toFixed(2),
    profit: p.toFixed(2),
    margin: r.isZero() ? null : p.div(r).mul(100).toFixed(2),
  };
}
export function monthCutoff(date: string, months = 3) {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}
export function isTailStock(
  today: string,
  firstReceived: string | null,
  quantity: number,
) {
  return (
    firstReceived !== null &&
    firstReceived < monthCutoff(today) &&
    quantity > 0 &&
    quantity < 0.5
  );
}
export function frameCoversYear(
  year: number,
  start: string,
  end: string,
  confirmed: boolean,
  annual: boolean,
) {
  return (
    confirmed && annual && start <= `${year}-01-01` && end >= `${year}-12-31`
  );
}
export function aggregateReview(statuses: ReviewStatus[]) {
  if (!statuses.length) return "草稿";
  if (statuses.some((x) => x === "待审核" || x === "待补正")) return "处理中";
  if (statuses.every((x) => x === "已通过")) return "全部通过";
  return statuses.some((x) => x === "已通过") ? "部分通过" : "已结束";
}
export function requireReview(status: ReviewStatus, comment: string) {
  if (status !== "待审核") throw new Error("仅待审核明细可以审批");
  if (!comment.trim()) throw new Error("请填写审批意见");
}
export function shanghaiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
