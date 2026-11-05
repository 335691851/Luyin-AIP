import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
let b,
  c,
  p,
  step = "login";
const origin = "http://127.0.0.1:3100";
try {
  b = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    headless: true,
  });
  c = await b.newContext({
    baseURL: origin,
    viewport: { width: 1600, height: 1100 },
  });
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
  const read = async (view, company = "") => {
    const r = await c.request.get(
      `/api/governance?${new URLSearchParams({ view, company })}`,
      { timeout: 60000 },
    );
    assert.equal(r.status(), 200);
    return r.json();
  };
  let all = await read("group");
  const samples = all.rows.filter((r) => r.data_source === "synthetic_graph");
  assert.equal(samples.length, 66);
  assert.equal(new Set(samples.map((r) => r.company_id)).size, 11);
  assert.ok(
    samples.every((r) => r.source_refs.length && r.title.includes("演练")),
  );
  const item = samples.find((r) => r.status === "待审核");
  const unit = item.company;
  assert.ok(
    (await read("company", unit)).rows.every((r) => r.company === unit),
  );
  step = "group_sample_ui";
  p = await c.newPage();
  p.setDefaultTimeout(60000);
  p.on("requestfailed", (r) =>
    console.log(
      JSON.stringify({ browserRequestFailure: r.failure()?.errorText }),
    ),
  );
  await p.goto("/governance");
  await p
    .getByText(
      "当前范围包含 66 条演练事项；可办理并留痕，不代表企业真实风险或违规",
      { exact: true },
    )
    .waitFor();
  await p
    .locator(".governance-workbench tbody tr.ant-table-row")
    .first()
    .waitFor();
  await p
    .getByRole("button", { name: "查看与办理", exact: true })
    .first()
    .click();
  await p.getByRole("heading", { name: "图谱参考来源", exact: true }).waitFor();
  await p
    .getByText("演练事项：虚拟创建用于流程操作，不代表企业真实问题", {
      exact: true,
    })
    .waitFor();
  await p.locator(".ant-drawer-close").click();
  step = "source_filter";
  await p
    .getByRole("combobox", { name: "治理数据来源", exact: true })
    .selectOption("manual");
  assert.equal(
    await p.locator(".governance-workbench tbody tr.ant-table-row").count(),
    1,
  );
  await p
    .getByRole("combobox", { name: "治理数据来源", exact: true })
    .selectOption("");
  step = "contract_and_policy_data";
  await p.locator('.sidebar a.nav-link[href="/governance/contracts"]').click();
  await p
    .getByRole("heading", { name: "年度合同覆盖核查事项", exact: true })
    .waitFor();
  await p
    .locator(".governance-workbench tbody tr.ant-table-row")
    .first()
    .waitFor();
  await p.locator('.sidebar a.nav-link[href="/governance/policies"]').click();
  await p
    .getByRole("heading", { name: "关联制度候选目录", exact: true })
    .waitFor();
  await p
    .getByRole("cell", { name: /合规管理办法/ })
    .first()
    .waitFor();
  step = "sample_feedback_preserves_provenance";
  const act = (view, action, version) =>
    c.request.post("/api/governance", {
      headers: { origin },
      data: {
        view,
        company: unit,
        id: item.id,
        version,
        action,
        note: "演练联调：补正流程核验，不作为实际业务审核。",
      },
    });
  assert.equal((await act("group", "退回补正", item.version)).status(), 200);
  const changed = (await read("company", unit)).rows.find(
    (r) => r.id === item.id,
  );
  assert.equal(changed.status, "待补正");
  assert.equal(changed.data_source, "synthetic_graph");
  assert.equal(
    (await act("company", "提交补正", changed.version)).status(),
    200,
  );
  all = await read("group");
  assert.equal(all.rows.find((r) => r.id === item.id).status, "待审核");
  assert.equal(
    all.rows.find((r) => r.id === item.id).data_source,
    "synthetic_graph",
  );
  assert.ok(
    all.events
      .filter((e) => e.item_id === item.id)
      .some((e) => e.action === "提交补正"),
  );
  await p.goto("/governance");
  await p
    .getByText(
      "当前范围包含 66 条演练事项；可办理并留痕，不代表企业真实风险或违规",
      { exact: true },
    )
    .waitFor();
  await p.screenshot({
    path: ".local/governance-seeded-data.png",
    fullPage: true,
  });
  console.log(
    JSON.stringify({
      step: "seeded_governance_e2e",
      state: "passed",
      samples: 66,
      companies: 11,
    }),
  );
} catch (e) {
  console.error(String(e.message).split("\n")[0]);
  console.error(JSON.stringify({ step, state: "failed" }));
  await p
    ?.screenshot({ path: ".local/governance-seeded-failure.png" })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  await c?.request.delete("/api/auth", { headers: { origin } }).catch(() => {});
  await b?.close();
}
