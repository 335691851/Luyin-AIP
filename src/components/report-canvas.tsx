"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Drawer, Empty, Table, Tag, Alert, Spin } from "antd";
import { DownloadOutlined, BarChartOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { buildReport } from "@/lib/report-model";
import type { Sale, ReportRow, Dimension } from "@/lib/report-model";
const DailySalesReport = dynamic(() => import("./daily-sales-report"));
const Chart = dynamic(() => import("./report-chart"), {
  ssr: false,
  loading: () => <div className="report-chart chart-loading">图表载入中</div>,
});
const fmt = (v: number | null) =>
  v === null
    ? "—"
    : v.toLocaleString("zh-CN", {
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      });
const salesTemplates = [
  {
    id: "company",
    label: "销售月报",
    dimension: "company",
    subtitle: "各法人销售规模与产品结构对照",
  },
  {
    id: "category",
    label: "产品分类报表",
    dimension: "category",
    subtitle: "按产品类型汇总，观察销售结构",
  },
  {
    id: "date",
    label: "每日销售日报",
    dimension: "date",
    subtitle: "按品种统计本日、当月和当年累计订单量",
  },
] as const;
const profitTemplates = [
  {
    id: "order",
    label: "订单利润明细",
    dimension: "order",
    subtitle: "按订单汇总收入、ERP订单行成本、名义利润及利润率",
  },
  {
    id: "product",
    label: "产品利润贡献",
    dimension: "product",
    subtitle: "以产品为核心，观察名义利润及结构贡献",
  },
  {
    id: "company",
    label: "法人利润对照",
    dimension: "company",
    subtitle: "各法人名义利润、利润率及成本覆盖对照",
  },
] as const;
export default function ReportCanvas({
  variant,
  sales,
  month,
  company,
  search,
  demo,
  loading,
  canExport = true,
  errorMessage = "",
  latestMonth,
  onLatest,
}: {
  variant: "sales" | "profit";
  sales: Sale[];
  month: string;
  company: string;
  search: string;
  demo: boolean;
  loading: boolean;
  canExport?: boolean;
  errorMessage?: string;
  latestMonth?: string | null;
  onLatest?: () => void;
}) {
  const [choice, setChoice] = useState(
    variant === "profit" ? "product" : "company",
  );
  const [drill, setDrill] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false),
    [downloadError, setDownloadError] = useState("");
  const templates = variant === "profit" ? profitTemplates : salesTemplates;
  const template = templates.find((t) => t.id === choice) || templates[0];
  const daily = variant === "sales" && template.id === "date";
  const rows = useMemo(
    () => buildReport(sales, template.dimension as Dimension),
    [sales, template.dimension],
  );
  const total = useMemo(
    () =>
      buildReport(
        sales.map((s) => ({ ...s, company: "总计" })),
        "company",
      )[0],
    [sales],
  );
  const focus = variant === "profit";
  const allCovered = rows.every((r) => r.profit !== null);
  const names: Record<string, string> = {
    company: "法人名称",
    category: "产品类型",
    region: "销售区域",
    product: "产品名称",
    date: "业务日期",
    order: "订单编号",
  };
  const columns: ColumnsType<ReportRow> = [
    {
      title: "序号",
      key: "index",
      width: 50,
      align: "center",
      render: (_, __, i) => i + 1,
    },
    {
      title: names[template.dimension],
      dataIndex: "name",
      width: 180,
      fixed: "left",
      render: (v) => <strong className="report-row-name">{v}</strong>,
    },
    {
      title: "订单业绩",
      children: [
        {
          title: "数量（吨）",
          dataIndex: "qty",
          sorter: (a, b) => (a.qty ?? -Infinity) - (b.qty ?? -Infinity),
          align: "right",
          width: 100,
          render: fmt,
        },
        {
          title: "不含税收入（元）",
          dataIndex: "revenue",
          sorter: (a, b) => a.revenue - b.revenue,
          align: "right",
          width: 145,
          render: fmt,
        },
      ],
    },
    ...(focus
      ? [
          {
            title: "名义利润测算",
            children: [
              {
                title: "名义成本（元）",
                dataIndex: "cost",
                align: "right" as const,
                width: 125,
                render: fmt,
              },
              {
                title: "名义利润（元）",
                dataIndex: "profit",
                align: "right" as const,
                width: 130,
                render: (v: number | null) => (
                  <b className="brand-text">{fmt(v)}</b>
                ),
              },
              {
                title: "利润率",
                dataIndex: "margin",
                align: "right" as const,
                width: 85,
                render: (v: number | null) =>
                  v === null ? "—" : `${v.toFixed(2)}%`,
              },
            ],
          },
        ]
      : [
          {
            title: "结构分析",
            children: [
              {
                title: "收入占比",
                dataIndex: "share",
                align: "right" as const,
                width: 95,
                render: (v: number) => (
                  <div className="share-cell">
                    <span>{v.toFixed(1)}%</span>
                    <i style={{ width: `${Math.max(v, 1)}%` }} />
                  </div>
                ),
              },
              {
                title: "平均单价（元/吨）",
                dataIndex: "avgPrice",
                align: "right" as const,
                width: 135,
                render: fmt,
              },
            ],
          },
        ]),
    {
      title: focus ? "成本覆盖" : "订单行数",
      dataIndex: focus ? "coverage" : "count",
      align: "right",
      width: 85,
    },
  ];
  const drillRows =
    drill === null
      ? []
      : sales.filter(
          (s) =>
            (template.dimension === "order"
              ? `${s.company} / ${s.number || s.id}`
              : s[template.dimension]) === drill,
        );
  const drillColumns: ColumnsType<Sale> = [
    { title: "订单 / 行号", dataIndex: "id", width: 210 },
    { title: "业务日期", dataIndex: "date", width: 110 },
    { title: "法人", dataIndex: "company", width: 230 },
    { title: "产品", dataIndex: "product", width: 200 },
    {
      title: "原始数量",
      dataIndex: "qty",
      align: "right",
      width: 110,
      render: fmt,
    },
    { title: "单位", dataIndex: "unit", width: 70 },
    {
      title: "不含税收入（元）",
      dataIndex: "revenue",
      align: "right",
      width: 150,
      render: fmt,
    },
    {
      title: "单据状态",
      dataIndex: "status",
      width: 100,
      render: (v) =>
        ({ approved: "已审核", posted: "已记账", closed: "已关闭" })[
          v as string
        ] || v,
    },
  ];
  if (focus)
    drillColumns.push(
      {
        title: "ERP订单行成本（元）",
        width: 160,
        render: (_, r) =>
          fmt(
            r.costAmount ?? (r.unitCost === null ? null : r.qty * r.unitCost),
          ),
      },
      {
        title: "订单行名义利润（元）",
        width: 180,
        render: (_, r) =>
          fmt(
            r.unitCost === null
              ? null
              : r.revenue - (r.costAmount ?? r.qty * r.unitCost),
          ),
      },
    );
  columns.push({
    title: "追溯",
    key: "trace",
    width: 90,
    render: (_, row) => (
      <Button type="link" size="small" onClick={() => setDrill(row.name)}>
        订单明细
      </Button>
    ),
  });
  const chartData = useMemo(
    () =>
      rows
        .filter((r) => !focus || r.profit !== null)
        .map((r) => ({ name: r.name, value: focus ? r.profit! : r.revenue })),
    [rows, focus],
  );
  const marginComparison = focus && template.dimension === "company";
  const chartRanking = marginComparison
    ? rows
        .filter((r) => r.margin !== null)
        .map((r) => ({ name: r.name, value: r.margin! }))
    : chartData;
  const download = async () => {
    if (!canExport) return;
    setExporting(true);
    setDownloadError("");
    try {
      const r = await fetch(
        `/api/export?${new URLSearchParams({ month, company, search, report: template.dimension, variant })}`,
      );
      if (!r.ok) throw Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${month}-${template.label}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className={`report-studio report-${variant}`}>
      <div className="report-template-bar">
        <div
          role="tablist"
          aria-label={focus ? "利润报表模板" : "销售报表模板"}
        >
          {templates.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={template.id === t.id}
              onClick={() => {
                setChoice(t.id);
                setDrill(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!daily && (
          <Button
            icon={<DownloadOutlined aria-hidden />}
            loading={exporting}
            disabled={!canExport || loading || !!errorMessage || !sales.length}
            onClick={download}
          >
            下载报表
          </Button>
        )}
      </div>
      {daily ? (
        <DailySalesReport
          month={month}
          company={company}
          search={search}
          latestDay={
            sales
              .map((s) => s.date)
              .sort()
              .at(-1) || ""
          }
          canExport={canExport}
        />
      ) : loading ? (
        <div className="report-query-state" role="status">
          <Spin />
          <b>正在读取ERP并计算报表…</b>
          <span>条件变更后自动更新表格、汇总和图表</span>
        </div>
      ) : errorMessage ? (
        <Alert
          type="error"
          showIcon
          title="报表计算未完成"
          description={errorMessage}
        />
      ) : (
        <section className="report-paper">
          {!sales.length && (
            <Alert
              className="report-quality-note"
              type="info"
              showIcon
              title={`${month} · ${company || "全部授权法人"}在当前条件下没有已审核销售订单`}
              description={
                search
                  ? "请调整搜索关键词或筛选条件，系统会自动重新计算。"
                  : "这是所选期间的查询结果，不是计算失败。请选择有数据的月份。"
              }
              action={
                latestMonth && latestMonth !== month && onLatest ? (
                  <Button onClick={onLatest}>
                    查看最近有数据月份 {latestMonth}
                  </Button>
                ) : undefined
              }
            />
          )}
          <header className="report-paper-heading">
            <div className="report-heading-summary">
              <h1>{template.label}</h1>
              <p>{template.subtitle}</p>
            </div>
            <div className="report-stamp">
              <Tag color={demo ? "gold" : "default"}>
                {demo ? "演示报表" : "授权数据"}
              </Tag>
            </div>
          </header>
          <div className="report-meta">
            <span>
              统计期间 <b>{month} 自然月</b>
            </span>
            <span>
              组织范围 <b>{company || "全部授权法人"}</b>
            </span>
            <span>
              数据口径 <b>已审核销售订单</b>
            </span>
          </div>
          <div className="report-metrics">
            <div>
              <span>不含税订单收入</span>
              <strong>
                {fmt(total?.revenue ?? 0)}
                <small>元</small>
              </strong>
            </div>
            <div>
              <span>{focus ? "订单名义利润" : "订单销量"}</span>
              <strong>
                {fmt(focus ? (total?.profit ?? null) : (total?.qty ?? null))}
                <small>{focus ? "元" : "吨"}</small>
              </strong>
            </div>
            <div>
              <span>{focus ? "整体利润率" : "本期订单行数"}</span>
              <strong>
                {focus
                  ? total?.margin == null
                    ? "—"
                    : `${total.margin.toFixed(2)}%`
                  : sales.length}
                <small>{focus ? "" : "行"}</small>
              </strong>
            </div>
            <div>
              <span>{focus ? "成本有效覆盖" : "收入分组数"}</span>
              <strong>
                {focus ? (total?.coverage ?? "0/0") : rows.length}
                <small>{focus ? "行" : "组"}</small>
              </strong>
            </div>
          </div>
          {!demo && sales.some((s) => s.product.includes("模拟")) && (
            <Alert
              className="report-quality-note"
              type="info"
              showIcon
              title="源ERP含标注为“模拟”的产品记录；当前为线上源库计算结果，不代表已核实的实际经营业绩"
            />
          )}
          {focus && total && total.profit === null && (
            <Alert
              className="report-quality-note"
              type="warning"
              showIcon
              title={`有效成本覆盖 ${total.coverage} 行，缺成本分组不计算利润及利润率`}
            />
          )}
          <div className="report-body">
            <div className="report-table-area">
              <div className="report-section-heading">
                <h2>{focus ? "名义利润结构明细" : "销售业绩与结构明细"}</h2>
                <span>单位：吨 / 元</span>
              </div>
              <Table<ReportRow>
                rowKey="id"
                bordered
                size="small"
                columns={columns}
                dataSource={rows}
                loading={loading}
                pagination={false}
                scroll={{ x: focus ? 1090 : 940, y: 480 }}
                sticky
                rowClassName={(_, index) => (index % 2 ? "report-stripe" : "")}
                summary={() =>
                  total ? (
                    <Table.Summary>
                      <Table.Summary.Row className="report-total">
                        <Table.Summary.Cell index={0} colSpan={2}>
                          合计
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          {fmt(total.qty)}
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          {fmt(total.revenue)}
                        </Table.Summary.Cell>
                        {focus ? (
                          <>
                            <Table.Summary.Cell index={4} align="right">
                              {fmt(total.cost)}
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={5} align="right">
                              {fmt(total.profit)}
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={6} align="right">
                              {total.margin === null
                                ? "—"
                                : `${total.margin.toFixed(2)}%`}
                            </Table.Summary.Cell>
                          </>
                        ) : (
                          <>
                            <Table.Summary.Cell index={4} align="right">
                              {total.revenue ? "100%" : "—"}
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={5} align="right">
                              {fmt(total.avgPrice)}
                            </Table.Summary.Cell>
                          </>
                        )}
                        <Table.Summary.Cell index={focus ? 7 : 6} align="right">
                          {focus ? total.coverage : sales.length}
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={focus ? 8 : 7} />
                      </Table.Summary.Row>
                    </Table.Summary>
                  ) : null
                }
              />
              <div className="report-footnotes">
                <b>报表说明</b>
                <p>
                  {focus
                    ? "名义利润＝订单不含税收入－ERP订单行成本（cost_cents÷100）；不分摊费用。可按订单追溯；法人汇总未抵销内部交易。"
                    : "销售统计按订单业务日期归属自然月；产品子分类不重复计入父级合计。"}{" "}
                  数量仅在来源单位已统一为吨时汇总。
                </p>
                <p>
                  {demo
                    ? "本地演示样例，非企业实际经营数据。"
                    : "按所选自然月与授权法人读取订单；超出在线明细上限时明确提示，不提供截断汇总。"}
                </p>
              </div>
            </div>
            <aside className="report-visuals">
              <section>
                <div className="report-section-heading">
                  <h2>
                    {focus
                      ? chartData.some((d) => d.value < 0)
                        ? "盈亏分布（含负利润）"
                        : "利润贡献分布"
                      : "收入结构占比"}
                  </h2>
                  <BarChartOutlined aria-hidden />
                </div>
                {chartData.length && (!focus || allCovered) ? (
                  <Chart
                    kind={
                      focus && chartData.some((d) => d.value < 0)
                        ? "bar"
                        : "pie"
                    }
                    data={
                      focus && chartData.some((d) => d.value < 0)
                        ? [...chartData]
                            .sort(
                              (a, b) => Math.abs(b.value) - Math.abs(a.value),
                            )
                            .slice(0, 15)
                        : chartData
                    }
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      rows.length
                        ? "成本数据尚不完整，暂不展示利润分布"
                        : "当前筛选条件下无订单数据"
                    }
                  />
                )}
              </section>
              <section>
                <div className="report-section-heading">
                  <h2>
                    {marginComparison
                      ? "法人利润率对照"
                      : focus
                        ? "名义利润排名"
                        : "销售收入排名"}
                  </h2>
                  <span>TOP 5</span>
                </div>
                {chartRanking.length ? (
                  <Chart
                    kind={
                      marginComparison || template.dimension === "date"
                        ? "column"
                        : "bar"
                    }
                    unit={marginComparison ? "%" : "元"}
                    data={[...chartRanking]
                      .sort((a, b) => b.value - a.value)
                      .slice(0, 5)}
                  />
                ) : (
                  <Empty
                    description={
                      rows.length
                        ? "待有效成本映射"
                        : "当前筛选条件下无订单数据"
                    }
                  />
                )}
              </section>
              <div className="report-reading">
                <span>读数提示</span>
                <p>
                  {rows.length
                    ? `当前按${names[template.dimension]}分为${rows.length}组。图形与明细表使用同一份汇总结果，可随报表筛选同步更新。`
                    : "当前范围没有可统计数据。"}
                </p>
              </div>
            </aside>
          </div>
          <footer className="report-paper-footer">
            <span>LUYAN / {focus ? "订单名义利润" : "营销数据"}分析</span>
            <span>来源可追溯 · 口径可复核</span>
          </footer>
        </section>
      )}
      <Drawer
        title={`${drill || ""} · 订单来源明细`}
        open={drill !== null}
        onClose={() => setDrill(null)}
        size="large"
        styles={{ wrapper: { width: "min(1180px, 100vw)" } }}
      >
        <p className="report-drill-meta">
          {month} 自然月 · {drillRows.length} 行 · 不含税收入{" "}
          {fmt(drillRows.reduce((sum, row) => sum + row.revenue, 0))} 元
        </p>
        <Table<Sale>
          className="report-source-table"
          rowKey="id"
          columns={drillColumns}
          dataSource={drillRows}
          size="small"
          bordered
          scroll={{ x: 1180 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (n) => `共 ${n} 行`,
          }}
        />
        <p className="muted">
          原始数量按来源单位显示；已审核、已记账、已关闭的销售订单纳入统计。这里只读追溯，不修改ERP。
        </p>
      </Drawer>
      {downloadError && <p role="alert">{downloadError}</p>}
    </div>
  );
}
