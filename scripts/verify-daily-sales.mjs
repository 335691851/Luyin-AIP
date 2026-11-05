import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import nextEnv from "@next/env";
import postgres from "postgres";
import ExcelJS from "exceljs";
nextEnv.loadEnvConfig(process.cwd(), true);
let b,
  c,
  p,
  db,
  step = "anonymous";
const origin = "http://127.0.0.1:3100";
try {
  b = await chromium.launch({ channel: "msedge", headless: true });
  c = await b.newContext({
    baseURL: origin,
    viewport: { width: 1600, height: 1100 },
  });
  const get = (url) => c.request.get(url, { timeout: 60000 });
  assert.equal((await get("/api/reports/daily?date=2026-10-26")).status(), 401);
  step = "login";
  assert.equal(
    (
      await c.request.post("/api/auth", {
        headers: { origin },
        data: {
          email: process.env.LIVE_TEST_EMAIL,
          password: process.env.LIVE_TEST_PASSWORD,
        },
      })
    ).status(),
    200,
  );
  const access = await (await get("/api/access")).json();
  step = "daily_sql_reconciliation";
  const response = await get("/api/reports/daily?date=2026-10-26");
  assert.equal(response.status(), 200);
  const d = await response.json();
  db = postgres(process.env.ERP_READONLY_DATABASE_URL, {
    ssl: "require",
    prepare: false,
    max: 1,
  });
  const sql = await db.begin(async (t) => {
    await t`set transaction read only`;
    return t`select sum(l.qty) filter(where d.bill_date::date='2026-10-26')::text as day,sum(l.qty) filter(where d.bill_date::date>='2026-10-01')::text as month,sum(l.qty)::text as year from document d join document_line l on l.document_id=d.id join company c on c.id=d.company_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.bill_date::date between '2026-01-01' and '2026-10-26' and c.name=any(${access.session.companies}::text[])`;
  });
  for (const k of ["day", "month", "year"])
    assert.equal(d.total[k], Number(Number(sql[0][k]).toFixed(3)));
  console.log(JSON.stringify({ step, total: d.total, counts: d.counts }));
  step = "xlsx_same_daily_period";
  const exported = await get("/api/reports/daily?date=2026-10-26&format=xlsx");
  assert.equal(exported.status(), 200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await exported.body());
  let total;
  book.worksheets[0].eachRow((r) => {
    if (r.getCell(1).value === "合计") total = r;
  });
  assert.ok(total);
  assert.equal(total.getCell(3).value, d.total.day);
  assert.equal(total.getCell(4).value, d.total.month);
  assert.equal(total.getCell(5).value, d.total.year);
  step = "table_full_width_charts_below";
  p = await c.newPage();
  p.setDefaultTimeout(60000);
  await p.goto("/operation/reports");
  await p
    .locator(".report-table-area tbody tr.ant-table-row")
    .first()
    .waitFor();
  const table = await p.locator(".report-table-area").boundingBox(),
    body = await p.locator(".report-body").boundingBox(),
    charts = await p.locator(".report-visuals").boundingBox();
  assert.ok(table.width >= body.width - 2);
  assert.ok(charts.y >= table.y + table.height - 2);
  step = "daily_secondary_date_recalculates";
  await p.getByRole("tab", { name: "每日销售日报", exact: true }).click();
  await p.getByRole("heading", { name: "销售日报表", exact: true }).waitFor();
  await p.locator(".daily-sales-report .report-total").waitFor();
  assert.equal(
    await p.getByLabel("日报日期", { exact: true }).inputValue(),
    "2026-10-26",
  );
  const pending = p.waitForResponse((r) =>
    r.url().includes("/api/reports/daily?date=2026-10-25"),
  );
  await p.getByLabel("日报日期", { exact: true }).fill("2026-10-25");
  const next = await (await pending).json();
  assert.equal(next.date, "2026-10-25");
  await p.waitForFunction(
    () => document.querySelector(".daily-sales-report .report-total") !== null,
  );
  await p.screenshot({ path: ".local/daily-sales-report.png", fullPage: true });
  step = "scope_and_invalid_date";
  assert.equal((await get("/api/reports/daily?date=2026-02-30")).status(), 400);
  assert.equal(
    (
      await get("/api/reports/daily?date=2026-10-26&company=NOT_AUTHORIZED")
    ).status(),
    403,
  );
  await p.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  console.log(
    JSON.stringify({
      step: "daily_sales_and_report_layout_e2e",
      state: "passed",
    }),
  );
} catch (e) {
  console.error(String(e.message).split("\n")[0]);
  console.error(JSON.stringify({ step, state: "failed" }));
  await p
    ?.screenshot({ path: ".local/daily-sales-failure.png" })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await c?.request.delete("/api/auth", { headers: { origin } }).catch(() => {});
  await b?.close();
  await db?.end();
}
