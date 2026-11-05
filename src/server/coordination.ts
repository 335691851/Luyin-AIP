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
    const [view] =
      await t`select to_regclass('public.ai_restock_plan_input')::text as name`;
    let prepare: Record<string, any>[] = [];
    if (view.name) {
      const columns =
        await t`select column_name from information_schema.columns where table_schema='public' and table_name='ai_restock_plan_input'`;
      const required = [
        "company_id",
        "material_id",
        "plan_start",
        "plan_end",
        "demand_qty",
        "available_qty",
        "in_transit_qty",
        "scheduled_qty",
        "safety_qty",
        "capacity_qty",
        "snapshot_date",
        "source_refs",
      ];
      if (required.every((k) => columns.some((c) => c.column_name === k)))
        prepare =
          await t`with inputs as (select p.*,count(*) over(partition by p.company_id,p.material_id,p.plan_start,p.plan_end) as duplicates from public.ai_restock_plan_input p where p.company_id=any(${ids}::int[])) select p.*,p.plan_start::text as plan_start,p.plan_end::text as plan_end,p.snapshot_date::text as snapshot_date,c.name as company,m.name as product,greatest(demand_qty+safety_qty-available_qty-in_transit_qty-scheduled_qty,0) as shortage from inputs p join public.company c on c.id=p.company_id and c.kind='生产法人' join public.material m on m.id=p.material_id and m.kind='product' join public.uom u on u.id=m.uom_id and u.name='吨' where p.duplicates=1 and p.plan_start<=p.plan_end and p.plan_end>=${day}::date and p.snapshot_date between ${day}::date-1 and ${day}::date and p.demand_qty>=0 and p.available_qty>=0 and p.in_transit_qty>=0 and p.scheduled_qty>=0 and p.safety_qty>=0 and p.capacity_qty>=0 and length(p.source_refs)>0 and p.demand_qty+p.safety_qty-p.available_qty-p.in_transit_qty-p.scheduled_qty>0 order by p.company_id,p.material_id,p.plan_start limit 101`;
    }
    return { tail, clear, dates, prepare, prepareReady: !!view.name };
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
  for (const r of raw.prepare.slice(0, 100)) {
    if (
      [
        r.demand_qty,
        r.safety_qty,
        r.available_qty,
        r.in_transit_qty,
        r.scheduled_qty,
        r.capacity_qty,
        r.shortage,
      ].some((v) => !Number.isFinite(Number(v)))
    )
      continue;
    const shortage = Number(r.shortage),
      proposed = Math.min(shortage, Number(r.capacity_qty));
    candidates.push({
      evidenceKey: "",
      id: `${day}:prepare:${r.company_id}:${r.material_id}:${r.plan_start}:${r.plan_end}`,
      kind: "prepare",
      companyId: Number(r.company_id),
      company: r.company,
      product: r.product,
      qty: proposed,
      facts: [
        ["计划窗口", `${r.plan_start} 至 ${r.plan_end}`],
        ["已确认需求", `${r.demand_qty} 吨`],
        ["安全库存", `${r.safety_qty} 吨`],
        ["账面可用", `${r.available_qty} 吨`],
        ["确定在途", `${r.in_transit_qty} 吨`],
        ["已排产", `${r.scheduled_qty} 吨`],
        ["净缺口", `${shortage} 吨`],
        ["窗口可用产能", `${r.capacity_qty} 吨`],
        ["建议新增备货", `${proposed} 吨`],
        ["仍待协调缺口", `${Math.max(0, shortage - proposed)} 吨`],
      ],
      formula:
        "净缺口=max(确认需求+安全库存-可用库存-确定在途-已排产,0)；建议新增备货=min(净缺口,可用产能)。",
      source: `ERP ai_restock_plan_input；统一快照 ${r.snapshot_date}；来源 ${r.source_refs}`,
      suggestion:
        proposed > 0
          ? `建议人工确认新增备货${proposed.toFixed(3)}吨；核实计划窗口、产能及物料可用性后下达。`
          : "净需求超过库存覆盖，但当前无剩余产能；请协调产能或需求窗口。",
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
    truncated:
      raw.tail.length > 100 ||
      raw.clear.length > 100 ||
      raw.prepare.length > 100,
    checkedAt: day,
    limitations: [
      raw.prepareReady
        ? "备货按ERP输入视图计算；缺列、重复粒度、过期快照或无净缺口均不产生候选。"
        : "备货计划待ERP提供ai_restock_plan_input只读视图，字段契约见ERP数据补充与联调要求。",
      "余额与最早可查流水需要现场复核；源ERP可能含模拟记录。",
    ],
    counts: {
      tail: candidates.filter((c) => c.kind === "tail").length,
      clear: candidates.filter((c) => c.kind === "clear").length,
      prepare: candidates.filter((c) => c.kind === "prepare").length,
    },
  };
}
