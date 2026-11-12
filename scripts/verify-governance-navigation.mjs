import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
mkdirSync(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
  });
  page.setDefaultTimeout(90000);
  await page.goto("http://127.0.0.1:3100/login");
  await page.getByRole("button", { name: "登录平台" }).click();
  await page.waitForURL(/\/operation/);
  const base = {
    company: "鲁盐泰安",
    company_id: 2,
    owner: "界面验证岗",
    deadline: "2026-12-01",
    category: "治理责任与授权",
    basis: "界面验证",
    materials: "界面验证",
    finding: "界面验证",
    data_source: "synthetic_graph",
    source_refs: [],
    version: 1,
    updated_at: "2026-11-13",
    severity: "一般",
    status: "需整改",
  };
  const rows = [
    {
      ...base,
      id: "action",
      title: "验证业务待办",
      item_kind: "action",
      origin: "company",
    },
    {
      ...base,
      id: "rectify",
      title: "验证整改待办",
      item_kind: "rectification",
      origin: "company",
    },
    {
      ...base,
      id: "risk",
      title: "验证集团交办",
      item_kind: "important_risk",
      origin: "group",
      severity: "重要",
    },
  ];
  await page.route("**/api/governance?*", (route) =>
    route.fulfill({ json: { rows, events: [], attachments: [] } }),
  );
  await page.goto("http://127.0.0.1:3100/governance");
  let nav = page
    .locator(".sidebar")
    .getByRole("navigation", { name: "集团监管业务导航" });
  await expect(
    nav.getByRole("button", { name: /下属单位监管/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    nav.getByRole("link", { name: "监管风险问题", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "治理事项审核", exact: true }),
  ).toBeVisible();
  await expect(nav.getByRole("link", { name: /集团合同风险/ })).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "制度知识库", exact: true }),
  ).toBeHidden();
  await nav.getByRole("button", { name: /制度与知识/ }).click();
  await expect(
    nav.getByRole("link", { name: "制度知识库", exact: true }),
  ).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "知识图谱解析", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/governance-group-navigation.png",
    fullPage: true,
  });
  await page.getByLabel("监管工作视角").selectOption("company");
  const hub = page.getByRole("region", { name: "治理工作台办理导航" });
  await expect(hub).toBeVisible();
  await expect(page.getByText("验证业务待办", { exact: true })).toBeVisible();
  await expect(page.getByText("验证整改待办", { exact: true })).toBeVisible();
  await expect(page.getByText("验证集团交办", { exact: true })).toBeVisible();
  await expect(hub.locator(".governance-routing-cards a")).toHaveCount(6);
  nav = page
    .locator(".sidebar")
    .getByRole("navigation", { name: "企业治理业务导航" });
  await expect(nav.getByRole("link", { name: /治理工作台/ })).toBeVisible();
  await expect(
    nav.getByRole("button", { name: /治理业务办理/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await nav.getByRole("button", { name: /治理业务办理/ }).click();
  await nav.getByRole("link", { name: "治理责任与授权", exact: true }).click();
  await expect(page).toHaveURL(/\/governance\/authority$/);
  await expect(
    nav.getByRole("link", { name: "治理责任与授权", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: /治理工作台/ }).click();
  await expect(hub).toBeVisible();
  await page.screenshot({
    path: ".local/governance-company-workbench.png",
    fullPage: true,
  });
  await hub.locator('a[href="/governance/rectification"]').last().click();
  await expect(page).toHaveURL(/\/governance\/rectification$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "展开导航", exact: true }).click();
  const mobile = page.getByRole("dialog");
  await expect(
    mobile.getByRole("navigation", { name: "企业治理业务导航" }),
  ).toBeVisible();
  await mobile.getByRole("button", { name: /治理依据/ }).click();
  await mobile.getByRole("link", { name: "公司治理档案", exact: true }).click();
  await expect(page).toHaveURL(/\/governance\/archives$/);
  await expect(mobile).not.toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    JSON.stringify({
      groupDomains: 3,
      companyHubEntries: 6,
      desktopNavigation: "passed",
      mobileNavigation: "passed",
      writes: false,
      fixture: "UI navigation fixtures only",
    }),
  );
} catch (e) {
  console.error(String(e.message).split("\n").slice(0, 8).join(" "));
  console.error(
    String(e.stack)
      .split("\n")
      .filter((line) => line.includes("verify-governance-navigation.mjs"))
      .join("\n"),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
