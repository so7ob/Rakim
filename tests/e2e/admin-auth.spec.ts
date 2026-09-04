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
    has: page.getByLabel("إضافة ملاحظة خاصة"),
  });
  await note.locator("summary").click();
  const input = note.getByLabel("نص الملاحظة");
  await input.fill(`اختبار تحديث تلقائي ${Date.now()}`);
  await note.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("حُفظت الملاحظة الخاصة.")).toBeVisible();
  await expect(input).toHaveValue("");
  expect(pageErrors).toEqual([]);
});

test("platform settings and full legislation metadata are manageable with audited roles", async ({
  request,
}) => {
  const system = await login(request, "system_admin");
  const stateResponse = await request.get("/api/v1/admin/site", {
    headers: { cookie: system.cookie },
  });
  expect(stateResponse.ok()).toBeTruthy();
  const state = await stateResponse.json();
  expect(
    state.settings.some(
      (item: { settingKey: string }) => item.settingKey === "theme.burgundy",
    ),
  ).toBeTruthy();
  expect(state.pages.length).toBeGreaterThanOrEqual(10);
  const siteName = state.settings.find(
    (item: { settingKey: string }) => item.settingKey === "branding.site_name",
  ).value;
  const save = await request.patch("/api/v1/admin/site/settings", {
    headers: { cookie: system.cookie, "x-csrf-token": system.csrfToken },
    data: {
      values: { "branding.site_name": siteName },
      reason: "اختبار حفظ إعدادات المنصة",
    },
  });
  expect(save.ok()).toBeTruthy();
  const publicConfig = await (await request.get("/api/v1/site/config")).json();
  expect(publicConfig.settings["branding.site_name"]).toBe(siteName);

  const contentManager = await login(request, "content_manager");
  expect(
    (
      await request.patch("/api/v1/admin/site/settings", {
        headers: {
          cookie: contentManager.cookie,
          "x-csrf-token": contentManager.csrfToken,
        },
        data: {
          values: { "branding.site_name": siteName },
          reason: "اختبار رفض صلاحية الإعدادات",
        },
      })
    ).status(),
  ).toBe(403);

  const content = await (
    await request.get("/api/v1/admin/legislations", {
      headers: { cookie: contentManager.cookie },
    })
  ).json();
  const detail = await (
    await request.get(`/api/v1/admin/legislations/${content.items[0].id}`, {
      headers: { cookie: contentManager.cookie },
    })
  ).json();
  expect(detail).toHaveProperty("gazette");
  expect(detail).toHaveProperty("selectedSubjectIds");
  expect(detail.references.subjects.length).toBeGreaterThan(0);
  expect(detail).toHaveProperty("structures");
  expect(detail).toHaveProperty("annexes");
  expect(detail).toHaveProperty("relations");
});

test("system administrator can open the platform settings editor", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("system_admin");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.getByRole("link", { name: "إعدادات المنصة" }).click();
  await expect(
    page.getByRole("heading", { name: "إعدادات المنصة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "الهوية والشعار" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "الألوان والتدرجات" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "الصفحات العامة" }),
  ).toBeVisible();
  await expect(page.locator(".draft-article")).toHaveCount(19);
});
