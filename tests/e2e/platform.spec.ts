import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
test("fixed report canvas, contextual question drawer and matching report export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/operation");
  await expect(
    page.getByRole("heading", { name: "销售月报", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("本地演示空间", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "经营总览", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "数据洞察助手", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "问数语义建模", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "订单业绩", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "结构分析", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /占比饼图/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /排名柱状图/ })).toBeVisible();
  const table = await page.locator(".report-table-area").boundingBox(),
    body = await page.locator(".report-body").boundingBox();
  expect(table!.width / body!.width).toBeGreaterThan(0.6);
  await page.getByRole("tab", { name: "产品分类报表", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "产品分类报表", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载报表" }).click();
  const file = await download;
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await readFile((await file.path())!)) as never);
  const sheet = book.worksheets[0];
  expect(sheet.getCell("A3").value).toBe("产品类型");
  expect(sheet.getCell("B3").value).toBe("订单业绩");
  expect(sheet.getCell("D3").value).toBe("结构分析");
  expect(sheet.getCell("A3").isMerged).toBe(true);
  await page
    .getByRole("button", { name: "打开数据洞察助手", exact: true })
    .click();
  const question = page.getByRole("dialog", { name: "数据洞察助手", exact: true });
  await expect(question).toBeVisible();
  await question
    .getByRole("button", { name: /本月名义利润最高的5个产品/ })
    .click();
  await expect(question.getByText("规则演示 · 未调用模型")).toBeVisible();
  await question.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("link", { name: "名义利润分析", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "产品利润贡献", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "公司利润对照", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "公司利润对照", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("one list row per application and independent review inside the whole batch", async ({
  page,
}) => {
  await page.goto("/operation/pricing");
  await expect(
    page.getByRole("button", { name: "整批分析与审核" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "整批分析与审核" }).first().click();
  const drawer = page.getByRole("dialog", {
    name: "调价申请 · 整批分析与审核",
    exact: true,
  });
  await expect(drawer.getByText("AI 整批评估", { exact: true })).toBeVisible();
  await expect(
    drawer.getByRole("cell", { name: /精制食用盐 500g/ }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("cell", { name: /天然海盐 400g/ }),
  ).toBeVisible();
  await drawer
    .getByLabel("L-001审核意见", { exact: true })
    .fill("人工核实后的演示批准，仅本行有效");
  await drawer
    .getByRole("button", { name: "L-001通过", exact: true })
    .first()
    .click();
  await expect(
    drawer.getByRole("cell", { name: "已通过", exact: true }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("cell", { name: "待审核", exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "整批分析与审核" }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "整批分析与审核" }).first().click();
  await expect(
    page.getByRole("cell", { name: "已通过", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "待审核", exact: true }),
  ).toBeVisible();
});
test("coordination information cards and independent administration", async ({
  page,
}) => {
  await page.goto("/operation/coordination");
  await expect(page.getByText("本地演示空间", { exact: true })).toBeVisible();
  await expect(page.locator(".candidate-card")).toHaveCount(2);
  await expect(
    page.getByText("首次入库", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /工厂备货缺口/ }).click();
  await expect(page.locator(".candidate-card")).toHaveCount(1);
  await expect(page.getByText("预计需求", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "进入管理后台", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/integrations/);
  await expect(page.getByText("管理后台", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "产销协同建议", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "问数语义建模", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "问数语义建模", exact: true }),
  ).toBeVisible();
});
test("governance remains intact and the floating question drawer works on mobile", async ({
  page,
}) => {
  await page.goto("/governance/checks");
  await page.getByRole("button", { name: "发起事项", exact: true }).click();
  await page.getByLabel("事项名称", { exact: true }).fill("治理自查测试");
  await page.getByLabel("责任人", { exact: true }).fill("演示经办");
  await page.getByLabel("办理期限", { exact: true }).fill("2026-11-30");
  await page
    .getByLabel("事项及材料说明", { exact: true })
    .fill("本地演示材料说明");
  await page.getByRole("button", { name: "确 定", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "治理自查测试", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/operation/reports");
  await expect(
    page.getByRole("heading", { name: "销售月报", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await page
    .getByRole("button", { name: "打开数据洞察助手", exact: true })
    .click();
  await expect(page.getByLabel("业务问题", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /语音|录音/ })).toHaveCount(0);
  await page.screenshot({
    path: "evidence/v2-mobile-drawer.png",
    fullPage: true,
    animations: "disabled",
  });
});

// These fixture scenarios deliberately require the isolated local sample mode.
test.beforeEach(async ({ request }) => {
  const status = await (await request.get("/api/status")).json();
  test.skip(
    status.mode !== "demo",
    "样例流程仅在APP_DEMO_MODE=true时执行；真实账号使用独立验证脚本",
  );
});
