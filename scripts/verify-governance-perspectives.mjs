import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
let b,
  c,
  p,
  step = "login";
const origin = "http://127.0.0.1:3100";
try {
  b = await chromium.launch({ channel: "msedge", headless: true });
  c = await b.newContext({
    baseURL: origin,
    viewport: { width: 1600, height: 1100 },
  });
  assert.equal(
    (await c.request.get("/api/governance?view=group")).status(),
    401,
  );
  assert.equal(
    (
      await c.request.post("/api/auth", {
        headers: { origin },
        data: {
          email: process.env.LIVE_TEST_EMAIL,
          password: process.env.LIVE_TEST_PASSWORD,
        },
      })
    ).status(),
    200,
  );
  p = await c.newPage();
  p.setDefaultTimeout(60000);
  await p.goto("/governance");
  const switchView = async (title) => {
    await p
      .getByRole("combobox", { name: "监管工作视角", exact: true })
      .selectOption({ label: title });
  };
  step = "company_menus";
  await switchView("公司治理与自查");
  await p.getByRole("button", { name: "提交治理自查", exact: true }).waitFor();
  assert.equal(
    await p
      .locator(".sidebar .nav-link")
      .filter({ hasText: "集团合同风险" })
      .count(),
    0,
  );
  assert.equal(
    await p
      .locator(".sidebar .nav-link")
      .filter({ hasText: "公司治理档案" })
      .count(),
    1,
  );
  step = "company_submits_real_record";
  await p.getByRole("button", { name: "提交治理自查", exact: true }).click();
  const dialog = p.getByRole("dialog");
  await dialog
    .getByLabel("事项标题", { exact: true })
    .fill("联调核查：双视角治理流程（非正式治理事项）");
  await dialog.getByLabel("责任人", { exact: true }).fill("联调测试");
  await dialog.getByLabel("办理期限", { exact: true }).fill("2026-12-01");
  await dialog
    .getByLabel("适用制度、版本与条款依据", { exact: true })
    .fill("联调测试依据，非有效制度，不作为实际合规判断。");
  await dialog
    .getByLabel("材料引用与核查记录", { exact: true })
    .fill("联调测试材料引用，无真实文件。");
  await dialog
    .getByLabel("自查结果与需集团关注的问题", { exact: true })
    .fill("联调测试：核查提交、整改和验收闭环，不用于真实业务。");
  const pending = p.waitForResponse(
    (r) =>
      r.url().endsWith("/api/governance") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "确认提交", exact: true }).click();
  const response = await pending;
  assert.equal(response.status(), 200);
  const { id } = await response.json();
  step = "group_menus_and_scope";
  await switchView("集团监管视角");
  await p
    .getByRole("heading", { name: "集团监管事项总览", exact: true })
    .waitFor();
  assert.equal(
    await p
      .locator(".sidebar .nav-link")
      .filter({ hasText: "集团合同风险" })
      .count(),
    1,
  );
  assert.equal(
    await p
      .locator(".sidebar .nav-link")
      .filter({ hasText: "公司治理档案" })
      .count(),
    0,
  );
  const read = async (view, company = "") => {
    const r = await c.request.get(
      `/api/governance?${new URLSearchParams({ view, company })}`,
      { timeout: 60000 },
    );
    assert.equal(r.status(), 200);
    return r.json();
  };
  let all = await read("group"),
    item = all.rows.find((r) => r.id === id);
  assert.ok(item);
  const unit = item.company;
  assert.ok(
    (await read("company", unit)).rows.every((r) => r.company === unit),
  );
  assert.equal(
    (
      await c.request.get("/api/governance?view=company&company=NOT_AUTHORIZED")
    ).status(),
    403,
  );
  const act = async (view, action, version) =>
    c.request.post("/api/governance", {
      headers: { origin },
      data: {
        view,
        company: unit,
        id,
        version,
        action,
        note: "端到端联调验证，不代表实际治理审批。",
      },
    });
  step = "company_cannot_review";
  assert.equal((await act("company", "归档通过", item.version)).status(), 409);
  step = "group_requests_rectification";
  assert.equal((await act("group", "要求整改", item.version)).status(), 200);
  item = (await read("company", unit)).rows.find((r) => r.id === id);
  assert.equal(item.status, "需整改");
  step = "company_reports_rectification";
  assert.equal((await act("company", "提交整改", item.version)).status(), 200);
  item = (await read("group")).rows.find((r) => r.id === id);
  assert.equal(item.status, "整改待验收");
  step = "group_accepts_and_audit_persists";
  assert.equal((await act("group", "验收销项", item.version)).status(), 200);
  all = await read("group");
  assert.equal(all.rows.find((r) => r.id === id).status, "已闭环");
  assert.equal(all.events.filter((e) => e.item_id === id).length, 4);
  assert.equal((await act("group", "验收销项", item.version)).status(), 409);
  await p.reload();
  await p
    .getByRole("heading", { name: "集团监管事项总览", exact: true })
    .waitFor();
  await p.screenshot({ path: ".local/governance-group.png", fullPage: true });
  await switchView("公司治理与自查");
  await p.getByRole("button", { name: "提交治理自查", exact: true }).waitFor();
  await p.screenshot({ path: ".local/governance-company.png", fullPage: true });
  console.log(
    JSON.stringify({
      step: "two_perspective_governance_e2e",
      state: "passed",
      testItem: id,
    }),
  );
} catch (e) {
  console.error(String(e.message).split("\n")[0]);
  console.error(JSON.stringify({ step, state: "failed" }));
  await p
    ?.screenshot({ path: ".local/governance-test-failure.png" })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await c?.request.delete("/api/auth", { headers: { origin } }).catch(() => {});
  await b?.close();
}
