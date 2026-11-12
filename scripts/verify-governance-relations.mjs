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
  page.setDefaultTimeout(90000);
  await page.goto("http://127.0.0.1:3100/login");
  await page.getByRole("button", { name: "登录平台" }).click();
  await page.waitForURL(/\/operation/);
  // UI-only fixtures. No create/review/rectification request is submitted.
  const base = {
    company: "鲁盐泰安",
    company_id: 2,
    owner: "界面验证岗",
    deadline: "2026-12-01",
    category: "治理责任与授权",
    basis: "界面验证依据",
    materials: "界面验证材料",
    finding: "界面验证发现",
    data_source: "synthetic_graph",
    source_refs: [],
    version: 1,
    updated_at: "2026-11-13",
    origin: "company",
    payload: {},
    status: "需整改",
  };
  const rows = [
    {
      ...base,
      id: "10",
      title: "演练档案基线",
      item_kind: "archive",
      status: "已归档",
    },
    {
      ...base,
      id: "11",
      title: "授权办理原事项",
      item_kind: "action",
      parent_id: "10",
    },
    {
      ...base,
      id: "12",
      title: "会议履职原事项",
      category: "会议决议与履职",
      item_kind: "action",
      parent_id: "10",
      status: "已归档",
    },
    {
      ...base,
      id: "21",
      title: "整改任务一",
      item_kind: "rectification",
      parent_id: "11",
    },
    {
      ...base,
      id: "22",
      title: "整改任务二",
      item_kind: "rectification",
      parent_id: "11",
      status: "整改待验收",
    },
    {
      ...base,
      id: "23",
      title: "会议整改已验收",
      category: "会议决议与履职",
      item_kind: "rectification",
      parent_id: "12",
      status: "已闭环",
    },
    {
      ...base,
      id: "24",
      title: "来源待核实样例",
      category: "制度与合规自查",
      item_kind: "rectification",
      parent_id: null,
    },
  ];
  await page.route("**/api/governance?*", (route) =>
    route.fulfill({ json: { rows, events: [], attachments: [] } }),
  );
  await page.goto("http://127.0.0.1:3100/governance");
  await page.getByLabel("监管工作视角").selectOption("company");
  const hub = page.getByRole("region", { name: "治理工作台办理导航" });
  await expect(hub).toBeVisible();
  await hub
    .locator('.governance-routing-cards a[href="/governance/authority"]')
    .click();
  step = "business-to-rectification";
  const panel = page.getByRole("region", { name: "治理业务与整改闭环关系" });
  await expect(
    panel.getByRole("navigation", { name: "治理业务类型" }).getByRole("link"),
  ).toHaveCount(4);
  await expect(
    panel.getByText("治理环节 · 按事项选择适用办理", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".kpi").filter({ hasText: "本域管理动作" }).locator("strong"),
  ).toHaveText("1");
  await page
    .getByRole("button", { name: "查看关联整改（2）", exact: true })
    .click();
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByText("原事项关联的整改任务", { exact: true }),
  ).toBeVisible();
  await drawer
    .getByRole("button", { name: "整改任务一 · 需整改", exact: true })
    .click();
  await expect(
    drawer.getByRole("button", {
      name: "查看原业务：授权办理原事项",
      exact: true,
    }),
  ).toBeVisible();
  await drawer.getByLabel("治理办理说明").fill("此内容不得带到原业务表单");
  await drawer
    .getByRole("button", { name: "查看原业务：授权办理原事项", exact: true })
    .click();
  await expect(drawer.getByLabel("治理办理说明")).toHaveValue("");
  await page.locator(".ant-drawer-close").click();
  await expect(drawer).not.toBeVisible();
  await page.screenshot({
    path: ".local/governance-business-relations.png",
    fullPage: true,
  });
  step = "rectification-source-filter";
  await panel.getByRole("link", { name: /问题整改与验收/ }).click();
  await expect(
    page.getByRole("button", { name: "提交治理管理动作", exact: true }),
  ).toBeHidden();
  await page.getByLabel("整改来源业务").selectOption("会议决议与履职");
  await expect(
    page.locator(".governance-workbench tbody tr.ant-table-row"),
  ).toHaveCount(1);
  await expect(page.getByText("会议整改已验收", { exact: true })).toBeVisible();
  await expect(
    page.locator(".kpi").filter({ hasText: "关联整改任务" }).locator("strong"),
  ).toHaveText("1");
  await page.getByLabel("整改来源业务").selectOption("制度与合规自查");
  await expect(
    page.locator(".governance-workbench tbody tr.ant-table-row"),
  ).toHaveCount(0);
  await page.getByLabel("整改来源业务").selectOption("__unlinked__");
  await expect(
    page.locator(".governance-workbench tbody tr.ant-table-row"),
  ).toHaveCount(1);
  const orphan = page
    .locator(".governance-workbench tbody tr.ant-table-row")
    .filter({ hasText: "来源待核实样例" });
  await orphan
    .getByRole("button", { name: "整改反馈与验收", exact: true })
    .click();
  await expect(drawer.getByText("来源待核实", { exact: true })).toBeVisible();
  await page.locator(".ant-drawer-close").click();
  await expect(drawer).not.toBeVisible();
  await page.getByLabel("整改来源业务").selectOption("");
  await page.screenshot({
    path: ".local/governance-rectification-relations.png",
    fullPage: true,
  });
  step = "mobile";
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    panel.getByText("共用闭环层 · 跨业务处理", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/governance-relations-mobile.png",
    fullPage: true,
  });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    console.log(
      JSON.stringify(
        await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          overflow: [...document.querySelectorAll("body *")]
            .filter(
              (el) =>
                el.getBoundingClientRect().right > innerWidth + 1 &&
                getComputedStyle(el).position !== "fixed",
            )
            .slice(0, 12)
            .map((el) => ({
              tag: el.tagName,
              className: el.className,
              right: el.getBoundingClientRect().right,
            })),
        })),
      ),
    );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    JSON.stringify({
      businessTypes: 4,
      bidirectionalLinks: "passed",
      filter: "passed",
      orphanWarning: "passed",
      mobile: "passed",
      writes: false,
      fixture: "UI fixtures only",
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({ step, error: String(e.message).split("\n")[0] }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
