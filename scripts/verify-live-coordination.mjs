import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
let browser,
  context,
  page,
  step = "configuration";
const origin = "http://127.0.0.1:3100";
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1600, height: 1100 },
  });
  const get = (path) => context.request.get(path, { timeout: 60000 });
  assert.equal((await get("/api/coordination")).status(), 401);
  step = "login";
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
  step = "real_erp_candidates";
  const r = await get("/api/coordination");
  assert.equal(r.status(), 200);
  const d = await r.json();
  assert.ok(d.candidates.length);
  console.log(
    JSON.stringify({ step, counts: d.counts, truncated: d.truncated }),
  );
  step = "scope_is_enforced";
  assert.equal(
    (await get("/api/coordination?company=NOT_AUTHORIZED")).status(),
    403,
  );
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto("/operation/coordination");
  await page.locator(".candidate-card").first().waitFor();
  step = "open_evidence";
  await page
    .getByRole("button", { name: "查看依据 / 处理", exact: true })
    .first()
    .click();
  await page
    .getByRole("heading", { name: "ERP数据依据", exact: true })
    .waitFor();
  step = "real_deepseek_analysis";
  const ai = page.waitForResponse(
    (r) =>
      r.url().includes("/api/coordination") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "生成AI分析", exact: true }).click();
  const aiResponse = await ai;
  assert.equal(aiResponse.status(), 200);
  const analysis = await aiResponse.json();
  assert.ok(analysis.aiText.length > 30);
  await page
    .getByRole("button", { name: "重新生成AI分析", exact: true })
    .waitFor();
  console.log(JSON.stringify({ step, state: "passed" }));
  step = "persist_pending_review";
  const note =
    "端到端联调核查：待定，待业务核实库存时点与实际需求；不下达业务指令。";
  await page.getByLabel("建议处理说明", { exact: true }).fill(note);
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/coordination") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "保存处理结果", exact: true }).click();
  assert.equal((await saved).status(), 200);
  await page
    .locator(".coordination-history")
    .getByText(note, { exact: true })
    .first()
    .waitFor();
  step = "reload_history_and_snapshot";
  await page.reload();
  await page
    .locator(".coordination-history")
    .getByText(note, { exact: true })
    .first()
    .waitFor();
  await page
    .locator(".coordination-history")
    .getByRole("button", { name: "查看快照", exact: true })
    .first()
    .click();
  await page
    .getByText(
      "这是处理当时的证据快照，不代表当前库存；处理意见和操作时间见记录列表。",
      { exact: true },
    )
    .waitFor();
  assert.ok(
    (await page.locator(".coordination-ai-text").innerText()).length > 30,
  );
  await page.locator(".ant-drawer-close").click();
  await page.screenshot({
    path: ".local/coordination-live-review.png",
    fullPage: true,
  });
  step = "stale_version_rejected";
  const c = d.candidates[0];
  const conflict = await context.request.post("/api/coordination", {
    headers: { origin },
    data: {
      id: c.id,
      evidenceKey: c.evidenceKey,
      company: c.company,
      version: c.version,
      action: "decide",
      decision: "待定",
      note,
    },
  });
  assert.equal(conflict.status(), 409);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(
    JSON.stringify({ step: "live_coordination_e2e", state: "passed" }),
  );
} catch {
  console.error(JSON.stringify({ step, state: "failed" }));
  await page
    ?.screenshot({ path: ".local/coordination-failure.png", fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await context?.request
    .delete("/api/auth", { headers: { origin } })
    .catch(() => {});
  await browser?.close();
}
