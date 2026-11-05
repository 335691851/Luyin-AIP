"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Alert, Select, Table } from "antd";
import {
  resultFields,
  questionChartData,
  chartUnit,
  type InsightAnswer,
} from "@/lib/insight";
const Chart = dynamic(() => import("./question-chart"), { ssr: false });
export default function QuestionResult({ answer }: { answer: InsightAnswer }) {
  const fields = useMemo(() => resultFields(answer), [answer]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [dimension, setDimension] = useState(
      fields.dimensions.find(
        (k) => !/(?:^id$|_id$|编号|编码|序号|单位|^unit$)/i.test(k),
      ) ||
        fields.dimensions[0] ||
        "",
    ),
    [metric, setMetric] = useState(fields.metrics[0] || "");
  const [kind, setKind] = useState("auto");
  const chartData = useMemo(
    () => questionChartData(answer, dimension, metric),
    [answer, dimension, metric],
  );
  const data = chartData.data;
  const isTime =
    /日期|月份|年月|date|month|时间|期间/i.test(dimension) ||
    (data.length > 0 &&
      data.every((r) => /^\d{4}[-/年]\d{1,2}|^\d{1,2}月$/.test(r.name)));
  const chosen =
    kind === "auto" ? (isTime && !chartData.detail ? "line" : "bar") : kind;
  const orderedData = useMemo(
    () =>
      isTime && !chartData.detail
        ? [...data].sort((a, b) =>
            a.name.localeCompare(b.name, "zh-CN", { numeric: true }),
          )
        : data,
    [data, isTime, chartData.detail],
  );
  const pieValid =
    data.every((r) => r.value !== null && r.value >= 0) &&
    data.some((r) => (r.value || 0) > 0);
  const unitField = fields.columns.find((k) =>
    /^(单位|计量单位|unit|uom)$/i.test(k),
  );
  const mixedUnits =
    !!unitField &&
    /数量|销量|重量|qty|volume/i.test(metric) &&
    new Set(answer.rows.map((r) => String(r[unitField] ?? "未映射"))).size > 1;
  return (
    <div className="question-result">
      {answer.rows.length > 0 && (
        <Table
          aria-label="问数结果表格"
          rowKey="index"
          size="small"
          dataSource={answer.rows.map((cells, index) => ({ cells, index }))}
          columns={fields.columns.map((key) => ({
            title: key,
            key,
            width: Math.min(260, Math.max(120, key.length * 15)),
            render: (_: unknown, row: { cells: Record<string, unknown> }) => {
              const value = row.cells[key];
              return value == null
                ? "—"
                : typeof value === "number"
                  ? value.toLocaleString("zh-CN", { maximumFractionDigits: 4 })
                  : typeof value === "object"
                    ? JSON.stringify(value)
                    : String(value);
            },
          }))}
          pagination={{
            ...pagination,
            total: answer.rows.length,
            onChange: (current, pageSize) =>
              setPagination({
                current: pageSize !== pagination.pageSize ? 1 : current,
                pageSize,
              }),
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total, range) =>
              `${range[0]}–${range[1]} / 共 ${total} 行`,
            responsive: true,
          }}
          scroll={{ x: "max-content" }}
        />
      )}
      {fields.metrics.length > 0 && data.length > 0 && (
        <section className="question-chart-section" aria-label="查询结果图表">
          <div className="question-chart-controls">
            {fields.dimensions.length > 0 && (
              <label>
                分组
                <Select
                  aria-label="图表分组"
                  value={dimension}
                  onChange={setDimension}
                  options={fields.dimensions.map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </label>
            )}
            <label>
              指标
              <Select
                aria-label="图表指标"
                value={metric}
                onChange={setMetric}
                options={fields.metrics.map((v) => ({ value: v, label: v }))}
              />
            </label>
            <label>
              图形
              <Select
                aria-label="图形类型"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "auto", label: "智能选择" },
                  { value: "line", label: "折线图" },
                  { value: "bar", label: "条形图" },
                  { value: "column", label: "柱状图" },
                  { value: "pie", label: "占比图", disabled: !pieValid },
                ]}
              />
            </label>
          </div>
          {mixedUnits ? (
            <Alert
              type="info"
              title="数量结果含不同计量单位，请按单位筛选后作图。"
            />
          ) : chosen === "pie" && !pieValid ? (
            <Alert
              type="info"
              title="包含负值、缺失值或合计为零，请使用条形图或折线图。"
            />
          ) : (
            <Chart
              kind={chosen as "bar" | "column" | "line" | "pie"}
              data={orderedData}
              metric={metric}
              unit={chartUnit(metric)}
            />
          )}
          <small>
            图表范围：本次结果全部 {answer.rows.length} 行
            {chartData.aggregated
              ? ` · 按${dimension}汇总为${data.length}组`
              : chartData.detail
                ? " · 同组比率/均价保留明细，不直接求和或平均"
                : ""}
            {answer.truncated
              ? "（查询达到展示上限，请缩小范围获取完整结果）"
              : ""}
            {!pieValid ? " · 负值或缺失值不生成占比图" : ""}
          </small>
        </section>
      )}
    </div>
  );
}
