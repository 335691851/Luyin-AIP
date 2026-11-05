import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const origin = "http://127.0.0.1:3100";
let browser,
  context,
  step = "login";
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
  });
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
  );
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  let access = 0,
    reports = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/access")) access++;
    if (r.url().includes("/api/reports?")) reports++;
  });
  await page.goto("/operation/reports");
  await page
    .locator(".report-table-area:visible tbody tr.ant-table-row")
    .first()
    .waitFor();
  const beforeReports = reports,
    beforeAccess = access,
    times = [];
  for (const [path, title] of [
    ["profit", "名义利润分析"],
    ["reports", "主题报表"],
    ["pricing", "调价辅助决策"],
    ["reports", "主题报表"],
  ]) {
    step = "menu_" + path;
    const t = Date.now();
    await page.locator(`.sidebar:visible a.nav-link[href="/operation/${path}"]`).click();
    await page.waitForURL(`**/operation/${path}`);
    await page
      .locator(".page-heading:visible h1")
      .filter({ hasText: title })
      .waitFor();
    assert.equal(
      await page.getByText("正在加载用户与权限…", { exact: true }).count(),
      0,
    );
    times.push({ page: path, ms: Date.now() - t });
    if (path === "profit" || path === "reports")
      await page
        .locator(".report-table-area:visible tbody tr.ant-table-row")
        .first()
        .waitFor();
  }
  console.log(
    JSON.stringify({ times, access, beforeAccess, reports, beforeReports }),
  );
  assert.equal(access, beforeAccess);
  assert.equal(reports, beforeReports);
  console.log(
    JSON.stringify({
      step: "menu_switching",
      state: "passed",
      times,
      extraAccessRequests: access - beforeAccess,
      extraReportRequests: reports - beforeReports,
    }),
  );
  step = "changed_period_is_not_cached_incorrectly";
  const pending = page.waitForResponse((r) =>
    r.url().includes("/api/reports?month=2027-01"),
  );
  await page.locator('input[type="month"]:visible').fill("2027-01");
  assert.equal((await pending).status(), 200);
  await page
    .getByText("2027-01 · 全部授权法人在当前条件下没有已审核销售订单", {
      exact: true,
    })
    .waitFor();
  console.log(JSON.stringify({ step, state: "passed" }));
} catch (e) {
  console.error(String(e.message).split("\n")[0]);
  console.error(JSON.stringify({ step, state: "failed" }));
  process.exitCode = 1;
} finally {
  await context?.request
    .delete("/api/auth", { headers: { origin } })
    .catch(() => {});
  await browser?.close();
}
