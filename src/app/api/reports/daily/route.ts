import { z } from "zod";
import { identity, safeError } from "@/server/auth";
import { erpDb } from "@/server/db";
import { can } from "@/lib/access";
import { buildDailySales } from "@/lib/daily-sales";
import type { DailyRaw } from "@/lib/daily-sales";
import ExcelJS from "exceljs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const user = await identity();
    if (!can(user.access, "sales.view")) throw Error("FORBIDDEN");
    if (user.access.role.id === "marketing_operator")
      throw Error("DEPARTMENT_MAPPING_REQUIRED");
    const q = new URL(req.url).searchParams;
    const v = z
      .object({
        date: z.iso.date(),
        company: z.string().max(200),
        search: z.string().max(200),
        format: z.enum(["json", "xlsx"]),
      })
      .safeParse({
        date: q.get("date"),
        company: q.get("company") || "",
        search: q.get("search") || "",
        format: q.get("format") || "json",
      });
    if (!v.success)
      return Response.json(
        { error: "日报日期或筛选条件无效" },
        { status: 400 },
      );
    const { date, company, search, format } = v.data;
    if (company && !user.access.companies.includes(company))
      throw Error("FORBIDDEN");
    if (format === "xlsx" && !can(user.access, "data.export"))
      throw Error("FORBIDDEN");
    const data = await erpDb().begin(async (t) => {
      await t`set transaction read only`;
      await t`set local statement_timeout='15000'`;
      const catalog = await t<
        { category: string; variety: string }[]
      >`select p.name as category,c.name as variety from public.material_category c join public.material_category p on p.id=c.parent_id where p.name in ('食用盐','非食用盐') order by p.id,c.id`;
      const raw = await t<
        DailyRaw[]
      >`select coalesce(p.name,mc.name,'未映射分类') as category,coalesce(mc.name,'未映射品种') as variety,coalesce(m.salt_origin,'unknown') as origin,coalesce(m.packaging,'unknown') as packaging,coalesce(u.name,'未映射单位') as unit,coalesce(sum(l.qty) filter(where d.bill_date::date=${date}::date),0)::text as day,coalesce(sum(l.qty) filter(where d.bill_date::date>=date_trunc('month',${date}::date)),0)::text as month,sum(l.qty)::text as year,count(*) filter(where d.bill_date::date=${date}::date)::int as day_count,count(*) filter(where d.bill_date::date>=date_trunc('month',${date}::date))::int as month_count,count(*)::int as year_count from public.document d join public.document_line l on l.document_id=d.id join public.company c on c.id=d.company_id left join public.material m on m.id=l.material_id left join public.material_category mc on mc.id=m.category_id left join public.material_category p on p.id=mc.parent_id left join public.uom u on u.id=m.uom_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.company_id=any(${user.companyIds}::int[]) and d.bill_date::date>=date_trunc('year',${date}::date) and d.bill_date::date<=${date}::date and (${company || null}::text is null or c.name=${company || null}) and (${search || null}::text is null or position(${search} in concat_ws(' ',d.bill_no||'/'||l.line_no::text,m.name,c.name,'未映射区域'))>0) group by p.name,mc.name,m.salt_origin,m.packaging,u.name limit 1001`;
      if (raw.length > 1000) throw Error("REPORT_SCOPE_TOO_LARGE");
      return {
        ...buildDailySales(raw, catalog),
        counts: {
          day: raw.reduce((n, r) => n + r.day_count, 0),
          month: raw.reduce((n, r) => n + r.month_count, 0),
          year: raw.reduce((n, r) => n + r.year_count, 0),
        },
      };
    });
    const meta = {
      date,
      company: company || "全部授权法人",
      monthStart: date.slice(0, 7) + "-01",
      yearStart: date.slice(0, 4) + "-01-01",
      loadedAt: new Date().toISOString(),
      basis:
        "已审核、已记账、已关闭销售订单；订单业务日期；自然月/年；截至所选日期，包含当日",
    };
    if (format === "json")
      return Response.json(
        { ...data, ...meta },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet("销售日报表");
    sheet.addRow(["销售日报表"]);
    sheet.mergeCells("A1:E1");
    sheet.addRow(["单位", meta.company, "日期", date, "单位：吨"]);
    sheet.addRow(["分类", "品种", "本日合计", "本月累计", "本年累计"]);
    for (const r of [...data.rows, data.total, ...data.breakdown])
      sheet.addRow([r.category, r.variety, r.day, r.month, r.year]);
    sheet.addRow([
      "说明：月累计自月初、年累计自年初至所选日期；“其中”仅为结构分析，不重复计入合计。非吨单位不可直接合计；盐源未确认的保留待确认。",
    ]);
    sheet.addRow([meta.basis]);
    sheet.columns.forEach((c, i) => (c.width = i < 2 ? 28 : 20));
    sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 2 }];
    sheet.eachRow((r, i) => {
      r.height = i === 1 ? 32 : 26;
      r.eachCell((cell) => {
        cell.font = {
          name: "微软雅黑",
          size: 11,
          bold: i <= 3 || r.getCell(1).value === "合计",
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: typeof cell.value === "number" ? "right" : "left",
          wrapText: true,
        };
        if (typeof cell.value === "number") cell.numFmt = "#,##0.000";
        if (i === 3 || r.getCell(1).value === "合计")
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF5EDEF" },
          };
      });
    });
    const buffer = await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="sales-daily-${date}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
