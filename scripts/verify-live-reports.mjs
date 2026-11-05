import assert from "node:assert/strict";
import nextEnv from "@next/env";
import postgres from "postgres";
import ExcelJS from "exceljs";
import { chromium } from "@playwright/test";
nextEnv.loadEnvConfig(process.cwd(), true);
const origin = process.env.LIVE_TEST_BASE_URL || "http://127.0.0.1:3100";
let browser,
  page,
  context,
  db,
  step = "configuration";
try {
  assert.ok(process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD);
  browser = await chromium.launch({
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
  });
  context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1600, height: 1000 },
  });
  const check = async (name, fn) => {
    step = name;
    await fn();
    console.log(JSON.stringify({ step: name, state: "passed" }));
  };
  await check("real_login", async () =>
    assert.equal(
      (
        await context.request.post("/api/auth", {
          headers: { origin },
          data: {
            email: process.env.LIVE_TEST_EMAIL,
            password: process.env.LIVE_TEST_PASSWORD,
          },
        })
      ).status(),
      200,
    ),
  );
  const api = await context.request.get("/api/reports?month=2026-10", {
    timeout: 60000,
  });
  assert.equal(api.status(), 200);
  const report = await api.json();
  assert.equal(report.mode, "live");
  assert.ok(report.rows.length);
  const access = await (await context.request.get("/api/access")).json();
  db = postgres(process.env.ERP_READONLY_DATABASE_URL, {
    max: 1,
    ssl: "require",
    prepare: false,
  });
  let aggregate;
  await check("independent_readonly_sql_reconciliation", async () => {
    aggregate = await db.begin(async (tx) => {
      await tx`set transaction read only`;
      await tx`set local statement_timeout='10000'`;
      return tx`select count(*)::int as lines,sum(l.net_cents)::text as cents from public.document d join public.document_line l on l.document_id=d.id join public.company c on c.id=d.company_id where d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.bill_date::date >= '2026-10-01' and d.bill_date::date < '2026-11-01' and c.name=any(${access.session.companies}::text[])`;
    });
    assert.equal(report.rows.length, aggregate[0].lines);
    assert.equal(
      Math.round(report.rows.reduce((n, r) => n + r.revenue, 0) * 100),
      Number(aggregate[0].cents),
    );
    console.log(
      JSON.stringify({
        orderLines: aggregate[0].lines,
        revenue: Number(aggregate[0].cents) / 100,
      }),
    );
  });
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", () => errors.push("browser_error"));
  step = "open_reports_page";
  await page.goto("/operation/reports");
  await page
    .getByRole("heading", { name: "销售月报", exact: true })
    .waitFor();
  const period = page.locator('input[type="month"]');
  if ((await period.inputValue()) !== "2026-10") {
    const loaded = page.waitForResponse((r) =>
      r.url().includes("/api/reports?month=2026-10"),
    );
    await period.fill("2026-10");
    await loaded;
  }
  step = "render_report_rows";
  await page
    .locator(".report-table-area tbody tr.ant-table-row")
    .first()
    .waitFor();
  await check("empty_month_explained_and_recovery_is_automatic", async () => {
    const pending = page.waitForResponse((r) =>
      r.url().includes("/api/reports?month=2026-11"),
    );
    await period.fill("2026-11");
    const empty = await (await pending).json();
    assert.equal(empty.rows.length, 0);
    assert.equal(empty.latestMonth, "2026-10");
    await page
      .getByText("2026-11 · 全部授权法人在当前条件下没有已审核销售订单", {
        exact: true,
      })
      .waitFor();
    assert.equal(await period.inputValue(), "2026-11");
    await page
      .getByRole("button", { name: "查看最近有数据月份 2026-10", exact: true })
      .click();
    await page
      .locator(".report-table-area tbody tr.ant-table-row")
      .first()
      .waitFor();
    assert.equal(await period.inputValue(), "2026-10");
  });
  const money = (n) =>
    n.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  await check("rendered_total_and_source_drilldown", async () => {
    assert.ok(
      (await page.locator(".report-total").innerText()).includes(
        money(Number(aggregate[0].cents) / 100),
      ),
    );
    await page
      .getByRole("button", { name: "订单明细", exact: true })
      .first()
      .click();
    await page
      .locator(".report-source-table tbody tr.ant-table-row")
      .first()
      .waitFor();
    assert.ok(
      (await page.locator(".report-drill-meta").innerText()).includes(
        "2026-10",
      ),
    );
    await page.locator(".ant-drawer-close").click();
  });
  await check("download_xlsx_reconciles_with_sql", async () => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载报表", exact: true }).click();
    const download = await pending;
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(await download.path());
    const sheet = book.worksheets[0];
    let total;
    sheet.eachRow((r) => {
      if (r.getCell(1).value === "合计") total = r;
    });
    assert.ok(total);
    assert.equal(total.getCell(3).value, Number(aggregate[0].cents) / 100);
    assert.equal(total.getCell(6).value, aggregate[0].lines);
  });
  await check("template_company_and_keyword_filters", async () => {
    await page.getByRole("tab", { name: "产品分类报表", exact: true }).click();
    assert.ok(
      (await page.locator(".report-total").innerText()).includes(
        money(Number(aggregate[0].cents) / 100),
      ),
    );
    const search = page.getByPlaceholder("搜索产品、事项或编号");
    const keyword = report.rows[0].id;
    await search.fill(keyword);
    await page
      .getByRole("button", { name: "订单明细", exact: true })
      .first()
      .waitFor();
    assert.ok(
      (await page.locator(".report-total").innerText()).includes(
        money(
          report.rows
            .filter((r) =>
              [r.id, r.product, r.company, r.region]
                .join(" ")
                .includes(keyword),
            )
            .reduce((s, r) => s + r.revenue, 0),
        ),
      ),
    );
    await search.clear();
    const select = page.locator(".filters .ant-select").first();
    await select.click();
    const chosen = report.rows[0].company;
    const filtered = page.waitForResponse(
      (r) => r.url().includes("/api/reports?") && r.url().includes("company="),
    );
    await page
      .locator(".ant-select-dropdown .ant-select-item-option")
      .filter({ hasText: chosen })
      .first()
      .click();
    assert.equal((await filtered).status(), 200);
    const expected = money(
      report.rows
        .filter((r) => r.company === chosen)
        .reduce((n, r) => n + r.revenue, 0),
    );
    await page.waitForFunction(
      (value) =>
        document.querySelector(".report-total")?.textContent.includes(value),
      expected,
    );
  });
  await page.screenshot({
    path: ".local/live-report-optimized.png",
    fullPage: true,
  });
  await check("profit_missing_cost_and_mobile", async () => {
    await page.goto("/operation/profit");
    await page
      .getByRole("heading", { name: "产品利润贡献", exact: true })
      .waitFor();
    if (
      (await page.locator('input[type="month"]').inputValue()) !== "2026-10"
    ) {
      const pending = page.waitForResponse((r) =>
        r.url().includes("/api/reports?month=2026-10"),
      );
      await page.locator('input[type="month"]').fill("2026-10");
      await pending;
    }
    await page
      .locator(".report-quality-note")
      .filter({ hasText: "缺成本" })
      .waitFor();
    assert.ok(
      (
        await page
          .locator(".report-quality-note")
          .filter({ hasText: "缺成本" })
          .innerText()
      ).includes("缺成本"),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.equal(errors.length, 0);
  });
} catch {
  await page
    ?.screenshot({ path: ".local/report-test-failure.png", fullPage: true })
    .catch(() => {});
  console.error(JSON.stringify({ step, state: "failed" }));
  process.exitCode = 1;
} finally {
  await context?.request
    .delete("/api/auth", { headers: { origin } })
    .catch(() => {});
  await browser?.close();
  await db?.end();
}
