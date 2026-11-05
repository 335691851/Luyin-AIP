import { identity, safeError } from "@/server/auth";
import { erpDb } from "@/server/db";
import { can } from "@/lib/access";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const u = await identity();
    if (
      !can(u.access, "contracts.view") ||
      u.access.user.scope !== "group" ||
      !u.companyIds.includes(1)
    )
      throw Error("FORBIDDEN");
    const month =
      new URL(req.url).searchParams.get("month") ||
      new Date().toISOString().slice(0, 7);
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
      throw Error("INVALID_REPORT_PERIOD");
    const rows = await erpDb().begin(async (t) => {
      await t`set transaction read only`;
      await t`set local statement_timeout='12000'`;
      return t`with orders as (select d.id,d.bill_no,d.bill_date,d.company_id,d.partner_id,d.net_cents,d.is_simulated,p.name as customer from public.document d left join public.partner p on p.id=d.partner_id where d.company_id=1 and d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.bill_date>=${month + "-01"} and d.bill_date::date<${month + "-01"}::date+interval '1 month') select o.id,o.bill_no,o.bill_date,o.customer,o.net_cents/100.0 as revenue,o.is_simulated,
 (select count(*)::int from public.sales_contract c join public.contract_customer cc on cc.contract_id=c.id where c.company_id=o.company_id and cc.partner_id=o.partner_id and c.status='approved' and c.valid_from::date<=date_trunc('year',o.bill_date::date)::date and c.valid_to::date>= (date_trunc('year',o.bill_date::date)+interval '1 year'-interval '1 day')::date) as annual_candidates,
 (select count(*)::int from public.sales_contract c join public.contract_customer cc on cc.contract_id=c.id join public.contract_attachment a on a.contract_id=c.id where c.company_id=o.company_id and cc.partner_id=o.partner_id and c.status='approved' and c.valid_from::date<=date_trunc('year',o.bill_date::date)::date and c.valid_to::date>= (date_trunc('year',o.bill_date::date)+interval '1 year'-interval '1 day')::date) as contract_files,
 j.* from orders o left join lateral (with recursive chain as (select o.id,0 as depth union select dl.target_id,ch.depth+1 from chain ch join public.document_link dl on dl.source_id=ch.id and dl.relation='source' join public.document d on d.id=dl.target_id and d.company_id=1 where ch.depth<4), bills as (select d.id,d.bill_no,d.net_cents from public.document d where d.id in(select id from chain) and d.type_code='ar_bill' and d.status in ('approved','posted','closed')), entries as (select v.id,v.document_id,sum(l.debit_cents) as debit,sum(l.credit_cents) as credit from public.voucher v left join public.voucher_line l on l.voucher_id=v.id where v.document_id in(select id from bills) and v.company_id=1 and v.status='posted' group by v.id,v.document_id) select (select count(*)::int from bills) as accounting_documents,(select string_agg(bill_no,', ') from bills) as bill_refs,count(e.id)::int as vouchers,count(*) filter(where e.debit<>e.credit or e.debit is null)::int as unbalanced,coalesce(sum(e.debit),0)/100.0 as debit,coalesce(sum(e.credit),0)/100.0 as credit from entries e) j on true order by o.bill_date desc,o.id limit 501`;
    });
    const items = rows.slice(0, 500).map((r) => ({
      ...r,
      issues: [
        ...(r.annual_candidates === 0 ? ["未匹配覆盖自然年的合同候选"] : []),
        ...(r.annual_candidates > 0 && r.contract_files === 0
          ? ["合同候选缺少附件索引"]
          : []),
        ...(r.accounting_documents > 0 && r.vouchers === 0
          ? ["已形成账务单据但未匹配已记账凭证"]
          : []),
        ...(r.unbalanced > 0 ? ["凭证借贷不平衡或缺少分录"] : []),
      ],
      basis:
        "集团销售订单→document_link来源链→应收单→voucher→voucher_line；合同按客户及自然年有效期匹配候选，尚未核验框架性质、SKU覆盖及签署原件。",
    }));
    return Response.json({
      rows: items,
      truncated: rows.length > 500,
      month,
      company: "山东省鲁盐集团有限公司",
    });
  } catch (e) {
    return safeError(e);
  }
}
