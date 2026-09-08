import { expect, test } from "@playwright/test";

const password = "DevOnly!ChangeMe2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("super");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
}

test("reference data uses view rows with add and edit dialogs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await login(page);
  await page.goto("/ar/admin/reference-data/authorities");
  await expect(page.locator("tbody input, tbody select, tbody textarea")).toHaveCount(0);
  await page.getByRole("button", { name: /إضافة إلى الجهات/ }).click();
  const add = page.getByRole("dialog", { name: "إضافة عنصر في الجهات" });
  await page.screenshot({ path: testInfo.outputPath("reference-add-dialog.png"), fullPage: false });
  await add.getByRole("button", { name: "إضافة", exact: true }).click();
  await expect(add).toBeVisible();
  const suffix = Date.now();
  const code = `VIEW_FIRST_${suffix}`;
  const name = `جهة اختبار View First ${suffix}`;
  await add.getByLabel("الرمز").fill(code);
  await add.getByLabel("الاسم العربي").fill(name);
  await add.getByLabel("سبب الإضافة").fill("اختبار E2E للإضافة بالحوار");
  const createResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/admin/reference-data/authorities") && response.request().method() === "POST",
  );
  await add.getByRole("button", { name: "إضافة", exact: true }).click();
  expect((await createResponse).ok()).toBeTruthy();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "تعديل" }).click();
  const edit = page.getByRole("dialog", { name: "تعديل عنصر في الجهات" });
  const updated = `${name} معدلة`;
  await edit.getByLabel("الاسم العربي").fill(updated);
  await edit.getByLabel("سبب التغيير").fill("اختبار E2E للتعديل بالحوار");
  const updateResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/admin/reference-data/authorities/") && response.request().method() === "PATCH",
  );
  await edit.getByRole("button", { name: "حفظ" }).click();
  expect((await updateResponse).ok()).toBeTruthy();
  await expect(page.getByRole("row").filter({ hasText: updated })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: updated })).toBeVisible();
});

test("custom roles move through create, view, edit, and confirmed delete", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await login(page);
  await page.goto("/ar/admin/roles");
  await expect(page.locator("tbody input, tbody select, tbody textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "+ إنشاء دور" }).click();
  const create = page.getByRole("dialog", { name: "إنشاء دور مخصص" });
  const suffix = Date.now();
  const roleName = `دور View First ${suffix}`;
  await create.getByLabel("اسم الدور").fill(roleName);
  await create.getByLabel("الرمز").fill(`VIEW_FIRST_${suffix}`);
  await create.getByLabel("الوصف").fill("دور مؤقت لاختبار دورة الإدارة");
  await create.getByLabel("سبب الإنشاء").fill("اختبار إنشاء الدور");
  await create.getByRole("button", { name: "إنشاء الدور" }).click();
  const row = page.getByRole("row").filter({ hasText: roleName });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: "فتح" }).click();
  await expect(page.locator(".admin-card input, .admin-card textarea, .admin-card select")).toHaveCount(0);
  await page.getByRole("button", { name: "تعديل الدور" }).click();
  const edit = page.getByRole("dialog", { name: `تعديل ${roleName}` });
  const updatedName = `${roleName} معدل`;
  await edit.getByLabel("الاسم").fill(updatedName);
  await edit.getByLabel("سبب التغيير").fill("اختبار تعديل الدور");
  await edit.getByRole("button", { name: "حفظ بيانات الدور" }).click();
  await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  await page.getByRole("button", { name: "حذف الدور المخصص" }).click();
  const confirmation = page.getByRole("dialog", { name: `حذف الدور ${updatedName}؟` });
  await confirmation.getByRole("button", { name: "إلغاء" }).click();
  await expect(page).toHaveURL(/\/general$/);
  await page.getByRole("button", { name: "حذف الدور المخصص" }).click();
  await page.getByRole("dialog", { name: `حذف الدور ${updatedName}؟` }).getByRole("button", { name: "حذف الدور" }).click();
  await expect(page).toHaveURL(/\/ar\/admin\/roles$/);
  await expect(page.getByRole("row").filter({ hasText: updatedName })).toHaveCount(0);
});

test("user profiles are read-only until an authorized action opens a dialog", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await login(page);
  await page.goto("/ar/admin/users");
  await page.getByRole("link", { name: "فتح" }).first().click();
  await expect(page.locator(".admin-card input, .admin-card textarea, .admin-card select")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("user-profile-view-first.png"), fullPage: true });
  await page.getByRole("button", { name: "تعديل الملف" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل الملف الشخصي" });
  await expect(dialog.getByLabel("الاسم الظاهر")).not.toHaveValue("");
  await dialog.getByRole("button", { name: "إلغاء" }).click();
  await expect(dialog).toBeHidden();
});

test("draft synonyms use add and delete confirmation dialogs", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await login(page);
  await page.goto("/ar/admin/synonyms");
  await page.getByRole("button", { name: "+ إضافة مرادف" }).click();
  const dialog = page.getByRole("dialog", { name: "إضافة مرادف إلى المسودة" });
  const suffix = Date.now();
  const term = `مصطلح ${suffix}`;
  await dialog.getByLabel("المصطلح").fill(term);
  await dialog.getByLabel("المرادف").fill(`مرادف ${suffix}`);
  await dialog.getByRole("button", { name: "إضافة لمسودة" }).click();
  const row = page.getByRole("row").filter({ hasText: term });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "حذف" }).click();
  const confirmation = page.getByRole("dialog", { name: `حذف المرادف «${term}»؟` });
  await confirmation.getByRole("button", { name: "حذف المرادف" }).click();
  await expect(row).toHaveCount(0);
});

test("view-only reference access hides mutations and the API rejects them", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("legal_reviewer");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  await page.goto("/ar/admin/reference-data/authorities");
  await expect(page.getByRole("button", { name: /إضافة إلى الجهات/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تعديل" })).toHaveCount(0);
  await expect(page.getByText("عرض فقط").first()).toBeVisible();

  const loginResponse = await request.post("/api/v1/auth/login", {
    data: { username: "legal_reviewer", password },
  });
  const session = loginResponse.headers()["set-cookie"].split(";")[0];
  const csrfToken = (await loginResponse.json()).csrfToken as string;
  const headers = { cookie: session, "x-csrf-token": csrfToken };
  expect((await request.get("/api/v1/admin/reference-data", { headers })).status()).toBe(200);
  expect((await request.post("/api/v1/admin/reference-data/authorities", {
    headers,
    data: { code: "FORBIDDEN", nameAr: "غير مسموح", isActive: true, reason: "اختبار الرفض" },
  })).status()).toBe(403);
  expect((await request.patch("/api/v1/admin/reference-data/authorities/not-found", {
    headers,
    data: { nameAr: "غير مسموح", reason: "اختبار الرفض" },
  })).status()).toBe(403);
});
