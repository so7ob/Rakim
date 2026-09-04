import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const password = "DevOnly!ChangeMe2026";

async function login(
  request: import("@playwright/test").APIRequestContext,
  username: string,
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const cookie = response.headers()["set-cookie"].split(";")[0];
  return { cookie, csrfToken: body.csrfToken };
}

test("admin endpoints require an authenticated role and CSRF for changes", async ({
  request,
}) => {
  expect((await request.get("/api/v1/admin/dashboard")).status()).toBe(401);
  const reader = await login(request, "reader");
  expect(
    (
      await request.get("/api/v1/admin/dashboard", {
        headers: { cookie: reader.cookie },
      })
    ).status(),
  ).toBe(403);
  const system = await login(request, "system_admin");
  expect(
    (
      await request.get("/api/v1/admin/users", {
        headers: { cookie: system.cookie },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.patch("/api/v1/admin/users/not-a-user/state", {
        headers: { cookie: system.cookie },
        data: { active: false, reason: "اختبار حماية CSRF" },
      })
    ).status(),
  ).toBe(403);
  const dataEntry = await login(request, "data_entry");
  expect(
    (
      await request.get("/api/v1/imports", {
        headers: { cookie: dataEntry.cookie },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/v1/publications", {
        headers: {
          cookie: dataEntry.cookie,
          "x-csrf-token": dataEntry.csrfToken,
        },
        data: { legislationId: "none", reason: "اختبار رفض النشر" },
      })
    ).status(),
  ).toBe(403);
});

test("login leads to the allowed admin dashboard with no A/AA issues", async ({
  page,
}) => {
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("data_entry");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  await expect(
    page.getByRole("heading", { name: "لوحة الإدارة" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("successful form mutation resets safely without a manual reload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("reader");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  await page.goto("/ar/legislations");
  await page.getByRole("link", { name: "عرض التشريع" }).first().click();
  const note = page.locator("details.tool-popover").filter({
    has: page.getByText("ملاحظة خاصة", { exact: true }),
  });
  await note.locator("summary").click();
  const input = note.getByLabel("نص الملاحظة");
  await input.fill(`اختبار تحديث تلقائي ${Date.now()}`);
  await note.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("حُفظت الملاحظة الخاصة.")).toBeVisible();
  await expect(input).toHaveValue("");
  expect(pageErrors).toEqual([]);
});
