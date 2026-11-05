import { can } from "@/lib/access";
import { sameOrigin } from "@/lib/request-origin";
import ExcelJS from "exceljs";
import { identity, safeError } from "@/server/auth";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    if (!sameOrigin(req))
      return Response.json({ error: "非法请求来源" }, { status: 403 });
    if (!can((await identity()).access, "price.create"))
      return Response.json(
        { error: "当前角色无调价申请发起权限" },
        { status: 403 },
      );
    const body = await req.formData();
    const file = body.get("file");
    if (
      !(file instanceof File) ||
      !file.name.endsWith(".xlsx") ||
      file.size > 2 * 1024 * 1024
    )
      return Response.json(
        { error: "首版仅支持2 MiB以内的XLSX，其他格式待接入解析。" },
        { status: 400 },
      );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const sheet = book.worksheets[0];
    if (!sheet || sheet.rowCount > 201 || sheet.columnCount > 20)
      return Response.json(
        { error: "请使用不超过200行、20列的申请模板。" },
        { status: 400 },
      );
    const rows: {
      product: string;
      original: number;
      requested: number;
      qty: number;
      reason: string;
    }[] = [];
    const errors: string[] = [];
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      const cell = (n: number) => row.getCell(n).text.trim();
      const [original, requested, qty] = [2, 3, 4].map((n) => Number(cell(n)));
      if (
        !cell(1) ||
        [original, requested, qty].some((v) => !Number.isFinite(v) || v <= 0)
      ) {
        errors.push(`第${index}行：产品或价格/数量无效`);
        return;
      }
      rows.push({
        product: cell(1),
        original,
        requested,
        qty,
        reason: cell(5),
      });
    });
    return Response.json({
      rows,
      errors,
      total: Math.max(0, sheet.rowCount - 1),
      notice:
        "仅完成字段读取。产品编码、组织及原件归档待正式接入，确认后才能作为有效申请。",
    });
  } catch (e) {
    return safeError(e);
  }
}
