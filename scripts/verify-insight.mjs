import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
process.loadEnvFile(".env.local");
assert.ok(
  process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD,
  "Provide LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD",
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const db = postgres(process.env.APP_DATABASE_URL, {
  ssl: "require",
  prepare: false,
  max: 1,
  connect_timeout: 12,
});
const base = "http://127.0.0.1:3100",
  headers = { origin: base },
  created = [];
let page, request;
try {
  const context = await browser.newContext({
    baseURL: base,
    viewport: { width: 1500, height: 1050 },
  });
  request = context.request;
  const login = await request.post("/api/auth", {
    headers,
    data: {
      email: process.env.LIVE_TEST_EMAIL,
      password: process.env.LIVE_TEST_PASSWORD,
    },
    timeout: 90000,
  });
  assert.equal(login.status(), 200);
  async function chat(data) {
    const r = await request.post("/api/chat", {
      headers,
      data: { month: "2026-10", ...data },
      timeout: 150000,
    });
    const d = await r.json();
    assert.equal(r.status(), 200, d.error);
    return d;
  }
  let answer, follow;
  if (process.env.VERIFY_UI_ONLY) {
    const access = (await (await request.get("/api/access")).json()).session;
    const companies =
      await db`select id from public.company where name=any(${access.companies}::text[])`;
    const accessKey = createHash("sha256")
      .update(
        JSON.stringify({
          role: access.role.id,
          scope: access.user.scope,
          department: access.user.department,
          companies: companies.map((c) => Number(c.id)).sort((a, b) => a - b),
          permissions: [...access.permissions].sort(),
        }),
      )
      .digest("hex");
    const id = randomUUID(),
      now = new Date().toISOString();
    created.push(id);
    const payload = {
      answer: "联调模拟结果，仅用于分页和图表交互验证。",
      basis: "联调模拟，非ERP经营数据",
      query: "联调模拟结果",
      columns: ["产品", "销售额", "销量（吨）", "名义利润"],
      sample: 35,
      rows: Array.from({ length: 35 }, (_, i) => ({
        产品: `联调产品${i + 1}`,
        销售额: (i + 1) * 1000,
        "销量（吨）": i + 1,
        名义利润: i === 0 ? -100 : (i + 1) * 100,
      })),
      mode: "live",
    };
    await db`insert into platform.insight_conversation(id,user_id,access_key,title) values(${id},${access.user.id},${accessKey},'[联调验证] 助手界面交互')`;
    for (let i = 0; i < 2; i++)
      await db`insert into platform.insight_message(id,conversation_id,question,context,answer) values(${randomUUID()},${id},${`[联调验证] 界面交互${i + 1}`},${db.json({ month: "2026-10" })},${db.json(i === 0 ? payload : { ...payload, rows: payload.rows.slice(0, 1), sample: 1 })})`;
    answer = {
      ...payload,
      conversationId: id,
      turn: { answer: payload, createdAt: now },
    };
    follow = { conversationId: id, rows: [{}] };
    console.log(
      "Seeded clearly marked UI fixtures; actual model verified separately",
    );
  } else {
    answer = await chat({
      question:
        "[联调验证] 查询2026年1月至10月每个月各产品的销售额（元）、销量（吨）和名义利润（元），按月份、产品排序，返回最多150行明细。",
    });
    created.push(answer.conversationId);
    assert.ok(answer.rows.length > 20);
    let saved = await (
      await request.get(`/api/chat/history?id=${answer.conversationId}`)
    ).json();
    assert.equal(saved.messages.length, 1);
    assert.deepEqual(saved.messages[0].answer.rows, answer.rows);
    follow = await chat({
      conversationId: answer.conversationId,
      question:
        "[联调验证] 继续沿用刚才的统计范围，改为按公司汇总销售额与名义利润，按利润降序。",
    });
    assert.equal(follow.conversationId, answer.conversationId);
    saved = await (
      await request.get(`/api/chat/history?id=${answer.conversationId}`)
    ).json();
    assert.equal(saved.messages.length, 2);
    console.log(
      JSON.stringify({
        passed: "actual model query, follow-up and persistent history",
        rows: answer.rows.length,
        followUpRows: follow.rows.length,
      }),
    );
  }
  const access = await (await request.get("/api/access")).json();
  const denied = randomUUID();
  await db`insert into platform.insight_conversation(id,user_id,access_key,title) values(${denied},${access.session.user.id},'obsolete-permission-snapshot','[联调验证] 不应展示的旧权限会话')`;
  assert.equal(
    (await request.get(`/api/chat/history?id=${denied}`)).status(),
    404,
  );
  const list = await (await request.get("/api/chat/history")).json();
  assert.ok(!list.conversations.some((c) => c.id === denied));
  assert.equal(
    (
      await request.delete(`/api/chat/history?id=${denied}`, { headers })
    ).status(),
    404,
  );
  await db`delete from platform.insight_conversation where id=${denied}`;
  const fixtureIds = [];
  for (let i = 0; i < 5; i++) {
    const id = randomUUID();
    fixtureIds.push(id);
    await db`insert into platform.insight_message(id,conversation_id,question,context,answer) values(${id},${answer.conversationId},${`[联调验证] 历史翻页样例${i}`},${db.json({ month: "2026-10" })},${db.json(answer.turn.answer)})`;
  }
  const newest = await (
    await request.get(`/api/chat/history?id=${answer.conversationId}`)
  ).json();
  assert.equal(newest.messages.length, 5);
  assert.ok(newest.nextCursor);
  const older = await (
    await request.get(
      `/api/chat/history?id=${answer.conversationId}&before=${newest.nextCursor}`,
    )
  ).json();
  assert.equal(older.messages.length, 2);
  assert.ok(
    !older.messages.some((m) => newest.messages.some((n) => n.id === m.id)),
  );
  await db`delete from platform.insight_message where id=any(${fixtureIds}::uuid[])`;
  console.log(
    "PASS: permission snapshot isolation and history cursor pagination",
  );
  page = await context.newPage();
  page.setDefaultTimeout(90000);
  mkdirSync(".local", { recursive: true });
  const status = page.waitForResponse((r) => r.url().endsWith("/api/status"));
  await page.goto("/operation/reports");
  await status;
  await page.getByLabel("打开数据洞察助手", { exact: true }).click();
  await expect(page.locator(".question-turn")).toHaveCount(2, {
    timeout: 90000,
  });
  const result = page.locator(".question-result").first(),
    rows = result.locator(".ant-table-tbody tr[data-row-key]");
  await expect(rows).toHaveCount(10);
  const first = await rows.first().innerText();
  await result.locator(".ant-pagination-item-2").click();
  await expect(rows.first()).not.toHaveText(first);
  const changer = result.locator(
    ".ant-pagination-options-size-changer [role='combobox']",
  );
  await changer.focus();
  await changer.press("ArrowDown");
  await page
    .locator(".ant-select-item-option-content")
    .filter({ hasText: /^20/ })
    .filter({ visible: true })
    .click();
  await expect(rows).toHaveCount(20);
  await result.locator(".ant-pagination-item-2").click();
  await expect(rows).toHaveCount(Math.min(20, answer.rows.length - 20));
  const chart = result.locator(".question-adaptive-chart");
  await chart.locator("svg").waitFor();
  const type = result.getByLabel("图形类型", { exact: true });
  await type.focus();
  await type.press("ArrowDown");
  await page
    .locator(".ant-select-item-option-content")
    .filter({ hasText: /^条形图$/ })
    .filter({ visible: true })
    .click();
  await type.press("Escape");
  await page.screenshot({ path: ".local/insight-history-desktop.png" });
  const desktop = (await chart.boundingBox()).width;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(
      async () =>
        Number(await chart.locator("svg").first().getAttribute("width")),
      { timeout: 10000 },
    )
    .toBeLessThan(390);
  assert.ok((await chart.boundingBox()).width < desktop);
  assert.ok((await chart.boundingBox()).height <= 420);
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".local/insight-history-mobile.png" });
  await page.setViewportSize({ width: 1500, height: 1050 });
  const reloadedStatus = page.waitForResponse((r) =>
    r.url().endsWith("/api/status"),
  );
  await page.reload();
  await reloadedStatus;
  await page.getByLabel("打开数据洞察助手", { exact: true }).click();
  await expect(page.locator(".question-turn")).toHaveCount(2, {
    timeout: 90000,
  });
  await page.getByRole("button", { name: "新建会话", exact: true }).click();
  await expect(page.locator(".question-turn")).toHaveCount(0);
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/chat") && r.method() === "POST") posts++;
  });
  const input = page.getByLabel("业务问题", { exact: true });
  await input.fill("测试换行");
  await input.press("Shift+Enter");
  await input.pressSequentially("补充条件");
  assert.ok((await input.inputValue()).includes("\n"));
  assert.equal(posts, 0);
  await input.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    keyCode: 229,
  });
  assert.equal(posts, 0);
  await input.fill("[联调验证] 2026年10月订单不含税销售额合计是多少？");
  const sent = page.waitForResponse(
    (r) => r.url().endsWith("/api/chat") && r.request().method() === "POST",
    { timeout: 150000 },
  );
  await input.press("Enter");
  const response = await sent;
  const final = await response.json();
  assert.equal(response.status(), 200, final.error);
  created.push(final.conversationId);
  assert.equal(posts, 1);
  await expect(page.locator(".question-turn")).toHaveCount(1);
  await expect(input).toHaveValue("");
  console.log(
    "PASS: result paging/page-size, responsive SVG, reload history, Enter/Shift+Enter/IME",
  );
} catch (error) {
  if (page) {
    mkdirSync(".local", { recursive: true });
    await page.screenshot({ path: ".local/insight-failure.png" });
    console.log((await page.locator("body").innerText()).slice(-2400));
  }
  throw error;
} finally {
  if (request)
    for (const id of created)
      if (id)
        await request
          .delete(`/api/chat/history?id=${id}`, { headers })
          .catch(() => {});
  await db.end({ timeout: 2 });
  await browser.close();
}
