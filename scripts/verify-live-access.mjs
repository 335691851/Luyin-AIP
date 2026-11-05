import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Credentials are supplied only in the invoking process environment. No traces or login screenshots.
const email = process.env.LIVE_TEST_EMAIL;
const password = process.env.LIVE_TEST_PASSWORD;
const origin = new URL(
  process.env.LIVE_TEST_BASE_URL || "http://127.0.0.1:3100",
).origin;
let browser;
let step = "configuration";
try {
  assert.ok(email && password);
  browser = await chromium.launch({
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
  });
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const check = async (name, run) => {
    step = name;
    await run();
    console.log(JSON.stringify({ step: name, state: "passed" }));
  };
  await check("anonymous_access_denied", async () => {
    const status = await (await context.request.get("/api/status")).json();
    assert.equal(status.mode, "live");
    assert.equal((await context.request.get("/api/access")).status(), 401);
    assert.equal(
      (await context.request.get("/api/reports?month=2026-10")).status(),
      401,
    );
    await page.goto("/operation/reports");
    assert.ok(new URL(page.url()).pathname === "/login");
  });
  await check("password_login_and_redirect", async () => {
    await page.getByLabel("企业邮箱", { exact: true }).fill(email);
    await page.getByLabel("密码", { exact: true }).fill(password);
    const login = page.waitForResponse(
      (r) => r.url().endsWith("/api/auth") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "登录平台", exact: true }).click();
    assert.equal((await login).status(), 200);
    await page.waitForURL("**/operation", { timeout: 90000 });
    await page
      .getByRole("heading", { name: "销售月报", exact: true })
      .waitFor();
  });
  await check("single_superuser_database_scope", async () => {
    const response = await context.request.get("/api/access");
    assert.equal(response.status(), 200);
    const access = await response.json();
    assert.equal(access.session.user.email, email);
    assert.equal(access.session.role.id, "luyan_admin");
    assert.equal(access.session.user.scope, "group");
    assert.equal(access.session.demo, false);
    assert.equal(access.previewAvailable, false);
    assert.equal(access.users.length, 1);
    assert.equal(access.session.companies.length, 12);
    assert.ok(access.session.permissions.includes("price.review"));
    assert.ok(access.session.permissions.includes("admin.manage"));
  });
  await check("real_erp_report_and_render", async () => {
    const response = await context.request.get("/api/reports?month=2026-10");
    assert.equal(response.status(), 200);
    const report = await response.json();
    assert.equal(report.mode, "live");
    assert.ok(report.rows.length > 0);
    assert.ok(report.rows.every((r) => r.date.startsWith("2026-10")));
    const loaded = page.waitForResponse((r) =>
      r.url().includes("/api/reports?month=2026-10"),
    );
    await page.locator('input[type="month"]').fill("2026-10");
    assert.equal((await loaded).status(), 200);
    await page
      .locator(".report-table-area tbody tr.ant-table-row")
      .first()
      .waitFor();
  });
  await check("live_admin_directory", async () => {
    await page.goto("/admin/users");
    await page
      .getByRole("heading", { name: "当前授权账号", exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("cell", { name: email, exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByRole("button", { name: "新增用户", exact: true }).count(),
      0,
    );
    const response = await context.request.post("/api/integrations/check", {
      headers: { origin },
      data: { service: "平台数据库" },
    });
    assert.equal((await response.json()).state, "passed");
    assert.equal(
      (
        await context.request.post("/api/access", {
          headers: { origin },
          data: { action: "switch", userId: "demo-admin" },
        })
      ).status(),
      403,
    );
  });
  await check("logout_and_session_removed", async () => {
    await page.goto("/operation/reports");
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await page.waitForURL("**/login");
    assert.equal((await context.request.get("/api/access")).status(), 401);
    await page.goto("/admin/users");
    assert.ok(new URL(page.url()).pathname === "/login");
  });
} catch {
  console.error(JSON.stringify({ step, state: "failed" }));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
