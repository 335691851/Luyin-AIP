import { test, expect } from "@playwright/test";
test("prefilled password survives hydration, focus and visibility changes, then submits its actual value", async ({
  page,
}) => {
  await page.goto("/login");
  const email = page.getByLabel("企业邮箱", { exact: true });
  const password = page.getByLabel("密码", { exact: true });
  await expect(page.getByRole("button", { name: "显示密码" })).toBeVisible();
  const initial = await password.inputValue();
  expect(initial.length).toBeGreaterThan(0);
  await password.focus();
  await email.focus();
  await expect(password).toHaveValue(initial);
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue(initial);
  await page.getByRole("button", { name: "隐藏密码" }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(password).toHaveValue(initial);
  // Editing remains possible; the form must not silently restore the default.
  await password.fill("edited-test-value");
  await email.focus();
  await expect(password).toHaveValue("edited-test-value");
  await password.fill(initial);
  let sent = { email: "", password: "" };
  await page.route("**/api/auth", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "登录表单回归验证" }),
    });
  });
  await page.getByRole("button", { name: "登录平台", exact: true }).click();
  await expect(page.getByText("登录表单回归验证")).toBeVisible();
  expect(sent.password).toBe(initial);
  expect(sent.email).toBe(await email.inputValue());
});
