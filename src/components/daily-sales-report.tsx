"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Input, Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { DailyRow } from "@/lib/daily-sales";
type Data = {
  rows: DailyRow[];
  total: DailyRow;
  breakdown: DailyRow[];
  date: string;
  monthStart: string;
  yearStart: string;
  company: string;
  loadedAt: string;
  counts: { day: number; month: number; year: number };
};
const fmt = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
export default function DailySalesReport({
  month,
  company,
  search,
  latestDay,
  canExport,
}: {
  month: string;
  company: string;
  search: string;
  latestDay: string;
  canExport: boolean;
}) {
  const [date, setDate] = useState(""),
    [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  const activeDate = date.startsWith(month)
    ? date
    : latestDay.startsWith(month)
      ? latestDay
      : `${month}-01`;
  const lastDay = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  useEffect(() => {
    const ctrl = new AbortController();
    setBusy(true);
    setData(null);
    setError("");
    fetch(
      `/api/reports/daily?${new URLSearchParams({ date: activeDate, company, search })}`,
      { cache: "no-store", signal: ctrl.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        if (!ctrl.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setBusy(false);
      });
    return () => ctrl.abort();
  }, [activeDate, company, search]);
  const columns: ColumnsType<DailyRow> = [
    {
      title: "分类",
      dataIndex: "category",
      width: 160,
      onCell: (r, i) => {
        if (i === undefined) return {};
        const arr = data?.rows || [];
        if (i > 0 && arr[i - 1].category === r.category) return { rowSpan: 0 };
        let count = 1;
        while (i + count < arr.length && arr[i + count].category === r.category)
          count++;
        return { rowSpan: count };
      },
    },
    { title: "品种", dataIndex: "variety", width: 230 },
    ...(["day", "month", "year"] as const).map((key, i) => ({
      title: ["本日合计", "本月累计", "本年累计"][i],
      dataIndex: key,
      align: "right" as const,
      width: 190,
      render: fmt,
    })),
  ];
  const download = async () => {
    setExporting(true);
    try {
      const r = await fetch(
        `/api/reports/daily?${new URLSearchParams({ date: activeDate, company, search, format: "xlsx" })}`,
      );
      if (!r.ok) throw Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `销售日报表-${activeDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    } finally {
      setExporting(false);
    }
  };
  return (
    <section className="report-paper daily-sales-report">
      <div className="daily-date-tools">
        <label>
          日报日期{" "}
          <Input
            type="date"
            aria-label="日报日期"
            value={activeDate}
            min={`${month}-01`}
            max={`${month}-${lastDay}`}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <span>在上方业务月份内选择日期，自动计算本日、月累计和年累计</span>
        <Button
          disabled={!canExport || busy || !data}
          loading={exporting}
          onClick={() => void download()}
        >
          下载日报
        </Button>
      </div>
      <header className="daily-paper-title">
        <h2>销售日报表</h2>
        <div>
          <span>单位：{company || "全部授权法人"}</span>
          <b>时间：{activeDate}</b>
          <span>数量单位：吨</span>
        </div>
      </header>
      {error && <Alert type="error" title={error} showIcon />}
      <Spin spinning={busy} tip="正在按所选日期计算全年订单…">
        <div className="report-table-area">
          <Table<DailyRow>
            rowKey="id"
            columns={columns}
            dataSource={data?.rows || []}
            bordered
            size="small"
            pagination={false}
            scroll={{ x: 900 }}
            summary={() =>
              data ? (
                <Table.Summary.Row className="report-total">
                  <Table.Summary.Cell index={0} colSpan={2}>
                    合计
                  </Table.Summary.Cell>
                  {(["day", "month", "year"] as const).map((k, i) => (
                    <Table.Summary.Cell index={i + 2} align="right" key={k}>
                      {fmt(data.total[k])}
                    </Table.Summary.Cell>
                  ))}
                </Table.Summary.Row>
              ) : null
            }
          />
          <h3 className="daily-breakdown-heading">
            其中：盐源与包装结构（不重复计入合计）
          </h3>
          <Table<DailyRow>
            rowKey="id"
            columns={columns.map((c, i) =>
              i === 0
                ? {
                    ...c,
                    onCell: (_: DailyRow, index?: number) => ({
                      rowSpan: index === 0 ? data?.breakdown.length || 1 : 0,
                    }),
                  }
                : c,
            )}
            dataSource={data?.breakdown || []}
            bordered
            size="small"
            pagination={false}
            scroll={{ x: 900 }}
          />
          <div className="report-footnotes">
            <p>
              按已审核销售订单统计，包含已记账、已关闭状态。本月累计：
              {data?.monthStart || `${month}-01`}至{activeDate}；本年累计：
              {data?.yearStart || `${month.slice(0, 4)}-01-01`}至{activeDate}
              。所选日期后发生的订单不计入。
            </p>
            <p>
              分类、盐源和包装来自ERP字段，不按产品名称推断。源库标注为模拟的记录仍按源数据统计，需核实来源真实性。缺少吨单位的数据不折算，显示“—”；“其中”与主表交叉，仅作结构分析。
              {search && `当前关键词：${search}。`}
            </p>
            {data && (
              <p>
                订单行数：本日{data.counts.day} / 本月{data.counts.month} / 本年
                {data.counts.year}。读取时间：
                {new Date(data.loadedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </p>
            )}
          </div>
        </div>
      </Spin>
    </section>
  );
}
