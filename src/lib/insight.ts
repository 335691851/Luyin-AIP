import Decimal from "decimal.js";
export type InsightContext = {
  month: string;
  year?: string;
  company?: string;
  pageTitle?: string;
};
export type InsightAnswer = {
  answer: string;
  basis: string;
  query: string;
  sample: number;
  metric?: string;
  columns?: string[];
  rows: Record<string, unknown>[];
  truncated?: boolean;
  mode?: string;
  workflow?: {
    engine: "langgraph";
    graph: "data-insight";
    steps: string[];
    planRepairs: number;
    sqlRepairs: number;
  };
};
export type InsightTurn = {
  id: string;
  question: string;
  answer: InsightAnswer;
  context: InsightContext;
  createdAt: string;
};
export type InsightConversation = {
  id: string;
  title: string;
  updatedAt: string;
};
export function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (
    typeof value !== "string" ||
    !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function resultFields(answer: InsightAnswer) {
  const columns = answer.columns?.length
    ? answer.columns
    : Object.keys(answer.rows[0] || {});
  const metrics = columns.filter(
    (key) =>
      !/(?:id$|编号|编码|序号|年份|年度|月份|日期|年月|^date$|^month$|^year$)/i.test(
        key,
      ) &&
      answer.rows.some((r) => numericValue(r[key]) !== null) &&
      answer.rows.every(
        (r) => r[key] == null || r[key] === "" || numericValue(r[key]) !== null,
      ),
  );
  const dimensions = columns.filter(
    (key) =>
      !metrics.includes(key) &&
      answer.rows.every(
        (row) => row[key] == null || typeof row[key] !== "object",
      ),
  );
  return { columns, metrics, dimensions };
}
export function questionChartData(
  answer: InsightAnswer,
  dimension: string,
  metric: string,
) {
  const values = answer.rows.map((row, index) => ({
    name: dimension ? String(row[dimension] ?? "未填写") : `第${index + 1}项`,
    value: numericValue(row[metric]),
  }));
  const duplicate = new Set(values.map((v) => v.name)).size < values.length;
  if (!duplicate) return { data: values, aggregated: false, detail: false };
  if (
    /率|占比|百分|%|单价|均价|平均|ratio|rate|percent|margin|average|avg|price/i.test(
      metric,
    )
  )
    return {
      data: values.map((v, i) => ({ ...v, name: `${v.name}（明细${i + 1}）` })),
      aggregated: false,
      detail: true,
    };
  const groups = new Map<string, { sum: Decimal; missing: boolean }>();
  for (const row of values) {
    const group = groups.get(row.name) || {
      sum: new Decimal(0),
      missing: false,
    };
    if (row.value === null) group.missing = true;
    else group.sum = group.sum.plus(row.value);
    groups.set(row.name, group);
  }
  return {
    data: [...groups].map(([name, v]) => ({
      name,
      value: v.missing ? null : v.sum.toNumber(),
    })),
    aggregated: true,
    detail: false,
  };
}
export function chartUnit(metric: string) {
  return /%|（%）/.test(metric)
    ? "%"
    : /吨/.test(metric)
      ? "吨"
      : /金额|收入|销售额|利润|成本|revenue|profit|cost|amount/i.test(metric) &&
          !/率|margin/i.test(metric)
        ? "元"
        : "";
}
export function shouldSendOnEnter(event: {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode?: number;
}) {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing &&
    event.keyCode !== 229
  );
}
