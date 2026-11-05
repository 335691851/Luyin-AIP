import "server-only";
import { erpDb } from "./db";
import { sales } from "@/lib/demo";
import { demoMode } from "./config";
import { identity } from "./auth";
import { can, inScope } from "@/lib/access";
import type { Sale } from "@/lib/report-model";
export async function getSales(
  filters: { month?: string; company?: string } = {},
): Promise<{
  mode: "demo" | "live";
  rows: Sale[];
  latestMonth?: string | null;
}> {
  const user = await identity();
  const month = filters.month;
  if (month && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
    throw Error("INVALID_REPORT_PERIOD");
  const start = month ? `${month}-01` : null;
  const end = month
    ? `${Number(month.slice(0, 4)) + (month.endsWith("12") ? 1 : 0)}-${String((Number(month.slice(5)) % 12) + 1).padStart(2, "0")}-01`
    : null;
  if (filters.company && !user.access.companies.includes(filters.company))
    throw Error("FORBIDDEN");
  if (!can(user.access, "sales.view") && !can(user.access, "profit.view"))
    throw Error("FORBIDDEN");
  if (demoMode())
    return {
      mode: "demo",
      rows: sales
        .filter(
          (s) =>
            inScope(user.access, s.company, s.department) &&
            (!month || s.date.startsWith(month)) &&
            (!filters.company || s.company === filters.company),
        )
        .map((s) =>
          can(user.access, "profit.view") ? s : { ...s, unitCost: null },
        ),
    };
  if (user.access.role.id === "marketing_operator")
    throw Error("DEPARTMENT_MAPPING_REQUIRED"); // Live department mapping must be established before departmental reads.

  if (!month) throw Error("INVALID_REPORT_PERIOD");
  const ids = user.companyIds;
  if (!ids.length) throw new Error("FORBIDDEN");
  const rows = await erpDb().begin(async (tx) => {
    await tx`set transaction read only`;
    await tx`set local statement_timeout='10000'`;
    return tx<
      Sale[]
    >`select (d.bill_no || '/' || l.line_no::text) as id,d.bill_no as number,d.bill_date as date,c.name as company,'未映射部门' as department,coalesce(m.name,'未映射产品') as product,coalesce(mc.name,'未映射分类') as category,'未映射区域' as region,l.qty::float8 as qty,coalesce(u.name,'未映射单位') as unit,l.net_cents::float8/100 as revenue,null::float8 as "unitCost",d.status from public.document d join public.document_line l on l.document_id=d.id join public.company c on c.id=d.company_id left join public.material m on m.id=l.material_id left join public.uom u on u.id=m.uom_id left join public.material_category mc on mc.id=m.category_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.company_id=any(${ids}::int[]) and d.bill_date::date >= ${start}::date and d.bill_date::date < ${end}::date and (${filters.company || null}::text is null or c.name=${filters.company || null}) order by d.bill_date desc,d.id desc,l.line_no limit 50001`;
  });
  if (rows.length > 50000) throw Error("REPORT_SCOPE_TOO_LARGE");
  let latestMonth: string | null = null;
  if (!rows.length) {
    const latest = await erpDb().begin(async (tx) => {
      await tx`set transaction read only`;
      await tx`set local statement_timeout='10000'`;
      return tx`select to_char(max(d.bill_date::date), 'YYYY-MM') as month from public.document d join public.company c on c.id=d.company_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.company_id=any(${ids}::int[]) and (${filters.company || null}::text is null or c.name=${filters.company || null}) and exists(select 1 from public.document_line l where l.document_id=d.id)`;
    });
    latestMonth = latest[0]?.month || null;
  }
  return { mode: "live", rows, latestMonth };
}
