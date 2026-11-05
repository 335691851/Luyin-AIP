import type postgres from "postgres";

// ERP history is an optional evidence source; platform applications remain usable without it.
export async function pricingHistory(
  sql: ReturnType<typeof postgres>,
  companyIds: number[],
  company = "",
  products: string[] = [],
) {
  try {
    const [source] =
      await sql`select to_regclass('public.pricechangerecord')::text as name`;
    if (!source?.name)
      return {
        rows: [],
        warning:
          "ERP历史调价数据源未接入（pricechangerecord表不存在）；平台申请和审核仍可使用，智能评估将标明缺少历史价格证据。",
      };
    const rows =
      await sql`select p.id::text,p.application_no,p.applicant_company_name as company,p.material_name,p.requested_quantity_ton,p.original_price,p.requested_price,p.approved_price,p.status,p.applied_at::text,p.application_reason,p.review_note,p.is_simulated,p.price_includes_tax from public.pricechangerecord p join public.company c on c.name=p.applicant_company_name where c.id=any(${companyIds}::int[]) and (${company}='' or c.name=${company}) and (${products.length === 0} or p.material_name=any(${products}::text[])) order by p.applied_at desc limit ${products.length ? 30 : 1500}`;
    return { rows, warning: "" };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42501")
      return {
        rows: [],
        warning:
          "ERP只读账号尚无历史调价表的SELECT权限；平台申请和审核仍可使用，智能评估不使用未获授权的历史价格证据。请ERP管理员核对pricechangerecord表授权。",
      };
    if (code === "42P01" || code === "42703")
      return {
        rows: [],
        warning:
          "ERP历史调价表结构已变化，需重新映射；本次不使用历史价格证据，平台申请与审核仍可使用。",
      };
    throw e;
  }
}
