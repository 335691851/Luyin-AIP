import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
assert.ok(
  process.env.LIVE_TEST_EMAIL && process.env.LIVE_TEST_PASSWORD,
  "Provide LIVE_TEST_EMAIL and LIVE_TEST_PASSWORD in process environment",
);
mkdirSync(".local", { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: "msedge", headless: true });
  let p;
  try {
    const c = await b.newContext({
      baseURL: "http://127.0.0.1:3100",
      viewport: { width: 1500, height: 1000 },
    });
    const login = await c.request.post("/api/auth", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        email: process.env.LIVE_TEST_EMAIL,
        password: process.env.LIVE_TEST_PASSWORD,
      },
      timeout: 90000,
    });
    assert.equal(login.status(), 200);
    console.log("PASS: actual account login");
    p = await c.newPage();
    p.setDefaultTimeout(90000);
    const data = p.waitForResponse(
      (r) =>
        r.url().includes("/api/pricing?") && r.request().method() === "GET",
    );
    await p.goto("/operation/pricing");
    assert.equal((await data).status(), 200);
    await p.getByRole("button", { name: "新建申请", exact: true }).click();
    const modal = p.getByRole("dialog");
    await modal.waitFor();
    console.log(
      JSON.stringify({
        step: "pricing form",
        comboboxes: await modal.getByRole("combobox").count(),
      }),
    );
    await modal.getByRole("combobox").nth(1).click();
    await p
      .locator(".ant-select-item-option-content")
      .filter({ visible: true })
      .first()
      .click();
    await modal.getByLabel("数量（吨）", { exact: true }).fill("1");
    await modal.getByLabel("原价", { exact: true }).fill("1000");
    await modal.getByLabel("申请价", { exact: true }).fill("950");
    await modal
      .getByLabel("调价理由与依据", { exact: true })
      .fill("[联调模拟] 验证网页新建申请可以持久化，不执行ERP调价。");
    const response = p.waitForResponse(
      (r) =>
        r.url().endsWith("/api/pricing") && r.request().method() === "POST",
    );
    await modal.getByRole("button", { name: "提交申请", exact: true }).click();
    const r = await response;
    const d = await r.json();
    assert.equal(r.status(), 200, d.error);
    await p.getByRole("button", { name: d.id, exact: true }).waitFor();
    await p.screenshot({
      path: ".local/business-v2-pricing.png",
      fullPage: true,
    });
    console.log(
      "PASS: pricing browser form submission and saved batch visibility",
    );
  } catch (e) {
    if (p) {
      await p.screenshot({ path: ".local/pricing-form-failure.png" });
      console.log((await p.locator("body").innerText()).slice(-1500));
    }
    throw e;
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
