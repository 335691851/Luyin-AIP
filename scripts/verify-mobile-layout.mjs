import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
assert.ok(
  process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD,
  "Provide LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD",
);
const base = process.env.LIVE_TEST_BASE_URL || "http://127.0.0.1:3100";
mkdirSync(".local", { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const c = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  assert.equal(
    (
      await c.request.post("/api/auth", {
        headers: { origin: new URL(base).origin },
        data: {
          email: process.env.LIVE_TEST_EMAIL,
          password: process.env.LIVE_TEST_PASSWORD,
        },
      })
    ).status(),
    200,
  );
  const p = await c.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  async function open(path) {
    const ready = p.waitForResponse((r) => r.url().endsWith("/api/status"));
    await p.goto(path);
    await ready;
  }
  async function fits(name) {
    const width = await p.evaluate(() => ({
      actual: document.documentElement.scrollWidth,
      expected: innerWidth,
    }));
    assert.ok(
      width.actual <= width.expected + 1,
      `${name}: page overflow ${JSON.stringify(width)}`,
    );
  }
  await open("/operation/reports");
  await p.locator('input[type="month"]').fill("2026-10");
  await expect(p.locator(".report-row-name").first()).toBeVisible({
    timeout: 60000,
  });
  await fits("sales");
  await p.screenshot({
    path: ".local/mobile-sales-loaded.png",
    animations: "disabled",
  });
  const table = p
    .locator(
      ".report-table-area .ant-table-body, .report-table-area .ant-table-content",
    )
    .first();
  assert.ok(await table.evaluate((e) => e.scrollWidth > e.clientWidth));
  await table.evaluate((e) => (e.scrollLeft = e.scrollWidth));
  await fits("table scrolling");
  for (const width of [320, 390, 768]) {
    await p.setViewportSize({ width, height: 844 });
    await fits(`sales ${width}`);
  }
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole("button", { name: "展开导航" }).click();
  const nav = p.getByRole("dialog", { name: "工作导航" });
  await expect(nav).toBeVisible();
  const nb = await nav.boundingBox();
  assert.ok(nb.width < 390);
  await nav.getByRole("link", { name: "名义利润分析", exact: true }).click();
  await expect(nav).not.toBeVisible();
  await expect(
    p.getByRole("heading", { name: "名义利润分析", exact: true }),
  ).toBeVisible();
  await p.getByRole("button", { name: "展开导航" }).click();
  await p.keyboard.press("Escape");
  await expect(nav).not.toBeVisible();
  await p.getByLabel("打开数据洞察助手", { exact: true }).click();
  await expect(p.getByLabel("选择常见问题填入输入框")).toBeEnabled({
    timeout: 30000,
  });
  await p.getByLabel("选择常见问题填入输入框").selectOption("products");
  const input = p.getByRole("textbox", { name: "业务问题" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(/10个产品/);
  const compose = await p.locator(".question-compose").boundingBox();
  assert.ok(compose.y + compose.height <= 845);
  assert.equal(
    await input.evaluate((e) => getComputedStyle(e).fontSize),
    "16px",
  );
  await p.screenshot({
    path: ".local/mobile-insight-ready.png",
    animations: "disabled",
  });
  // Simulate the visual viewport shrinking as a mobile keyboard opens.
  await p.evaluate(() =>
    document.documentElement.style.setProperty(
      "--visual-viewport-height",
      "540px",
    ),
  );
  await expect
    .poll(async () => {
      const box = await p.locator(".question-compose").boundingBox();
      return box.y + box.height;
    })
    .toBeLessThanOrEqual(541);
  await p.evaluate(() => window.dispatchEvent(new Event("resize")));
  await p.keyboard.press("Escape");
  await open("/operation/pricing");
  await expect(
    p.getByRole("button", { name: "新建申请", exact: true }),
  ).toBeEnabled({ timeout: 45000 });
  await p.getByRole("button", { name: "新建申请", exact: true }).click();
  const modal = p.getByRole("dialog");
  await expect(modal).toBeVisible();
  assert.ok(await modal.evaluate((e) => e.scrollWidth <= e.clientWidth + 1));
  await fits("pricing modal");
  const modalBox = await modal.boundingBox();
  assert.ok(
    modalBox.y >= 0 && modalBox.y + modalBox.height <= 845,
    "pricing modal stays within viewport",
  );
  await expect(
    modal.getByRole("button", { name: "提交申请", exact: true }),
  ).toBeInViewport();

  await p.screenshot({
    path: ".local/mobile-pricing-form.png",
    animations: "disabled",
  });
  await p.keyboard.press("Escape");
  await open("/governance");
  await p.getByLabel("监管工作视角").selectOption("company");
  await p.getByRole("button", { name: "展开导航" }).click();
  await nav.getByRole("link", { name: "智能治理助手", exact: true }).click();
  await expect(p.getByRole("region", { name: "智能治理助手对话" })).toBeVisible(
    { timeout: 45000 },
  );
  await fits("governance");
  assert.ok((await p.locator(".topbar").boundingBox()).height < 130);
  await p.screenshot({
    path: ".local/mobile-governance-chat-ready.png",
    animations: "disabled",
  });
  await p.getByRole("button", { name: "展开导航" }).click();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await expect(nav).not.toBeVisible();
  await fits("desktop");
  await p.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/admin/integrations", "/admin/users", "/login"]) {
    await p.goto(path);
    await fits(path);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real sales table, horizontal scrolling, 320/390/768px, navigation/Escape/desktop resize, draft selection, keyboard viewport, pricing form, governance chat, no runtime errors.",
  );
} finally {
  await browser.close();
}
