import { identity } from "@/server/auth";
import { can } from "@/lib/access";
import ExcelJS from "exceljs";
import { getSales } from "@/server/reports";
import { safeError } from "@/server/auth";
import { buildReport } from "@/lib/report-model";
import type { Dimension } from "@/lib/report-model";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const user = await identity();
    if (!can(user.access, "data.export"))
      return Response.json({ error: "当前角色无此操作权限" }, { status: 403 });
    const q = new URL(req.url).searchParams;
    const company = q.get("company"),
      month = q.get("month"),
      search = q.get("search");
    const { rows, mode } = await getSales({
      month: month || undefined,
      company: company || undefined,
    });
    const filtered = rows.filter(
      (r) =>
        (!company || r.company === company) &&
        (!month || r.date.startsWith(month)) &&
        (!search ||
          [r.id, r.product, r.company, r.region].join(" ").includes(search)),
    );
    const book = new ExcelJS.Workbook();
    const dimension = q.get("report"),
      profit = q.get("variant") === "profit";
    if (!can(user.access, profit ? "profit.view" : "sales.view"))
      return Response.json(
        { error: "当前角色无此报表查看权限" },
        { status: 403 },
      );
    const valid = ["company", "category", "product", "date", "order"];
    if (dimension && !valid.includes(dimension))
      return Response.json({ error: "不支持的报表模板" }, { status: 400 });
    const sheet = book.addWorksheet(dimension ? "固定报表" : "订单销售明细");
    sheet.addRow([
      `${profit ? "订单名义利润" : "订单销售"}报表 · ${mode === "demo" ? "演示数据，非真实经营记录" : "授权期间完整数据"}`,
    ]);
    sheet.addRow([
      "期间",
      month || "全部",
      "法人",
      company || "全部",
      "筛选",
      search || "无",
    ]);
    if (dimension) {
      const report = buildReport(filtered, dimension as Dimension);
      const total = buildReport(
        filtered.map((r) => ({ ...r, company: "合计" })),
        "company",
      )[0];
      const labels: Record<string, string> = {
        company: "法人",
        category: "产品类型",
        region: "区域",
        product: "产品",
        date: "业务日期",
        order: "订单编号",
      };
      sheet.addRow(
        profit
          ? [
              labels[dimension],
              "订单业绩",
              "",
              "名义利润测算",
              "",
              "",
              "成本覆盖",
            ]
          : [labels[dimension], "订单业绩", "", "结构分析", "", "订单行数"],
      );
      sheet.mergeCells("A3:A4");
      sheet.mergeCells("B3:C3");
      sheet.mergeCells(profit ? "D3:F3" : "D3:E3");
      sheet.mergeCells(profit ? "G3:G4" : "F3:F4");
      sheet.addRow(
        profit
          ? [
              "",
              "数量（吨）",
              "不含税收入（元）",
              "名义成本（元）",
              "名义利润（元）",
              "利润率（%）",
              "",
            ]
          : [
              "",
              "数量（吨）",
              "不含税收入（元）",
              "收入占比（%）",
              "平均单价（元/吨）",
              "",
            ],
      );
      for (const r of [
        ...report,
        ...(total ? [{ ...total, name: "合计" }] : []),
      ])
        sheet.addRow(
          profit
            ? [r.name, r.qty, r.revenue, r.cost, r.profit, r.margin, r.coverage]
            : [r.name, r.qty, r.revenue, r.share, r.avgPrice, r.count],
        );
      sheet.addRow([
        profit
          ? "名义利润=收入−ERP订单行成本（cost_cents/100）；不分摊费用；缺成本不可计算，汇总未抵销内部交易。"
          : "审核订单、自然月；数量仅在单位统一为吨时汇总。",
      ]);
    } else {
      sheet.addRow([
        "订单号",
        "日期",
        "法人",
        "产品",
        "数量",
        "原始单位",
        "不含税收入（元）",
      ]);
      filtered.forEach((r) =>
        sheet.addRow([
          String(r.id),
          r.date,
          r.company,
          r.product,
          r.qty,
          r.unit,
          r.revenue,
        ]),
      );
    }
    sheet.views = [{ state: "frozen", xSplit: 1, ySplit: dimension ? 4 : 3 }];
    sheet.columns.forEach((c, i) => {
      c.width = i === 0 ? 34 : 22;
    });
    sheet.eachRow((row, i) => {
      row.eachCell((cell) => {
        cell.font = {
          name: "微软雅黑",
          size: 10,
          ...(i <= 4 ? { bold: true, color: { argb: "FF5C3340" } } : {}),
        };
        if (i === 3 || i === 4)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1E9EB" },
          };
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: typeof cell.value === "number" ? "right" : "left",
        };
        if (typeof cell.value === "number")
          cell.numFmt = "#,##0.00;[Red]-#,##0.00";
        if (row.getCell(1).value === "合计") {
          cell.font = { name: "微软雅黑", size: 10, bold: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1E9EB" },
          };
        }
      });
      row.height = i <= 4 ? 26 : 23;
    });
    const buffer = await book.xlsx.writeBuffer();
    if (buffer.byteLength > 4 * 1024 * 1024)
      return Response.json(
        {
          error:
            "导出超过4 MiB在线下载上限，请缩小筛选范围。大文件归档下载尚未启用。",
        },
        { status: 422 },
      );
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="luyin-report.xlsx"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return safeError(e);
  }
}
