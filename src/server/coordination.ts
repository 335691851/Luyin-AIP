import "server-only";
import { createHash } from "node:crypto";
import { erpDb, appDb } from "./db";
import { identity } from "./auth";
import { can } from "@/lib/access";
import { monthCutoff, shanghaiToday } from "@/lib/domain";
import type {
  CoordinationCandidate,
  CoordinationEvent,
} from "@/lib/coordination";
export async function coordinationUser(write = false) {
  const user = await identity();
  if (!can(user.access, write ? "coordination.feedback" : "coordination.view"))
    throw Error("FORBIDDEN");
  if (user.access.role.id === "marketing_operator")
    throw Error("DEPARTMENT_MAPPING_REQUIRED");
  return user;
}
export async function coordinationData(
  user: Awaited<ReturnType<typeof coordinationUser>>,
  company?: string,
) {
  const day = shanghaiToday(),
    cutoff = monthCutoff(day),
    allIds = user.companyIds;
  if (company && !user.access.companies.includes(company))
    throw Error("FORBIDDEN");
  const selected = company
    ? await erpDb()`select id from public.company where id=any(${allIds}::int[]) and name=${company}`
    : null;
  const ids = selected ? selected.map((r) => Number(r.id)) : allIds;
  const raw = await erpDb().begin(async (t) => {
    await t`set transaction read only`;
    await t`set local statement_timeout='15000'`;
    const tail =
      await t`with balances as (select b.company_id,b.material_id,b.lot_id,sum(b.qty) as qty,sum(b.reserved_qty) as reserved from public.stock_balance b join public.material m on m.id=b.material_id join public.uom u on u.id=m.uom_id where b.company_id=any(${ids}::int[]) and m.kind='product' and u.name='吨' group by b.company_id,b.material_id,b.lot_id having sum(b.qty)>0 and sum(b.qty)<0.5), receipts as (select company_id,material_id,lot_id,min(posted_on) as first_date from public.stock_transaction where qty_delta>0 and company_id=any(${ids}::int[]) group by company_id,material_id,lot_id) select b.*,r.first_date,c.name as company,m.name as product,l.lot_no from balances b join receipts r using(company_id,material_id,lot_id) join public.company c on c.id=b.company_id join public.material m on m.id=b.material_id join public.lot l on l.id=b.lot_id where r.first_date < ${cutoff} order by r.first_date,b.company_id,b.material_id,b.lot_id limit 101`;
    const clear =
      await t`with orders as (select d.company_id,l.material_id,sum(l.qty) as ordered from public.document d join public.document_line l on l.document_id=d.id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.company_id=any(${ids}::int[]) and d.bill_date::date >= ${day}::date - interval '30 days' and d.bill_date::date < ${day}::date group by d.company_id,l.material_id), balances as (select b.company_id,b.material_id,sum(b.qty) as qty,sum(b.reserved_qty) as reserved from public.stock_balance b join public.material m on m.id=b.material_id join public.uom u on u.id=m.uom_id where b.company_id=any(${ids}::int[]) and m.kind='product' and u.name='吨' group by b.company_id,b.material_id having sum(b.qty-b.reserved_qty)>0) select b.*,coalesce(o.ordered,0) as ordered,c.name as company,m.name as product from balances b left join orders o using(company_id,material_id) join public.company c on c.id=b.company_id join public.material m on m.id=b.material_id where coalesce(o.ordered,0)<=0 or greatest(b.qty-b.reserved,0)>o.ordered*2 order by b.company_id,b.material_id limit 101`;
    const dates =
      await t`select company_id,max(posted_on) as last_posted from public.stock_transaction where company_id=any(${ids}::int[]) group by company_id`;
    return { tail, clear, dates };
  });
  const candidates: CoordinationCandidate[] = [];
  for (const kind of ["tail", "clear"] as const)
    for (const r of raw[kind].slice(0, 100)) {
      const qty = Number(r.qty),
        reserved = Number(r.reserved),
        available = Math.max(0, qty - reserved),
        ordered = Number(r.ordered || 0);
      candidates.push({
        evidenceKey: "",
        id: `${day}:${kind}:${r.company_id}:${r.material_id}:${kind === "tail" ? r.lot_id : "all"}`,
        kind,
        companyId: Number(r.company_id),
        company: r.company,
        product: r.product,
        qty,
        facts:
          kind === "tail"
            ? [
                ["批次", r.lot_no],
                ["最早可查正向入库", r.first_date],
                ["实物余额", `${qty.toFixed(3)} 吨`],
                ["已占用", `${reserved.toFixed(3)} 吨`],
              ]
            : [
                ["实物余额", `${qty.toFixed(3)} 吨`],
                ["已占用", `${reserved.toFixed(3)} 吨`],
                ["账面可用", `${available.toFixed(3)} 吨`],
                ["近30日审核订单量", `${ordered.toFixed(3)} 吨`],
                [
                  "订单覆盖天数",
                  ordered > 0
                    ? `${((available / ordered) * 30).toFixed(1)} 天`
                    : "无近期订单，不能计算覆盖天数",
                ],
              ],
        formula:
          kind === "tail"
            ? `最早可查正向入库日 < ${cutoff} 且 0 < 批次实物余额 < 0.5吨`
            : "账面可用=max(实物−占用,0)；订单覆盖=账面可用÷(近30日审核订单量÷30)，超过60天列为核查候选；60天为试运行分析参数，待业务确认。",
        source: `ERP stock_balance / ${kind === "tail" ? "stock_transaction、lot" : "document、document_line"}；最新可查库存流水 ${raw.dates.find((d) => Number(d.company_id) === Number(r.company_id))?.last_posted || "未知"}。库存余额表无快照日期，不能证明库存已更新至检查日。`,
        suggestion:
          kind === "tail"
            ? "核查批次货权、质量及可销售状态后，评估同规格需求匹配或合规处置；最早可查入库不一定是完整历史首次入库。"
            : "复核账面可用库存、实际客户需求及已执行订单，评估存量销售计划；订单量不等于实际发出量，不自动降价或下达销售指令。",
        checkedAt: day,
        status: "待处理",
        version: 0,
        aiText: null,
      });
    }
  for (const c of candidates)
    c.evidenceKey = createHash("sha256")
      .update(JSON.stringify([c.facts, c.formula, c.source]))
      .digest("hex");
  const saved =
    await appDb()`select id,status,version,ai_text,snapshot from platform.coordination_review where company_id=any(${ids}::int[]) and id=any(${candidates.map((c) => c.id)}::text[])`;
  for (const c of candidates) {
    const row = saved.find((s) => s.id === c.id);
    if (row) {
      c.status = row.status;
      c.version = row.version;
      c.aiText =
        row.snapshot?.evidenceKey === c.evidenceKey ? row.ai_text : null;
    }
  }
  const history = await appDb()<
    CoordinationEvent[]
  >`select id::text,suggestion_id,decision,note,actor_name,created_at::text,snapshot,ai_text from platform.coordination_review_event where company_id=any(${ids}::int[]) order by created_at desc,id desc limit 100`;
  return {
    candidates,
    history,
    truncated: raw.tail.length > 100 || raw.clear.length > 100,
    checkedAt: day,
    limitations: [
      "备货缺口尚缺已确认需求计划、在途与产能口径，不生成生产计划。",
      "余额与最早可查流水需要现场复核；源ERP可能含模拟记录。",
    ],
    counts: {
      tail: candidates.filter((c) => c.kind === "tail").length,
      clear: candidates.filter((c) => c.kind === "clear").length,
      prepare: 0,
    },
  };
}
