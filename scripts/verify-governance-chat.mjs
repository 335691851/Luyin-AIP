import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
process.loadEnvFile(".env.local");
assert.ok(
  process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD,
  "Provide LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD",
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const base = "http://127.0.0.1:3100";
mkdirSync(".local", { recursive: true });
try {
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 1500, height: 1050 },
  });
  const login = await context.request.post("/api/auth", {
    headers: { origin: base },
    data: {
      email: process.env.LIVE_TEST_EMAIL,
      password: process.env.LIVE_TEST_PASSWORD,
    },
    timeout: 90000,
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  const ready = page.waitForResponse((r) => r.url().endsWith("/api/status"));
  await page.goto("/governance/assistant");
  await ready;
  await page.getByLabel("监管工作视角").selectOption("company");
  await expect(page).toHaveURL(/\/governance$/);
  await page.getByRole("link", { name: "智能治理助手", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "智能治理助手对话" }),
  ).toBeVisible({ timeout: 45000 });
  await page.screenshot({
    path: ".local/governance-chat-welcome.png",
    animations: "disabled",
  });
  // Call the actual authenticated endpoint and inspect incremental network reads.
  const live = process.env.VERIFY_UI_ONLY
    ? {
        answer: "",
        sources: [
          {
            label: "界面验证样例",
            evidence: [
              {
                filename: "验证文档",
                quote: "仅用于界面验证，不代表真实制度。",
              },
            ],
          },
        ],
        graphStatus: "界面验证样例",
        done: true,
        first: 1,
        total: 2,
        deltas: 2,
        reads: 2,
      }
    : await page.evaluate(async () => {
        const started = Date.now();
        const response = await fetch("/api/governance/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: "鲁盐泰安",
            question: "经理层授权到期需要办理哪些手续？请简要列出步骤。",
            history: [],
          }),
        });
        if (!response.ok) throw Error(await response.text());
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let pending = "",
          answer = "",
          sources = [],
          done = false,
          first = 0,
          deltas = 0,
          reads = 0,
          graphStatus = "";
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          reads++;
          pending += decoder.decode(chunk.value, { stream: true });
          let n;
          while ((n = pending.indexOf("\n")) >= 0) {
            const event = JSON.parse(pending.slice(0, n));
            pending = pending.slice(n + 1);
            if (event.type === "delta") {
              if (!first) first = Date.now() - started;
              answer += event.text;
              deltas++;
            }
            if (event.type === "sources") {
              sources = event.sources;
              graphStatus = event.graphStatus;
            }
            if (event.type === "error") throw Error(event.message);
            if (event.type === "done") done = true;
          }
        }
        return {
          answer,
          sources,
          graphStatus,
          done,
          first,
          deltas,
          reads,
          total: Date.now() - started,
        };
      });
  assert.ok(live.done && live.deltas > 1 && live.reads > 1);
  if (!process.env.VERIFY_UI_ONLY) assert.ok(live.answer.length > 80);
  assert.ok(live.first < live.total);
  console.log(
    JSON.stringify({
      live: !process.env.VERIFY_UI_ONLY,
      characters: live.answer.length,
      sources: live.sources.length,
      graphStatus: live.graphStatus,
      firstTokenMs: live.first,
      totalMs: live.total,
      deltas: live.deltas,
      reads: live.reads,
    }),
  );
  // Deterministic visual/keyboard checks do not trigger another model call.
  let calls = 0;
  const fixture =
    "## 办理建议\n\n**先核对授权有效期**，再提交材料。\n\n| 步骤 | 材料 |\n| --- | --- |\n| 1 | 授权书 |\n| 2 | 审议记录 |\n\n- 明确责任人\n- 留档审批结果\n\n<script>alert(1)</script>\n[不安全链接](javascript:alert(1))";
  await page.route("**/api/governance/chat", async (route) => {
    calls++;
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body:
        [
          {
            type: "sources",
            sources: live.sources,
            graphStatus: live.graphStatus,
          },
          { type: "delta", text: fixture },
          { type: "done" },
        ]
          .map((e) => JSON.stringify(e))
          .join("\n") + "\n",
    });
  });
  const input = page.getByRole("textbox", { name: "治理问题" });
  await input.fill("授权到期如何办理？");
  await input.press("Shift+Enter");
  assert.equal(calls, 0);
  await input.press("Enter");
  await expect(page.locator(".governance-markdown h2")).toHaveText("办理建议");
  await expect(page.locator(".governance-markdown table tbody tr")).toHaveCount(
    2,
  );
  await expect(page.locator(".governance-markdown strong")).toHaveText(
    "先核对授权有效期",
  );
  assert.equal(await page.locator(".governance-markdown script").count(), 0);
  assert.equal(
    await page.locator('.governance-markdown a[href^="javascript:"]').count(),
    0,
  );
  await page.screenshot({
    path: ".local/governance-chat-answer.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: ".local/governance-chat-mobile.png",
    animations: "disabled",
  });
  await page.unroute("**/api/governance/chat");
  // A waiting request can be stopped without clearing prior content.
  await page.route("**/api/governance/chat", async (route) => {
    await new Promise((r) => setTimeout(r, 1800));
    await route.abort().catch(() => {});
  });
  await input.fill("继续说明");
  await input.press("Enter");
  await page.getByRole("button", { name: "停止生成" }).click();
  await expect(page.getByText("已停止生成", { exact: false })).toBeVisible();
  await page.unroute("**/api/governance/chat");
  await page.route("**/api/governance/chat", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "验证：服务暂不可用" }),
    }),
  );
  await input.fill("验证服务失败提示");
  await input.press("Enter");
  await expect(
    page.getByRole("region", { name: "智能治理助手对话" }).getByRole("alert"),
  ).toContainText("验证：服务暂不可用");
  await expect(page.locator(".governance-markdown h2")).toHaveText("办理建议");
  console.log(
    "UI passed: Markdown, safe links, Enter/Shift+Enter, mobile overflow, cancellation.",
  );
} finally {
  await browser.close();
}
