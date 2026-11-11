import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

// Real browser gestures against live graph data; does not modify business data.
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  baseURL: process.env.VERIFY_BASE_URL || "http://127.0.0.1:3100",
  viewport: { width: 1600, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
let step = "login";
mkdirSync(".local", { recursive: true });
try {
  await page.goto("/login");
  if (process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD) {
    await page.getByLabel("企业邮箱").fill(process.env.LIVE_TEST_EMAIL);
    await page
      .getByLabel("密码", { exact: true })
      .fill(process.env.LIVE_TEST_PASSWORD);
  }
  await page.getByRole("button", { name: "登录平台" }).click();
  await page.waitForURL(/\/operation/, { timeout: 90000 });
  await page.goto("/governance/graph");
  await page.locator(".kg-canvas canvas").waitFor();

  // Test-only inspection through React refs; no production debug API or globals.
  const inspect = async (action = "state") =>
    page.evaluate((action) => {
      const element = document.querySelector(".kg-canvas");
      let fiber =
        element[Object.keys(element).find((k) => k.startsWith("__reactFiber"))];
      let chart;
      while (fiber && !chart) {
        for (let hook = fiber.memoizedState; hook; hook = hook.next) {
          if (typeof hook.memoizedState?.current?.getOption === "function")
            chart = hook.memoizedState.current;
        }
        fiber = fiber.return;
      }
      if (!chart) throw Error("chart not ready");
      const series = chart.getModel().getSeriesByIndex(0);
      const data = series.getData();
      if (action === "settled")
        return !chart.getViewOfSeriesModel(series)._layouting;
      const rect = element.getBoundingClientRect();
      const points = [];
      for (let i = 0; i < data.count(); i++) {
        const graphic = data.getItemGraphicEl(i);
        const matrix = graphic?.getComputedTransform();
        if (matrix) {
          let hit = chart
            .getZr()
            .handler.findHover(matrix[4], matrix[5]).target;
          while (hit && hit !== graphic) hit = hit.parent || hit.__hostTarget;
          points.push({
            i,
            x: rect.left + matrix[4],
            y: rect.top + matrix[5],
            hittable: hit === graphic,
            diameter:
              graphic.childAt(0).getBoundingRect().width *
              Math.abs(graphic.childAt(0).getComputedTransform()[0]),
          });
        }
      }
      return {
        points,
        zoom: chart.getOption().series[0].zoom,
        center: series.coordinateSystem.dataToPoint([0, 0]),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scroll: window.scrollY,
      };
    }, action);
  for (const view of ["领域本体", "实体关系"]) {
    step = `${view}:load`;
    await page.getByRole("button", { name: view, exact: true }).click();
    await page.locator(".kg-canvas canvas").waitFor();
    await page.locator(".kg-canvas").scrollIntoViewIfNeeded();
    await expect.poll(() => inspect("settled"), { timeout: 25000 }).toBe(true);
    const state = await inspect();
    assert.ok(state.points.length > 0);
    assert.ok(
      state.points.every((p) => p.diameter <= 14),
      "dots stay small at initial scale",
    );
    await page
      .locator(".kg-canvas-wrap")
      .screenshot({
        path: `.local/graph-readable-${view === "领域本体" ? "ontology" : "instances"}.png`,
      });
    step = `${view}:node-drag`;
    await page.getByRole("button", { name: "拖动节点模式" }).click();
    for (let repetition = 0; repetition < 3; repetition++) {
      await expect
        .poll(() => inspect("settled"), { timeout: 25000 })
        .toBe(true);
      const before = await inspect();
      const node = before.points.find(
        (p) =>
          p.hittable &&
          p.x > before.rect.x + 60 &&
          p.x < before.rect.x + before.rect.width - 140 &&
          p.y > before.rect.y + 100 &&
          p.y < Math.min(950, before.rect.y + before.rect.height - 120),
      );
      assert.ok(node, "visible draggable node");
      await page.mouse.move(node.x, node.y);
      await page.mouse.down();
      await page.mouse.move(node.x + 75, node.y + 45, { steps: 15 });
      await page.waitForTimeout(80);
      const moved = (await inspect()).points.find((p) => p.i === node.i);
      assert.ok(
        Math.hypot(moved.x - node.x - 75, moved.y - node.y - 45) < 15,
        `node follows pointer while held: ${JSON.stringify({ node, moved })}`,
      );
      await page.mouse.up();
    }
    step = `${view}:pan-over-node`;
    await page.getByRole("button", { name: "平移画布模式" }).click();
    await expect(
      page.getByRole("button", { name: "平移画布模式" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => inspect("settled"), { timeout: 25000 }).toBe(true);
    const before = await inspect();
    const node = before.points.find(
      (p) =>
        p.x > before.rect.x + 50 &&
        p.x < before.rect.x + before.rect.width - 160 &&
        p.y > before.rect.y + 100 &&
        p.y < 900,
    );
    assert.ok(node);
    await page.mouse.move(node.x, node.y);
    await page.mouse.down();
    await page.mouse.move(node.x + 60, node.y + 35, { steps: 12 });
    await page.mouse.up();
    const after = await inspect();
    assert.ok(
      Math.abs(after.center[0] - before.center[0] - 60) < 3,
      "pan starts over a node",
    );
    assert.equal(
      after.scroll,
      before.scroll,
      "graph gestures do not scroll page",
    );
    step = `${view}:zoom-and-labels`;
    await page.getByRole("button", { name: "放大图谱", exact: true }).click();
    const zoomed = await inspect();
    assert.ok(zoomed.zoom > after.zoom);
    await page.getByLabel("关系名称", { exact: true }).check();
    const labeled = await inspect();
    assert.equal(labeled.zoom, zoomed.zoom, "label toggle preserves zoom");
    for (const point of zoomed.points) {
      const next = labeled.points.find((p) => p.i === point.i);
      assert.ok(
        Math.hypot(next.x - point.x, next.y - point.y) < 1,
        "label toggle preserves dragged node positions",
      );
    }
    assert.ok(
      Math.hypot(
        labeled.center[0] - zoomed.center[0],
        labeled.center[1] - zoomed.center[1],
      ) < 1,
      "label toggle preserves pan",
    );
    await page.getByRole("button", { name: "缩小图谱", exact: true }).click();
    assert.ok(Math.abs((await inspect()).zoom - after.zoom) < 0.001);
    await page.getByRole("button", { name: "拖动节点模式" }).click();
    await page.getByLabel("关系名称", { exact: true }).uncheck();
    for (let i = 0; i < 10; i++)
      await page.getByRole("button", { name: "放大图谱", exact: true }).click();
    await page.mouse.move(10, 10);
    const maximum = await inspect();
    assert.ok(
      maximum.points.every((p) => p.diameter <= 14),
      "dots stay small at maximum zoom",
    );
    await page.getByRole("button", { name: "重置视图", exact: true }).click();
    console.log(
      JSON.stringify({
        view,
        nodes: state.points.length,
        repeatedDrag: 3,
        panAndZoom: "passed",
      }),
    );
  }
  step = "mobile";
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "平移画布模式" }),
  ).toBeVisible();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  console.log(JSON.stringify({ step, state: "passed" }));
} catch (error) {
  console.error(
    JSON.stringify({ step, error: String(error.message).split("\n")[0] }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
