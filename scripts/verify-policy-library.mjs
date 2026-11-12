import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
let step = "login";
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
  });
  page.setDefaultTimeout(20000);
  await page.goto("http://127.0.0.1:3100/login");
  await page.getByRole("button", { name: "登录平台" }).click();
  await page.waitForURL(/\/operation/);
  const snapshot = await page.evaluate(
    async () =>
      await (
        await fetch(
          "/api/governance?view=company&company=" +
            encodeURIComponent("鲁盐泰安"),
        )
      ).json(),
  );
  const docs = snapshot.rows.filter((r) => r.payload?.policyLibrary);
  assert.equal(docs.length, 32);
  assert.equal(new Set(docs.map((r) => r.payload.area)).size, 8);
  assert.ok(
    docs.every(
      (r) =>
        r.payload.content.includes("演练草案") &&
        r.payload.content.length > 500,
    ),
  );
  // UI uses the authenticated live snapshot; no business data is changed here.
  await page.route("**/api/governance?*", (r) => r.fulfill({ json: snapshot }));
  await page.goto("http://127.0.0.1:3100/governance");
  await page.getByLabel("监管工作视角").selectOption("company");
  await expect(
    page.getByRole("region", { name: "治理工作台办理导航" }),
  ).toBeVisible();
  const nav = page
    .locator(".sidebar")
    .getByRole("navigation", { name: "企业治理业务导航" });
  await nav.getByRole("button", { name: /治理依据/ }).click();
  await nav.getByRole("link", { name: "制度知识库", exact: true }).click();
  step = "tree-and-content";
  const library = page.getByRole("region", { name: "公司制度树形知识库" });
  await expect(library.getByRole("tree")).toBeVisible();
  await library
    .locator(".ant-tree-title")
    .filter({ hasText: /^公司治理$/ })
    .click();
  await expect(library.locator("tbody tr.ant-table-row")).toHaveCount(4);
  await library
    .locator(".ant-tree-title")
    .filter({ hasText: /^经理层授权管理办法$/ })
    .click();
  await expect(
    library.getByRole("heading", { name: "经理层授权管理办法", exact: true }),
  ).toBeVisible();
  await expect(
    library.getByRole("heading", { name: "三、核心控制要求" }),
  ).toBeVisible();
  await expect(
    library.getByRole("link", { name: "下载制度样例" }),
  ).toHaveAttribute("download", /LYTA-MOCK/);
  await library.getByLabel("搜索制度").fill("恢复");
  await expect(library.locator("tbody tr.ant-table-row")).toHaveCount(1);
  await library.getByLabel("搜索制度").fill("完全不存在的制度名称");
  await expect(library.locator("tbody tr.ant-table-row")).toHaveCount(0);
  await library.getByLabel("搜索制度").fill("");
  await page.screenshot({
    path: ".local/policy-library-tree.png",
    fullPage: true,
  });
  step = "mobile";
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(library.getByRole("tree")).toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    JSON.stringify({
      documents: 32,
      domains: 8,
      treeSelection: "passed",
      markdown: "passed",
      search: "passed",
      mobile: "passed",
      uiWrites: false,
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({ step, error: String(e.message).split("\n")[0] }),
  );
  console.error(
    String(e.stack)
      .split("\n")
      .filter((line) => line.includes("verify-policy-library.mjs"))
      .join("\n"),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
