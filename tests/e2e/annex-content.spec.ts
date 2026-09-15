import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDataSource } from "../../apps/api/src/database/config.js";

const password = "DevOnly!ChangeMe2026";
let lawId: string;
let annexId: string;
let draftTitle: string;

test.beforeAll(async () => {
  const db = await createDataSource().initialize();
  try {
    const [row] = await db.query(
      "SELECT ax.id annexId,ax.legislation_id lawId FROM annexes ax WHERE ax.title_ar='جدول رسوم نموذجي' AND ax.deleted_at IS NULL LIMIT 1",
    );
    lawId = row?.lawId;
    annexId = row?.annexId;
    draftTitle = `جدول مراجعة ${randomUUID().slice(0, 8)}`;
  } finally {
    await db.destroy();
  }
});

test.afterAll(async () => {
  if (!draftTitle) return;
  const db = await createDataSource().initialize();
  try {
    const [draft] = await db.query(
      "SELECT id FROM annexes WHERE title_ar=? LIMIT 1",
      [draftTitle],
    );
    if (draft) {
      await db.query("DELETE FROM annex_versions WHERE annex_id=?", [draft.id]);
      await db.query("DELETE FROM annexes WHERE id=?", [draft.id]);
    }
  } finally {
    await db.destroy();
  }
});

test("loads annex JSON for editing and renders the published table instead of its source PDF", async ({
  page,
}, testInfo) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(testInfo.project.name));
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("super");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);

  expect(lawId).toBeTruthy();
  expect(annexId).toBeTruthy();
  await page.goto(`/ar/admin/content/${lawId}/annexes`, {
    waitUntil: "networkidle",
  });
  const card = page
    .locator("article.admin-list-card")
    .filter({ hasText: "جدول رسوم نموذجي" });
  await expect(card).toContainText("جدول");
  await expect(card).not.toContainText("TABLE");
  await card.getByRole("button", { name: "تعديل الملحق" }).click();
  const edit = page.getByRole("dialog", { name: "تعديل جدول رسوم نموذجي" });
  const json = edit.getByLabel("جدول منظم JSON");
  await expect(json).toHaveValue(/"columns"/);
  await expect(edit.getByRole("cell", { name: "100" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("annex-edit-json.png"),
    animations: "disabled",
  });

  await page.goto(`/ar/legislations/${lawId}/regulations?annex=${annexId}`, {
    waitUntil: "networkidle",
  });
  const publicCard = page
    .locator("article.annex-card")
    .filter({ hasText: "جدول رسوم نموذجي" });
  await expect(publicCard.getByRole("cell", { name: "100" })).toBeVisible();
  await expect(publicCard.locator(".pdf-viewer")).toHaveCount(0);
  await expect(publicCard.getByText(/المصدر:/)).toBeVisible();
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("annex-published-table.png"),
    animations: "disabled",
  });
});

test("uses Arabic type labels and switches the add form fields from the server catalog", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("super");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  expect(lawId).toBeTruthy();
  await page.goto(`/ar/admin/content/${lawId}/annexes`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /إضافة ملحق/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "إضافة لائحة أو جدول أو ملحق",
  });
  const type = dialog.getByLabel("النوع");
  await expect(type.locator("option")).toHaveText([
    "لائحة تنفيذية",
    "جدول",
    "نموذج",
    "ملحق",
    "خريطة",
    "تعرفة",
    "قائمة",
    "تصحيح",
  ]);
  await type.selectOption("TABLE");
  await expect(dialog.getByLabel("جدول منظم JSON")).toBeVisible();
  await type.selectOption("FORM");
  await expect(dialog.getByRole("radio", { name: "ملف" })).toBeChecked();
  await expect(dialog.getByLabel("جدول منظم JSON")).toHaveCount(0);
});

test("previews a draft annex then reviews and publishes it from its card", async ({
  page,
}, testInfo) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(testInfo.project.name));
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("super");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  await page.goto(`/ar/admin/content/${lawId}/annexes`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: /إضافة ملحق/ }).click();
  const create = page.getByRole("dialog", {
    name: "إضافة لائحة أو جدول أو ملحق",
  });
  await create.getByLabel("العنوان").fill(draftTitle);
  await create.getByLabel("النوع").selectOption("TABLE");
  await create
    .getByLabel("جدول منظم JSON")
    .fill('{"columns":["الفئة"],"rows":[["معاينة إدارية"]]}');
  await create.getByLabel("سبب الإضافة").fill("إنشاء جدول لاختبار دورة النشر");
  await create.getByRole("button", { name: "إضافة الملحق" }).click();
  await expect(create).toBeHidden();
  const card = page
    .locator("article.admin-list-card")
    .filter({ hasText: draftTitle });
  await expect(card).toBeVisible();
  const created = await page.evaluate(async ({ lawId, draftTitle }) => {
    const response = await fetch(`/api/v1/admin/legislations/${lawId}`);
    const value = (await response.json()) as {
      annexes: Array<{ id: string; titleAr: string }>;
    };
    return value.annexes.find((item) => item.titleAr === draftTitle)?.id;
  }, { lawId, draftTitle });
  expect(created).toBeTruthy();
  const anonymous = await playwrightRequest.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const unauthenticated = await anonymous.post(
    `/api/v1/admin/annexes/${created}/transition`,
    {
      data: {
        action: "review",
        editFingerprint: "a".repeat(64),
        reason: "رفض وصول مباشر",
      },
    },
  );
  expect(unauthenticated.status()).toBe(401);
  await anonymous.dispose();
  const csrfStatus = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/admin/annexes/${id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        editFingerprint: "a".repeat(64),
        reason: "رفض طلب دون CSRF",
      }),
    });
    return response.status;
  }, created);
  expect(csrfStatus).toBe(403);
  await card.getByRole("button", { name: "عرض" }).click();
  const preview = page.getByRole("dialog", { name: `عرض ${draftTitle}` });
  await expect(
    preview.getByRole("cell", { name: "معاينة إدارية" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("annex-admin-preview.png"),
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await preview.getByRole("button", { name: "إغلاق النافذة" }).click();

  await card.getByRole("button", { name: "اعتماد المراجعة" }).click();
  const review = page.getByRole("dialog", { name: "اعتماد المراجعة" });
  await review.getByLabel("سبب الإجراء").fill("مراجعة الجدول في الاختبار");
  await review.getByRole("button", { name: "اعتماد المراجعة" }).click();
  await expect(card).toContainText("مراجع وجاهز للنشر");
  await page.screenshot({
    path: testInfo.outputPath("annex-reviewed-card.png"),
    animations: "disabled",
  });
  await card.getByRole("button", { name: "نشر" }).click();
  const publish = page.getByRole("dialog", { name: "نشر" });
  await publish.getByLabel("سبب الإجراء").fill("نشر الجدول بعد المراجعة");
  await publish.getByRole("button", { name: "نشر", exact: true }).click();
  await expect(card).toContainText("منشور");
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
});
