"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Alert, Button, Empty, Select, Spin, Table } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { buildAnnualReport } from "@/lib/annual-report";
import type { Sale } from "@/lib/report-model";
const Chart = dynamic(() => import("./report-chart"), { ssr: false });
const number = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
export default function AnnualReport({
  sales,
  year,
  company,
  search,
  profit,
  loading,
  error,
  demo,
  canExport,
}: {
  sales: Sale[];
  year: string;
  company: string;
  search: string;
  profit: boolean;
  loading: boolean;
  error: string;
  demo: boolean;
  canExport: boolean;
}) {
  const report = useMemo(() => buildAnnualReport(sales, year), [sales, year]);
  const [metric, setMetric] = useState<"revenue" | "qty" | "profit">("revenue");
  const selectedMetric = metric === "profit" && !profit ? "revenue" : metric;
  const label = { revenue: "销售额", qty: "销量", profit: "名义利润" }[
    selectedMetric
  ];
  const unit = selectedMetric === "qty" ? "吨" : "元";
  const products = report.products;
  const productData = products
    .filter((p) => p[selectedMetric] != null)
    .map((p) => ({ name: p.name, value: p[selectedMetric]! }));
  const negative = productData.some((p) => p.value < 0);
  const complete = products.every((p) => p[selectedMetric] != null);
  const sum = report.summary;
  const columns = [
    { title: "月份", dataIndex: "name", fixed: "left" as const, width: 80 },
    { title: "订单数", dataIndex: "orders", align: "right" as const },
    { title: "订单行数", dataIndex: "count", align: "right" as const },
    {
      title: "销售额（元）",
      dataIndex: "revenue",
      align: "right" as const,
      render: number,
    },
    {
      title: "销量（吨）",
      dataIndex: "qty",
      align: "right" as const,
      render: number,
    },
    ...(profit
      ? [
          {
            title: "名义成本（元）",
            dataIndex: "cost",
            align: "right" as const,
            render: number,
          },
          {
            title: "名义利润（元）",
            dataIndex: "profit",
            align: "right" as const,
            render: (v: number | null) => (
              <span
                style={{ color: v != null && v < 0 ? "#b3212b" : undefined }}
              >
                {number(v)}
              </span>
            ),
          },
          {
            title: "利润率",
            dataIndex: "margin",
            align: "right" as const,
            render: (v: number | null) =>
              v == null ? "—" : `${v.toFixed(2)}%`,
          },
          {
            title: "成本覆盖（行）",
            dataIndex: "coverage",
            render: (v: string) => v || "无订单",
          },
        ]
      : []),
  ];
  function download() {
    const rows = [
      [
        "月份",
        "订单数",
        "订单行数",
        "销售额（元）",
        "销量（吨）",
        ...(profit
          ? [
              "名义成本（元）",
              "名义利润（元）",
              "利润率（%）",
              "成本覆盖（行）",
            ]
          : []),
      ],
      ...report.months.map((m) => [
        m.id,
        m.orders,
        m.count,
        m.revenue,
        m.qty,
        ...(profit ? [m.cost, m.profit, m.margin, m.coverage] : []),
      ]),
    ];
    const blob = new Blob(
      [
        "\ufeff",
        rows
          .map((r) =>
            r
              .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${year}年度概览.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="annual-report" aria-label="年度概览报表">
      <header className="annual-report-heading">
        <div>
          <h2>{year}年经营概览</h2>
          <span>
            {company || "全部授权公司"} · 1月—12月 · 已审核销售订单
            {search ? " · 已应用搜索筛选" : ""}
          </span>
        </div>
        <Button
          icon={<DownloadOutlined />}
          onClick={download}
          disabled={!canExport || loading || !!error || !sum}
        >
          下载月度汇总
        </Button>
      </header>
      {loading ? (
        <div className="report-query-state" role="status">
          <Spin />
          正在计算全年订单数据…
        </div>
      ) : error ? (
        <Alert type="error" title="年度数据读取失败，请重试" />
      ) : !sum ? (
        <Empty description="本年度当前范围没有订单数据" />
      ) : (
        <>
          <div className="report-metrics">
            <div>
              <span>全年订单销售额（不含税）</span>
              <strong>
                {number(sum.revenue)}
                <small>元</small>
              </strong>
            </div>
            <div>
              <span>全年订单销量</span>
              <strong>
                {number(sum.qty)}
                <small>吨</small>
              </strong>
            </div>
            <div>
              <span>{profit ? "全年名义利润" : "全年订单数"}</span>
              <strong>
                {number(profit ? sum.profit : report.orderCount)}
                <small>{profit ? "元" : "笔"}</small>
              </strong>
            </div>
            <div>
              <span>{profit ? "全年整体利润率" : "销售产品数"}</span>
              <strong>
                {profit
                  ? sum.margin == null
                    ? "—"
                    : `${sum.margin.toFixed(2)}%`
                  : products.length}
              </strong>
            </div>
          </div>
          {profit && sum.profit === null && (
            <Alert
              showIcon
              type="warning"
              title={`成本有效覆盖${sum.coverage}行，缺失成本时不计算全年整体利润和利润率；各月独立判断覆盖。`}
            />
          )}
          <div className="annual-report-table">
            <div className="report-section-heading">
              <h2>月度经营汇总</h2>
              <span>
                订单共{report.orderCount}笔 · {sales.length}行
              </span>
            </div>
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={report.months}
              pagination={false}
              scroll={{ x: profit ? 1050 : 650 }}
            />
          </div>
          <div className="annual-charts">
            {[
              { key: "revenue", title: "月度销售额趋势", unit: "元" },
              { key: "qty", title: "月度销量趋势", unit: "吨" },
              ...(profit
                ? [{ key: "profit", title: "月度名义利润趋势", unit: "元" }]
                : []),
            ].map((chart) => (
              <section key={chart.key}>
                <h3>{chart.title}</h3>
                <Chart
                  kind="line"
                  unit={chart.unit}
                  data={report.months.map((m) => ({
                    name: m.name,
                    value:
                      ((m as Record<string, unknown>)[chart.key] as
                        number | undefined) ?? null,
                  }))}
                />
              </section>
            ))}
            <section>
              <div className="annual-product-heading">
                <h3>
                  产品{label}
                  {negative ? "分布" : "占比"}
                </h3>
                <Select
                  aria-label="产品结构指标"
                  value={selectedMetric}
                  onChange={setMetric}
                  options={[
                    { value: "revenue", label: "销售额" },
                    { value: "qty", label: "销量" },
                    ...(profit ? [{ value: "profit", label: "名义利润" }] : []),
                  ]}
                />
              </div>
              {complete && productData.length ? (
                <Chart
                  kind={negative ? "bar" : "pie"}
                  data={productData}
                  unit={unit}
                />
              ) : (
                <Empty description="单位或成本数据不完整，暂不生成完整产品结构图" />
              )}
            </section>
          </div>
          <div className="annual-report-table">
            <div className="report-section-heading">
              <h2>全年产品结构明细</h2>
              <span>占比按全年销售额计算</span>
            </div>
            <Table
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: profit ? 950 : 650 }}
              dataSource={products}
              columns={[
                { title: "产品", dataIndex: "name", width: 260 },
                {
                  title: "销售额（元）",
                  dataIndex: "revenue",
                  align: "right",
                  render: number,
                },
                {
                  title: "销量（吨）",
                  dataIndex: "qty",
                  align: "right",
                  render: number,
                },
                {
                  title: "收入占比",
                  dataIndex: "share",
                  align: "right",
                  render: (v: number) => `${v}%`,
                },
                ...(profit
                  ? [
                      {
                        title: "名义利润（元）",
                        dataIndex: "profit",
                        align: "right" as const,
                        render: number,
                      },
                      {
                        title: "利润率",
                        dataIndex: "margin",
                        align: "right" as const,
                        render: (v: number | null) =>
                          v == null ? "—" : `${v}%`,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </>
      )}
      <p className="annual-report-note">
        自然年按订单业务日期统计，不代表回款或发货；无订单月份显示“—”，不推断为已完成零业绩。销量仅汇总统一为吨的数据。
        {profit &&
          "利润＝不含税收入－ERP订单行成本，不分摊费用、未抵销内部交易；缺成本不当零成本。"}
        {demo ? "演示数据。" : "线上ERP可能包含模拟记录。"}
      </p>
    </section>
  );
}
