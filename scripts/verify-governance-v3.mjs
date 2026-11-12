import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
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
  step = "seeded-data";
  const company = await page.evaluate(
    async () =>
      await (
        await fetch(
          "/api/governance?view=company&company=" +
            encodeURIComponent("鲁盐泰安"),
        )
      ).json(),
  );
  assert.ok(company.rows.filter((r) => r.item_kind === "archive").length >= 12);
  const children = company.rows.filter((r) =>
    r.seed_key?.startsWith("gov-v3:rectify:"),
  );
  assert.equal(children.length, 3);
  assert.equal(new Set(children.map((r) => r.status)).size, 3);
  assert.ok(
    children.every((r) =>
      company.rows.some((p) => p.id === String(r.parent_id)),
    ),
  );
  const contracts = await page.evaluate(
    async () => await (await fetch("/api/contracts/risk?month=2026-10")).json(),
  );
  assert.equal(
    contracts.rows.filter((r) => r.data_source === "platform_simulation")
      .length,
    4,
  );
  step = "material-stream-ui";
  // Reuse the authenticated live company snapshot for UI rendering to avoid
  // concurrent dashboard refreshes competing with this material-stream test.
  await page.route("**/api/governance?*", route => route.fulfill({json:company}));
  await page.goto("http://127.0.0.1:3100/governance");
  await page.locator(".governance-workbench table").waitFor();
  await page.screenshot({path:".local/governance-v3-debug.png",fullPage:true});
  await page
    .getByRole("button", { name: "查看与办理", exact: true })
    .first()
    .click();
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/governance") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /智能核查材料/ }).click();
  const res = await response;
  assert.equal(res.status(), 200);
  assert.ok(res.headers()["content-type"].includes("ndjson"));
  const lines = (await res.text()).trim().split("\n").map(JSON.parse);
  assert.ok(lines.filter((e) => e.type === "delta").length > 3);
  assert.equal(lines.at(-1).type, "done");
  await expect(
    page.locator(".ant-drawer .governance-markdown strong").first(),
  ).toBeVisible();
  console.log(
    JSON.stringify({
      archives: company.rows.filter((r) => r.item_kind === "archive").length,
      rectifications: children.length,
      contractSamples: 4,
      materialDeltas: lines.filter((e) => e.type === "delta").length,
    }),
  );
  step = "governance-chat-latency";
  const latency = await page.evaluate(async () => {
    const start = Date.now();
    let first = 0,
      deltas = 0,
      pending = "";
    const decoder = new TextDecoder();
    const response = await fetch("/api/governance/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: "鲁盐泰安",
        question: "经理授权到期怎么办？请简要回答。",
        history: [],
      }),
    });
    const reader = response.body.getReader();
    let done = false;
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      pending += decoder.decode(r.value, { stream: true });
      let i;
      while ((i = pending.indexOf("\n")) >= 0) {
        const event = JSON.parse(pending.slice(0, i));
        pending = pending.slice(i + 1);
        if (event.type === "error") throw Error(event.message);
        if (event.type === "delta") {
          deltas++;
          first ||= Date.now() - start;
        }
        if (event.type === "done") done = true;
      }
    }
    return { firstMs: first, totalMs: Date.now() - start, deltas, done };
  });
  assert.equal(latency.done, true);
  assert.ok(latency.deltas > 3);
  console.log(JSON.stringify(latency));
} catch (e) {
  console.error(
    JSON.stringify({ step, error: String(e.message).split("\n")[0] }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
