import { test, expect } from "@playwright/test";
const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
).origin;

test.beforeEach(async ({ request }) => {
  const status = await (await request.get("/api/status")).json();
  test.skip(status.mode !== "live", "真实权限边界仅在正式连接模式验证");
});

test("live pages and data require an actual session", async ({
  page,
  request,
}) => {
  for (const path of [
    "/api/access",
    "/api/reports?month=2026-10",
    "/api/export?month=2026-10",
    "/api/knowledge-graph?view=ontology",
    "/api/governance?view=group",
    "/api/reports/daily?date=2026-10-26",
    "/api/pricing",
    "/api/contracts/risk?month=2026-10",
    "/api/governance/files?id=1",
    "/api/chat/history",
  ]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  await page.goto("/operation/reports");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("企业邮箱", { exact: true })).toBeVisible();
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/login$/);
});

test("local preview cookies cannot grant live access and auth rejects forged origins", async ({
  request,
}) => {
  const forged = await request.get("/api/access", {
    headers: { Cookie: "luyin-preview-user=demo-admin" },
  });
  expect(forged.status()).toBe(401);
  const login = await request.post("/api/auth", {
    data: { email: "invalid", password: "invalid" },
  });
  expect(login.status()).toBe(403);
  const malformed = await request.post("/api/auth", {
    headers: { origin },
    data: { email: "invalid", password: "invalid" },
  });
  expect(malformed.status()).toBe(400);
  expect((await request.delete("/api/auth")).status()).toBe(403);
  expect(
    (
      await request.post("/api/access", {
        headers: { origin },
        data: { action: "switch", userId: "demo-admin" },
      })
    ).status(),
  ).toBe(403);
});
