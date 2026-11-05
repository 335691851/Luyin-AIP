import { test, expect } from "@playwright/test";

const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
).origin;

test("period query rejects invalid months and consistently limits report data", async ({
  request,
}) => {
  const invalid = await request.get("/api/reports?month=2026-13");
  expect(invalid.status()).toBe(400);
  const october = await request.get("/api/reports?month=2026-10");
  expect(october.ok()).toBe(true);
  const data = await october.json();
  expect(data.rows.length).toBeGreaterThan(0);
  expect(
    data.rows.every((row: { date: string }) => row.date.startsWith("2026-10")),
  ).toBe(true);
  const empty = await request.get("/api/reports?month=2000-01");
  expect((await empty.json()).rows).toEqual([]);
  expect(
    (
      await request.get("/api/reports?month=2026-10&company=未授权公司")
    ).status(),
  ).toBe(403);
});

test("connection checks reject cross-origin requests and unknown services", async ({
  request,
}) => {
  const denied = await request.post("/api/integrations/check", {
    data: { service: "DeepSeek Flash" },
  });
  expect(denied.status()).toBe(403);
  const unknown = await request.post("/api/integrations/check", {
    headers: { origin },
    data: { service: "unrecognized" },
  });
  expect(unknown.status()).toBe(400);
  // An invalid service never triggers a remote model request or database write.
});

// These fixture scenarios deliberately require the isolated local sample mode.
test.beforeEach(async ({ request }) => {
  const status = await (await request.get("/api/status")).json();
  test.skip(
    status.mode !== "demo",
    "样例流程仅在APP_DEMO_MODE=true时执行；真实账号使用独立验证脚本",
  );
});
