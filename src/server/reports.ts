import "server-only";
import { erpDb } from "./db";
import { sales } from "@/lib/demo";
import { demoMode } from "./config";
import { identity } from "./auth";
import { can, inScope } from "@/lib/access";
import type { Sale } from "@/lib/report-model";
export async function getSales(
  filters: { month?: string; year?: string; company?: string } = {},
): Promise<{
  mode: "demo" | "live";
  rows: Sale[];
  latestMonth?: string | null;
}> {
  const user = await identity();
  const month = filters.month;
  const year = filters.year;
  if (year && (!/^[1-9]\d{3}$/.test(year) || month))
    throw Error("INVALID_REPORT_PERIOD");
  if (month && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
    throw Error("INVALID_REPORT_PERIOD");
  const start = year ? `${year}-01-01` : month ? `${month}-01` : null;
  const end = year
    ? `${Number(year) + 1}-01-01`
    : month
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
            (!year || s.date.startsWith(`${year}-`)) &&
            (!filters.company || s.company === filters.company),
        )
        .map((s) =>
          can(user.access, "profit.view") ? s : { ...s, unitCost: null },
        ),
    };
  if (user.access.role.id === "marketing_operator")
    throw Error("DEPARTMENT_MAPPING_REQUIRED"); // Live department mapping must be established before departmental reads.

  if (!month && !year) throw Error("INVALID_REPORT_PERIOD");
  const ids = user.companyIds;
  if (!ids.length) throw new Error("FORBIDDEN");
  if (year) {
    // Avoid transferring repeated long ERP labels and cost-basis strings for each annual line.
    // Keep every original order line; expand the compact payload using small server-side dictionaries.
    const db = erpDb();
    const [compact, dictionary] = await Promise.all([
      db.begin(async (tx) => {
        await tx`set transaction read only`;
        await tx`set local statement_timeout='10000'`;
        return tx`select coalesce(jsonb_agg(jsonb_build_array(x.bill_no,x.line_no,x.date,x.company_id,x.material_id,x.qty,x.net_cents,x.cost_cents,x.status)), '[]'::jsonb) as lines from (select d.bill_no,l.line_no,d.bill_date::text as date,d.company_id,l.material_id,l.qty::text,l.net_cents::text,case when ${can(user.access, "profit.view")} then l.cost_cents::text else null end as cost_cents,d.status from public.document d join public.document_line l on l.document_id=d.id join public.company c on c.id=d.company_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.company_id=any(${ids}::int[]) and d.bill_date::date >= ${start}::date and d.bill_date::date < ${end}::date and (${filters.company || null}::text is null or c.name=${filters.company || null}) order by d.bill_date desc,d.id desc,l.line_no limit 50001) x`;
      }),
      db`select m.id,m.name,coalesce(mc.name,'未映射分类') as category,coalesce(u.name,'未映射单位') as unit from public.material m left join public.material_category mc on mc.id=m.category_id left join public.uom u on u.id=m.uom_id`,
    ]);
    const lines = compact[0].lines as unknown[][];
    if (lines.length > 50000) throw Error("REPORT_SCOPE_TOO_LARGE");
    const names =
      await db`select id,name from public.company where id=any(${ids}::int[])`;
    const materials = new Map(dictionary.map((m) => [Number(m.id), m]));
    const companies = new Map(names.map((c) => [Number(c.id), String(c.name)]));
    return {
      mode: "live",
      rows: lines.map((l): Sale => {
        const material = materials.get(Number(l[4]));
        const qty = Number(l[5]),
          cost = l[7] == null ? null : Number(l[7]) / 100;
        return {
          id: `${l[0]}/${l[1]}`,
          number: String(l[0]),
          date: String(l[2]),
          company: companies.get(Number(l[3]))!,
          department: "未映射部门",
          product: String(material?.name || "未映射产品"),
          category: String(material?.category || "未映射分类"),
          region: "未映射区域",
          unit: String(material?.unit || "未映射单位"),
          qty,
          revenue: Number(l[6]) / 100,
          costAmount: cost !== null && cost > 0 ? cost : null,
          unitCost: cost !== null && cost > 0 && qty !== 0 ? cost / qty : null,
          costBasis: "ERP订单行成本；不分摊费用",
          status: String(l[8]),
        };
      }),
    };
  }
  const rows = await erpDb().begin(async (tx) => {
    await tx`set transaction read only`;
    await tx`set local statement_timeout='10000'`;
    return tx<
      Sale[]
    >`select (d.bill_no || '/' || l.line_no::text) as id,d.bill_no as number,d.bill_date as date,c.name as company,'未映射部门' as department,coalesce(m.name,'未映射产品') as product,coalesce(mc.name,'未映射分类') as category,'未映射区域' as region,l.qty::float8 as qty,coalesce(u.name,'未映射单位') as unit,l.net_cents::float8/100 as revenue,case when ${can(user.access, "profit.view")} and l.cost_cents>0 and l.qty<>0 then l.cost_cents::float8/100/l.qty else null end as "unitCost",case when ${can(user.access, "profit.view")} and l.cost_cents>0 then l.cost_cents::float8/100 else null end as "costAmount",'ERP订单行成本 document_line.cost_cents；不分摊费用' as "costBasis",d.status from public.document d join public.document_line l on l.document_id=d.id join public.company c on c.id=d.company_id left join public.material m on m.id=l.material_id left join public.uom u on u.id=m.uom_id left join public.material_category mc on mc.id=m.category_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.company_id=any(${ids}::int[]) and d.bill_date::date >= ${start}::date and d.bill_date::date < ${end}::date and (${filters.company || null}::text is null or c.name=${filters.company || null}) order by d.bill_date desc,d.id desc,l.line_no limit 50001`;
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
