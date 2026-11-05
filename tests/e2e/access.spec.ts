import { test, expect } from "@playwright/test";
const origin = new URL(
  process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
).origin;
test("simple user and role screens expose organization and operation mappings", async ({
  page,
}) => {
  await page.goto("/admin/users");
  const initial = await (await page.request.get("/api/access")).json();
  const user = initial.users.find(
    (u: { id: string }) => u.id === "demo-business",
  );
  expect(
    (
      await page.request.post("/api/access", {
        headers: { origin },
        data: { action: "saveUser", user },
      })
    ).ok(),
  ).toBe(true);
  const role = initial.roles.find(
    (r: { id: string }) => r.id === "business_viewer",
  );
  expect(
    (
      await page.request.post("/api/access", {
        headers: { origin },
        data: {
          action: "saveRole",
          roleId: role.id,
          permissions: role.permissions,
        },
      })
    ).ok(),
  ).toBe(true);

  await expect(
    page.getByRole("heading", { name: "用户管理", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "营销部门经办人", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增用户", exact: true }).click();
  await expect(page.getByLabel("所属法人", { exact: true })).toBeVisible();
  await expect(page.getByLabel("数据范围", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取 消", exact: true }).click();
  await page.getByRole("link", { name: "角色权限映射", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "角色权限映射", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "调价逐行审核", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "后台用户与配置管理", exact: true }),
  ).toBeDisabled();
});
test("role preview filters data and changes menu plus independent approval actions", async ({
  page,
}) => {
  await page.goto("/operation/reports");
  await page
    .getByRole("combobox", { name: "切换角色视角", exact: true })
    .click();
  await page
    .getByRole("option", { name: "岱岳工厂负责人 · 工厂负责人", exact: true })
    .click();
  await expect(page.getByText("角色预览中", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "调价辅助决策", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "进入管理后台", exact: true }),
  ).toHaveCount(0);
  let r = await page.request.get("/api/reports");
  const data = await r.json();
  expect(data.rows.length).toBeGreaterThan(0);
  expect(
    data.rows.every(
      (s: { company: string }) => s.company === "山东岱岳制盐有限公司",
    ),
  ).toBe(true);
  await page.goto("/operation/pricing");
  await expect(
    page.getByRole("heading", { name: "当前角色无此页面权限", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "结束预览", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users/);
  r = await page.request.post("/api/access", {
    headers: { origin },
    data: { action: "switch", userId: "demo-venture" },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/operation/pricing");
  await expect(
    page.getByRole("button", { name: "新建申请", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "整批分析与审核" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "整批分析与审核" }).click();
  await expect(
    page.getByRole("button", { name: "L-001通过", exact: true }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/export")).status()).toBe(403);
  expect(
    (
      await page.request.post("/api/access", {
        headers: { origin },
        data: {
          action: "saveRole",
          roleId: "venture_operator",
          permissions: ["admin.manage"],
        },
      })
    ).status(),
  ).toBe(403);
});
test("department preview constrains report, question and export endpoints", async ({
  page,
}) => {
  expect(
    (
      await page.request.post("/api/access", {
        headers: { origin },
        data: { action: "switch", userId: "demo-marketing" },
      })
    ).ok(),
  ).toBe(true);
  const r = await page.request.get("/api/reports");
  const { rows } = await r.json();
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (s: { company: string; department: string }) =>
        s.company === "山东省鲁盐集团有限公司" && s.department === "营销部",
    ),
  ).toBe(true);
  expect((await page.request.get("/api/export")).status()).toBe(403);
  await page.request.post("/api/access", {
    headers: { origin },
    data: { action: "switch", userId: "demo-supervisor" },
  });
  expect((await page.request.get("/api/reports")).status()).toBe(403);
  await page.goto("/governance");
  await expect(
    page.getByRole("heading", { name: "治理工作台", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "主题报表", exact: true }),
  ).toHaveCount(0);
});

// These fixture scenarios deliberately require the isolated local sample mode.
test.beforeEach(async ({ request }) => {
  const status = await (await request.get("/api/status")).json();
  test.skip(
    status.mode !== "demo",
    "样例流程仅在APP_DEMO_MODE=true时执行；真实账号使用独立验证脚本",
  );
});
