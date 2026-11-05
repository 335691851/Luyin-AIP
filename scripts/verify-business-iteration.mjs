import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const baseURL = process.env.LIVE_TEST_BASE_URL || "http://127.0.0.1:3100";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
  headless: true,
});
try {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1500, height: 1000 },
  });
  const req = context.request;
  const headers = { origin: baseURL };
  async function get(path) {
    const r = await req.get(path, { timeout: 90000 });
    const d = await r.json();
    assert.equal(r.status(), 200, `${path}: ${d.error || r.status()}`);
    return d;
  }
  async function post(path, data) {
    const r = await req.post(path, { headers, data, timeout: 90000 });
    const d = await r.json();
    assert.equal(r.status(), 200, `${path}: ${d.error || r.status()}`);
    return d;
  }
  await post("/api/auth", {
    email: process.env.LIVE_TEST_EMAIL,
    password: process.env.LIVE_TEST_PASSWORD,
  });
  let created = { id: "TJ-SIM-V2-7-1" };
  if (!process.env.VERIFY_AI_ONLY) {
    const sales = await get("/api/reports?month=2026-10");
    assert.equal(sales.rows.length, 504);
    const sum = (k) =>
      Number(sales.rows.reduce((n, r) => n + Number(r[k]), 0).toFixed(2));
    assert.equal(sum("revenue"), 7022060.55);
    assert.equal(sum("costAmount"), 5627325.87);
    assert.equal(
      Number((sum("revenue") - sum("costAmount")).toFixed(2)),
      1394734.68,
    );
    console.log("PASS: online ERP order profit reconciliation");
    const prices = await get("/api/pricing");
    assert.ok(prices.history.length >= 1200);
    assert.ok(prices.rows.length >= 21);
    const product = prices.materials[0];
    created = await post("/api/pricing", {
      action: "create",
      company: "鲁盐泰安",
      rows: [1, 2].map((i) => ({
        materialId: product.id,
        product: product.name,
        original: 1000,
        requested: 950 + i,
        qty: i,
        reason: `[联调模拟] 第${i}行申请，核查各行独立审批，不执行ERP调价`,
      })),
    });
    let batch = (await get("/api/pricing")).rows.find(
      (r) => r.id === created.id,
    );
    assert.equal(batch.lines.length, 2);
    await post("/api/pricing", {
      action: "review",
      id: batch.id,
      lineId: "1",
      version: 1,
      status: "已通过",
      note: "[联调模拟] 测试逐行审核持久化",
      approved: 960,
    });
    batch = (await get("/api/pricing")).rows.find((r) => r.id === created.id);
    assert.equal(batch.lines[0].status, "已通过");
    assert.equal(batch.lines[1].status, "待审核");
    const stale = await req.post("/api/pricing", {
      headers,
      data: {
        action: "review",
        id: batch.id,
        lineId: "1",
        version: 1,
        status: "已驳回",
        note: "[联调模拟] 旧版本不得覆盖",
      },
    });
    assert.equal(stale.status(), 409);
    console.log(
      "PASS: create price batch, independent line review, stale conflict",
    );
    const company = "鲁盐泰安";
    const path =
      "/api/governance?view=company&company=" + encodeURIComponent(company);
    let gov = await get(path);
    assert.equal(gov.rows.filter((r) => r.item_kind === "archive").length, 4);
    assert.ok(gov.attachments.length >= 4);
    const action = await post("/api/governance", {
      view: "company",
      company,
      action: "create",
      category: "会议决议与履职",
      title: "[联调模拟] 决议材料审核与关联整改",
      owner: "联调模拟经办人",
      deadline: "2026-12-31",
      basis: "只读章程及会议议事规范样例，非真实决议",
      materials: "模拟会议记录，提交后补充签署材料",
      finding: "模拟签署不完整，验证审核退回自动生成整改",
    });
    gov = await get(path);
    let item = gov.rows.find((r) => r.id === action.id);
    assert.equal(item.status, "待公司审核");
    await post("/api/governance", {
      view: "company",
      company,
      action: "审核退回",
      id: item.id,
      version: item.version,
      note: "[联调模拟] 缺少参会董事签署，生成关联整改",
    });
    gov = await get(path);
    let child = gov.rows.find(
      (r) => String(r.parent_id) === item.id && r.item_kind === "rectification",
    );
    assert.ok(child);
    const upload = await req.post("/api/governance/files", {
      headers,
      multipart: {
        itemId: child.id,
        file: {
          name: "联调模拟-整改签署.md",
          mimeType: "text/markdown",
          buffer: Buffer.from(
            "模拟整改：已补充全体参会董事签署，重新确认出席和回避记录。仅验证平台流程。",
          ),
        },
      },
    });
    assert.equal(upload.status(), 200);
    await post("/api/governance", {
      view: "company",
      company,
      action: "提交整改",
      id: child.id,
      version: child.version,
      note: "[联调模拟] 已上传补签证明与复核说明",
    });
    gov = await get(path);
    child = gov.rows.find((r) => r.id === child.id);
    assert.equal(child.status, "整改待验收");
    await post("/api/governance", {
      view: "company",
      company,
      action: "公司验收",
      id: child.id,
      version: child.version,
      note: "[联调模拟] 公司复核完成，关闭关联整改",
    });
    gov = await get(path);
    assert.equal(gov.rows.find((r) => r.id === item.id).status, "已归档");
    assert.equal(gov.rows.find((r) => r.id === child.id).status, "已闭环");
    const f = gov.attachments.find((a) => a.item_id === child.id);
    const download = await req.get("/api/governance/files?id=" + f.id);
    assert.equal(download.status(), 200);
    assert.ok((await download.body()).includes(Buffer.from("模拟整改")));
    console.log(
      "PASS: governance submission, review, child rectification, file persistence and closure",
    );
    const group = await get("/api/governance?view=group");
    const risks = group.rows.filter((r) => r.item_kind === "important_risk"),
      reviews = group.rows.filter(
        (r) => r.item_kind === "action" && r.status === "待审核",
      );
    assert.ok(risks.length >= 14 && reviews.length >= 7);
    assert.ok(!risks.some((r) => reviews.some((v) => v.id === r.id)));
    console.log("PASS: group risk and review populations are distinct");
    const contracts = await get("/api/contracts/risk?month=2026-10");
    assert.ok(contracts.rows.length > 0);
    assert.ok(contracts.rows.every((r) => Array.isArray(r.issues)));
    console.log("PASS: group ERP contract-voucher-accounting checks");
  }
  const company = "鲁盐泰安";
  if (!process.env.VERIFY_UI_ONLY) {
    for (const question of [
      "2026年10月各法人收入、成本、名义利润和利润率是多少？",
      "2026年10月海盐的销售情况，按产品汇总销量和销售额",
    ]) {
      const d = await post("/api/chat", {
        question,
        month: "2026-10",
        company: "",
      });
      assert.ok(d.columns?.length && d.rows.length);
      assert.ok(!d.query.includes("public."));
      console.log(
        JSON.stringify({
          step: "NLP2SQL live model",
          question,
          rows: d.rows.length,
        }),
      );
    }
    const assessment = await post("/api/pricing", {
      action: "analyze",
      id: created.id,
    });
    assert.ok(assessment.text.length > 30);
    console.log("PASS: pricing live agent evidence assessment");
    const generated = await post("/api/governance", {
      view: "company",
      company,
      action: "generate",
    });
    assert.ok(Number.isInteger(generated.created));
    console.log("PASS: governance agent creates actions from company archives");
    const chat = await post("/api/governance/chat", {
      company,
      question: "经理层授权到期前需要准备什么材料？请区分样例要求和通用建议。",
      history: [],
    });
    assert.ok(chat.answer.length > 30);
    console.log("PASS: governance chat with archive and graph retrieval");
  }
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.goto("/operation/reports");
  await page.getByRole("tab", { name: "法人销售月报", exact: true }).waitFor();
  assert.equal(
    await page.getByText("区域销售报表", { exact: true }).count(),
    0,
  );
  await page.goto("/operation/profit");
  await page.getByRole("tab", { name: "订单利润明细", exact: true }).waitFor();
  assert.equal(
    await page.getByText("区域利润分析", { exact: true }).count(),
    0,
  );
  await page.getByText("1,394,734.68", { exact: true }).first().waitFor();
  await page.screenshot({
    path: ".local/business-v2-profit.png",
    fullPage: true,
  });
  await page.goto("/governance/risks");
  assert.equal(
    await page
      .getByRole("button", { name: "打开数据洞察助手", exact: true })
      .count(),
    0,
  );
  assert.equal(await page.getByText("整改督办", { exact: true }).count(), 0);
  await page
    .getByRole("heading", { name: "监管风险问题", exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("cell")
    .filter({ hasText: "对外担保事项前置决策证据缺项" })
    .first()
    .waitFor();
  await page.screenshot({
    path: ".local/business-v2-governance.png",
    fullPage: true,
  });
  await page
    .getByLabel("监管工作视角", { exact: true })
    .selectOption("company");
  await page.getByRole("link", { name: "公司治理档案", exact: true }).click();
  await page
    .getByRole("heading", { name: "公司治理档案与核心章程", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("当前治理公司", { exact: true }).inputValue(),
    "鲁盐泰安",
  );
  await page
    .getByText("鲁盐泰安 · 公司章程与议事权限（规范样例）", { exact: true })
    .waitFor();
  await page.screenshot({
    path: ".local/business-v2-company-archives.png",
    fullPage: true,
  });
  console.log(
    "PASS: business page navigation and governance assistant isolation",
  );
  await req.delete("/api/auth", { headers });
} finally {
  await browser.close();
}
