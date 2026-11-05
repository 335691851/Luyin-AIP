import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Live credentials stay in the invoking process. No trace, cookie dump or login screenshot.
const origin = new URL(
  process.env.LIVE_TEST_BASE_URL || "http://127.0.0.1:3100",
).origin;
let browser,
  page,
  step = "configuration";
try {
  assert.ok(process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD);
  browser = await chromium.launch({
    channel: process.platform === "win32" ? "msedge" : undefined,
    headless: true,
  });
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1600, height: 1100 },
  });
  const get = (path) => context.request.get(path, { timeout: 60000 });
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 180)));
  const check = async (name, run) => {
    step = name;
    await run();
    console.log(JSON.stringify({ step, state: "passed" }));
  };
  await check("anonymous_graph_denied", async () => {
    assert.equal((await get("/api/knowledge-graph")).status(), 401);
  });
  await check("real_login", async () => {
    const r = await context.request.post("/api/auth", {
      headers: { origin },
      data: {
        email: process.env.LIVE_TEST_EMAIL,
        password: process.env.LIVE_TEST_PASSWORD,
      },
    });
    assert.equal(r.status(), 200);
  });
  let graph;
  await check("live_ontology_and_browser", async () => {
    const r = await get("/api/knowledge-graph");
    assert.equal(r.status(), 200);
    graph = await r.json();
    assert.ok(
      graph.nodes.length > 0 &&
        graph.edges.length > 0 &&
        graph.documents.length > 0,
    );
    assert.equal(graph.nodes.length, graph.summary.classes);
    assert.equal(
      graph.edges.filter((e) => !e.inherited).length,
      graph.summary.objectProperties,
    );
    await page.goto("/governance/graph");
    await page
      .getByRole("img", { name: "领域本体交互关系图", exact: true })
      .waitFor();
    await page.locator(".kg-canvas canvas").waitFor();
    console.log(
      JSON.stringify({
        classes: graph.nodes.length,
        relations: graph.summary.objectProperties,
        documents: graph.documents.length,
      }),
    );
  });
  await check("node_search_focus_and_relation_navigation", async () => {
    await page
      .getByLabel("查找图谱节点或关系", { exact: true })
      .fill(graph.nodes[0].label);
    const button = page
      .locator(".kg-node-list button")
      .filter({
        has: page.locator("strong", { hasText: graph.nodes[0].label }),
      })
      .first();
    step = "search_select_node";
    await button.click();
    step = "focus_node";
    await page
      .getByRole("button", { name: "仅看一跳关系", exact: true })
      .click();
    await page
      .getByRole("button", { name: "退出一跳视图", exact: true })
      .waitFor();
    const relation = page.locator(".kg-relations button").first();
    if (await relation.count()) {
      step = "select_relation";
      await relation.click();
      await page
        .getByRole("heading", { name: "关系解析", exact: true })
        .waitFor();
      await page.locator(".kg-relation-expression button").first().click();
      await page
        .getByRole("heading", { name: "节点解析", exact: true })
        .waitFor();
    }
    await page.getByRole("button", { name: "重置视图", exact: true }).click();
    step = "toggle_relation_labels";
    await page.getByLabel("关系名称", { exact: true }).check();
    await page.screenshot({
      path: ".local/knowledge-graph-ontology.png",
      fullPage: true,
    });
  });
  await check("document_entities_properties_and_provenance", async () => {
    const r = await get("/api/knowledge-graph?view=instances");
    assert.equal(r.status(), 200);
    const instances = await r.json();
    assert.ok(instances.nodes.length > 0);
    console.log(
      JSON.stringify({
        entities: instances.nodes.length,
        instanceRelations: instances.edges.length,
      }),
    );
    await page.getByRole("button", { name: "实体关系", exact: true }).click();
    await page
      .getByRole("img", { name: "制度实体交互关系图", exact: true })
      .waitFor();
    const conflictId =
      "https://mini-ontorag.vercel.app/ontology/legal-audit/v1/PolicyClause/11abd9566c";
    const candidate =
      instances.nodes.find((n) => n.id === conflictId) ||
      instances.nodes.find((n) => n.type === "PolicyClause") ||
      instances.nodes[0];
    await page
      .getByLabel("查找图谱节点或关系", { exact: true })
      .fill(candidate.label);
    await page
      .locator(".kg-node-list button")
      .filter({ has: page.locator("strong", { hasText: candidate.label }) })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "抽取属性", exact: true })
      .waitFor();
    await page.getByRole("heading", { name: /原文依据/ }).waitFor();
    const detailResponse = await get(
      `/api/knowledge-graph?view=instances&iri=${encodeURIComponent(candidate.id)}`,
    );
    assert.equal(detailResponse.status(), 200);
    const detail = await detailResponse.json();
    assert.ok(detail.properties.length > 0);
    assert.ok(detail.evidence.length > 0);
    if (candidate.id === conflictId) assert.equal(detail.conflict, true);
    const doc = detail.evidence.find((e) => e.documentId)?.documentId;
    assert.ok(doc);
    const scopedResponse = await get(
      `/api/knowledge-graph?view=instances&document=${doc}`,
    );
    assert.equal(scopedResponse.status(), 200);
    const scoped = await scopedResponse.json();
    assert.ok(
      scoped.nodes.length > 0 && scoped.nodes.length <= instances.nodes.length,
    );
    const scopedDetail = await get(
      `/api/knowledge-graph?document=${doc}&iri=${encodeURIComponent(candidate.id)}`,
    );
    assert.equal(scopedDetail.status(), 200);
    assert.ok(
      (await scopedDetail.json()).evidence.every(
        (e) => !e.documentId || e.documentId === doc,
      ),
    );
    await page.screenshot({
      path: ".local/knowledge-graph-detail.png",
      fullPage: true,
    });
  });
  await check("invalid_queries_are_rejected", async () => {
    assert.equal(
      (await get("/api/knowledge-graph?document=invalid")).status(),
      400,
    );
    assert.equal(
      (
        await get(
          `/api/knowledge-graph?iri=${encodeURIComponent("https://example.org/a> ?s ?p ?o")}`,
        )
      ).status(),
      400,
    );
  });
  await check("mobile_layout_and_browser_errors", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "领域本体", exact: true }).click();
    await page
      .getByRole("img", { name: "领域本体交互关系图", exact: true })
      .waitFor();
    await page.screenshot({
      path: ".local/knowledge-graph-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    if (errors.length) console.log(JSON.stringify({ browserErrors: errors }));
    assert.equal(errors.length, 0);
  });
  await context.request.delete("/api/auth", { headers: { origin } });
} catch {
  if (page && step !== "real_login")
    await page
      .screenshot({
        path: ".local/knowledge-graph-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  console.error(JSON.stringify({ step, state: "failed" }));
  process.exitCode = 1;
} finally {
  await browser?.close();
}
