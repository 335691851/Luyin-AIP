import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
process.loadEnvFile(".env.local");
assert.ok(
  process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD,
  "Provide LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD",
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const db = postgres(process.env.ERP_READONLY_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
});
try {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1500, height: 1050 },
  });
  const login = await context.request.post("/api/auth", {
    headers: { origin: "http://127.0.0.1:3100" },
    data: {
      email: process.env.LIVE_TEST_EMAIL,
      password: process.env.LIVE_TEST_PASSWORD,
    },
    timeout: 90000,
  });
  assert.equal(login.status(), 200);
  console.log("PASS: live login");
  const access = await (await context.request.get("/api/access")).json();
  // Independent source totals are restricted to this account's companies.
  const names = access.session?.companies || access.companies;
  assert.ok(Array.isArray(names), "Authorized company directory required");
  let annual;
  if (!process.env.VERIFY_UI_ONLY) {
    const response = await context.request.get("/api/reports?year=2026", {
      timeout: 90000,
    });
    annual = await response.json();
    assert.equal(response.status(), 200, annual.error);
  }
  const source = await db.begin(async (tx) => {
    await tx`set transaction read only`;
    return tx`select count(*)::int as lines, sum(l.net_cents)::numeric/100 as revenue,sum(l.cost_cents)::numeric/100 as cost from public.document d join public.document_line l on l.document_id=d.id join public.company c on c.id=d.company_id where c.name=any(${names}::text[]) and d.type_code='sales_order' and d.status in ('approved','posted','closed') and d.bill_date::date>='2026-01-01' and d.bill_date::date<'2027-01-01'`;
  });
  if (annual) assert.equal(annual.rows.length, source[0].lines);
  const revenue = Number(source[0].revenue);
  assert.ok(Math.abs(revenue - Number(source[0].revenue)) < 0.01);
  if (annual)
    assert.ok(
      Math.abs(
        annual.rows.reduce((sum, r) => sum + r.costAmount, 0) -
          Number(source[0].cost),
      ) < 0.01,
    );
  const invalid = await context.request.get(
    "/api/reports?year=2026&month=2026-10",
  );
  assert.equal(invalid.status(), 400);
  console.log(
    JSON.stringify({
      passed: "annual API matches scoped source SQL",
      lines: source[0].lines,
      responseBytes: annual
        ? Buffer.byteLength(JSON.stringify(annual))
        : undefined,
      revenue: Number(source[0].revenue),
      cost: Number(source[0].cost),
    }),
  );
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  mkdirSync(".local", { recursive: true });
  for (const route of ["reports", "profit"]) {
    await page.goto(`/operation/${route}`);
    await page
      .getByRole("tab", {
        name: route === "reports" ? "销售月报" : "产品利润贡献",
        exact: true,
      })
      .waitFor();
    await page.getByText("7,022,060.55", { exact: true }).first().waitFor();
    console.log("PASS: monthly client data ready", route);
    await page.getByLabel("报表范围", { exact: true }).selectOption("year");
    const panel = page.getByRole("region", { name: "年度概览报表" });
    await panel
      .locator(".report-metrics strong")
      .first()
      .filter({
        hasText: revenue.toLocaleString("zh-CN", { maximumFractionDigits: 2 }),
      })
      .waitFor();
    await panel
      .getByRole("heading", { name: "月度经营汇总", exact: true })
      .waitFor();
    assert.equal(
      await panel.getByRole("row").filter({ hasText: "12月" }).count(),
      1,
    );
    await panel.locator(".report-chart svg").first().waitFor();
    await page.screenshot({
      path: `.local/annual-${route}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `.local/annual-${route}-mobile.png` });
    await page.setViewportSize({ width: 1500, height: 1050 });
    await page.getByLabel("报表范围", { exact: true }).selectOption("month");
    await page.getByRole("tablist").waitFor();
  }
  console.log(
    "PASS: annual sales/profit navigation, 12-month table, mobile layout and return to monthly reports",
  );
} catch (error) {
  const p = browser.contexts()[0]?.pages()[0];
  if (p) {
    await p.screenshot({ path: ".local/annual-failure.png" });
    console.log((await p.locator("body").innerText()).slice(0, 2200));
  }
  throw error;
} finally {
  await browser.close();
  await db.end();
}
