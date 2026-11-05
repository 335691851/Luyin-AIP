"use client";
import { useMemo } from "react";
import { BulbOutlined } from "@ant-design/icons";
import { profitInsight } from "@/lib/profit-insight";
import type { Sale } from "@/lib/report-model";

export default function ProfitInsight({
  sales,
  month,
  company,
  search,
  loading,
  error,
  demo,
}: {
  sales: Sale[];
  month: string;
  company: string;
  search: string;
  loading: boolean;
  error: string;
  demo: boolean;
}) {
  const insights = useMemo(() => profitInsight(sales), [sales]);
  return (
    <section
      className="profit-insight"
      aria-label="集团名义利润洞察报告"
      aria-busy={loading}
    >
      <div className="profit-insight-heading">
        <h2>
          <BulbOutlined aria-hidden />
          {company ? "公司经营洞察" : "集团经营洞察"}
        </h2>
        <span>
          {month} · {company || "全部授权公司"}
          {search ? " · 已应用搜索筛选" : ""}
        </span>
      </div>
      {loading ? (
        <p role="status">正在根据当前报表数据更新洞察…</p>
      ) : error ? (
        <p>报表数据读取失败，洞察暂不可用。</p>
      ) : !insights.length ? (
        <p>当前筛选范围暂无订单，无法形成利润洞察。</p>
      ) : (
        <div className="profit-insight-grid">
          {insights.map((item) => (
            <p key={item.label}>
              <b>{item.label}</b>
              {item.text}
            </p>
          ))}
        </div>
      )}
      <small>
        基于当前报表规则计算 ·
        订单收入减行成本，不分摊费用、未抵销内部交易，非合并财务利润
        {demo ? " · 演示样例" : " · 源ERP可能含模拟记录"}
      </small>
    </section>
  );
}
