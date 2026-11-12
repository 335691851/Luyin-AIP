"use client";
import Link from "next/link";
import { useMemo } from "react";
import {
  governanceBusinessDomains,
  governanceOrigin,
  rectificationSummary,
} from "@/lib/governance-relations";
import type { GovernanceItem } from "@/lib/governance-workflow";

export default function GovernanceRelationshipPanel({
  page,
  rows,
}: {
  page: string;
  rows: GovernanceItem[];
}) {
  const domain = governanceBusinessDomains.find((d) => d.page === page);
  const data = useMemo(() => {
    const tasks = rows.filter((r) => r.item_kind === "rectification");
    return {
      summary: rectificationSummary(tasks),
      unlinked: tasks.filter((r) => !governanceOrigin(r, rows)).length,
      domains: governanceBusinessDomains.map((d) => ({
        ...d,
        pending: rows.filter(
          (r) =>
            r.item_kind === "action" &&
            r.category === d.category &&
            !["已归档", "已闭环", "已驳回"].includes(r.status),
        ).length,
        rectifications: tasks.filter(
          (r) =>
            governanceOrigin(r, rows)?.category === d.category &&
            !["已归档", "已闭环"].includes(r.status),
        ).length,
      })),
    };
  }, [rows]);
  if (!domain && page !== "rectification") return null;
  return (
    <section
      className="governance-relationship-panel"
      aria-label="治理业务与整改闭环关系"
    >
      <div className="governance-relation-layout">
        <div>
          <b className="governance-level-label">
            治理环节 · 按事项选择适用办理
          </b>
          <nav className="governance-domain-links" aria-label="治理业务类型">
            {data.domains.map((d) => (
              <Link
                key={d.page}
                href={`/governance/${d.page}`}
                aria-current={page === d.page ? "page" : undefined}
                className={page === d.page ? "active" : ""}
              >
                <span className="governance-domain-role">{d.role}</span>
                <b>{d.category}</b>
                <small>
                  待办 {d.pending} · 未闭环整改 {d.rectifications}
                </small>
              </Link>
            ))}
          </nav>
        </div>
        <div className="governance-relation-arrow" aria-hidden="true">
          →<small>发现问题</small>
        </div>
        <div>
          <b className="governance-level-label">共用闭环层 · 跨业务处理</b>
          <Link
            className={`governance-closure-link ${page === "rectification" ? "active" : ""}`}
            href="/governance/rectification"
            aria-current={page === "rectification" ? "page" : undefined}
          >
            <b>问题整改与验收</b>
            <small>
              未闭环 {data.summary.open} · 待验收 {data.summary.review} · 已闭环{" "}
              {data.summary.complete}
              {data.unlinked > 0 && <> · 来源待核实 {data.unlinked}</>}
            </small>
          </Link>
        </div>
      </div>
      <p className="muted">
        授权界定权限，重大事项落实决策程序，会议记录决议与履职，自查核验各环节；审核确认的问题统一进入整改与验收，各环节不要求逐项走完。
      </p>
      <p>
        <strong>
          {domain
            ? `${domain.category}：${domain.purpose}`
            : "问题整改：接续原业务的审核发现，补正证据并完成验收"}
        </strong>
      </p>
      <p className="muted">
        {domain
          ? `办理关注：${domain.focus}。上传材料后审核，确认问题并退回整改时生成关联任务；智能核查只提供建议。`
          : "四类业务及集团交办的问题汇入此处。每项整改应关联原事项、记录责任与期限；提交整改证据后，由公司或集团按来源验收，全部关联整改关闭后原事项方可归档。"}
      </p>
    </section>
  );
}
