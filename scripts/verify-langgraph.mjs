import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";

// Uses the configured login or the explicitly prefilled public demonstration login.
// This test calls the real model/ERP and updates one existing batch's AI assessment, never its review status.
try {
  process.loadEnvFile(".env.local");
} catch {}
const base = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  baseURL: base,
  viewport: { width: 1440, height: 1000 },
});
const conversations = new Set();
mkdirSync(".local", { recursive: true });
try {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/login");
  if (process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD) {
    await page.getByLabel("企业邮箱").fill(process.env.LIVE_TEST_EMAIL);
    await page
      .getByLabel("密码", { exact: true })
      .fill(process.env.LIVE_TEST_PASSWORD);
  }
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue(/.+/);
  const login = page.waitForResponse(
    (r) => r.url().endsWith("/api/auth") && r.request().method() === "POST",
    { timeout: 90000 },
  );
  await page.getByRole("button", { name: "登录平台" }).click();
  assert.equal((await login).status(), 200, "real login failed");
  await page.waitForURL(/\/operation/, { timeout: 90000 });
  if (!process.argv.includes("--pricing-only")) {
    await page
      .getByRole("button", { name: "打开数据洞察助手", exact: true })
      .click();
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
      { timeout: 130000 },
    );
    await page
      .getByRole("textbox", { name: "业务问题", exact: true })
      .fill("2026年10月各公司的订单销售额是多少？");
    await page.getByRole("button", { name: "发送问题", exact: true }).click();
    const answerResponse = await response;
    const answer = await answerResponse.json();
    assert.equal(
      answerResponse.status(),
      200,
      answer.error || "insight failed",
    );
    assert.equal(answer.workflow?.engine, "langgraph");
    assert.ok(answer.workflow.steps.includes("execute_query"));
    assert.ok(answer.rows.length > 0);
    conversations.add(answer.conversationId);
    await expect(page.getByText(answer.answer, { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await page.screenshot({
      path: ".local/langgraph-insight.png",
      animations: "disabled",
    });
    console.log(
      JSON.stringify({
        scene: "insight-ui",
        status: 200,
        rows: answer.rows.length,
        workflow: answer.workflow,
      }),
    );

    // A follow-up uses the same persisted conversation and a second real graph run.
    const follow = await context.request.post("/api/chat", {
      headers: { origin: base },
      timeout: 130000,
      data: {
        question: "只保留销售额最高的前三家公司",
        month: "2026-10",
        conversationId: answer.conversationId,
      },
    });
    const next = await follow.json();
    assert.equal(follow.status(), 200, next.error || "follow-up failed");
    assert.equal(next.workflow?.engine, "langgraph");
    assert.equal(next.conversationId, answer.conversationId);
    assert.ok(next.rows.length > 0 && next.rows.length <= 3);
    console.log(
      JSON.stringify({
        scene: "insight-follow-up",
        status: 200,
        rows: next.rows.length,
        workflow: next.workflow,
      }),
    );
  }

  // Load the pricing page explicitly; the question drawer has its own navigation context.
  const batchesHttp = await context.request.get("/api/pricing", {
    timeout: 90000,
  });
  assert.equal(batchesHttp.status(), 200);
  const batches = await batchesHttp.json();
  const multi = batches.rows.find(
    (b) => b.lines.length >= 2 && b.lines.length <= 4,
  );
  assert.ok(
    multi,
    "Prepare an existing 2–4 line pricing batch for full batch verification",
  );
  await page.goto("/operation/pricing");
  await page.getByPlaceholder("搜索产品、事项或编号").fill(multi.id);
  await page
    .getByRole("button", { name: multi.id, exact: true })
    .click({ timeout: 90000 });
  const pricingResponse = page.waitForResponse(
    (r) => r.url().endsWith("/api/pricing") && r.request().method() === "POST",
    { timeout: 90000 },
  );
  await page
    .getByRole("button", { name: /智能评估|重新评估|生成评估|整批评估/ })
    .click();
  const pricingHttp = await pricingResponse;
  let pricing;
  if (
    (pricingHttp.headers()["content-type"] || "").includes(
      "application/x-ndjson",
    )
  ) {
    await expect(
      page.getByLabel("整批智能评估建议", { exact: true }),
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("button", { name: "停止生成", exact: true }),
    ).toBeVisible();
    const events = (await pricingHttp.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      events.filter((e) => e.type === "delta").length > 1,
      "Must receive actual incremental model chunks",
    );
    assert.ok(
      !events.some((e) => e.type === "error"),
      "Stream returned an error",
    );
    pricing = events.find((e) => e.type === "done")?.result;
    assert.ok(pricing, "Completed and persisted assessment required");
  } else pricing = await pricingHttp.json();
  assert.equal(pricingHttp.status(), 200, pricing.error || "pricing failed");
  assert.equal(pricing.workflow?.engine, "langgraph");
  assert.equal(pricing.findings.length, pricing.evidence.lines.length);
  assert.equal(pricing.findings.length, multi.lines.length);
  assert.ok(pricing.text.length > 20);
  assert.ok(
    pricing.evidence.missing.length > 0,
    "missing financial evidence must stay explicit",
  );
  await expect(
    page.getByLabel("整批智能评估建议", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await page.screenshot({
    path: ".local/langgraph-pricing.png",
    animations: "disabled",
  });
  const requestBody = pricingHttp.request().postDataJSON();
  const persisted = await (
    await context.request.get("/api/pricing", { timeout: 90000 })
  ).json();
  assert.equal(
    persisted.rows.find((r) => r.id === requestBody.id)?.ai_text,
    pricing.text,
  );
  console.log(
    JSON.stringify({
      scene: "pricing-ui-and-storage",
      status: 200,
      lines: pricing.findings.length,
      salesEvidence: pricing.evidence.sales30Days.length,
      inventoryEvidence: pricing.evidence.inventory.length,
      workflow: pricing.workflow,
    }),
  );
  assert.deepEqual(errors, []);
} catch (error) {
  // Playwright transport errors can contain Cookie headers; never print their full call logs.
  console.error(
    error instanceof Error
      ? error.message.split("\n")[0]
      : "Verification failed",
  );
  if (error instanceof Error)
    console.error(
      error.stack
        ?.split("\n")
        .filter((line) => line.includes("verify-langgraph.mjs"))
        .join("\n"),
    );
  process.exitCode = 1;
} finally {
  for (const id of conversations) {
    if (id)
      await context.request
        .delete(`/api/chat/history?id=${encodeURIComponent(id)}`, {
          headers: { origin: base },
        })
        .catch(() => {});
  }
  await browser.close();
}
