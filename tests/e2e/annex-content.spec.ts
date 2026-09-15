import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

const password = "DevOnly!ChangeMe2026";
let lawId: string;
let annexId: string;

test.beforeAll(async () => {
  const db = await createDataSource().initialize();
  try {
    const [row] = await db.query(
      "SELECT ax.id annexId,ax.legislation_id lawId FROM annexes ax WHERE ax.title_ar='جدول رسوم نموذجي' AND ax.deleted_at IS NULL LIMIT 1",
    );
    lawId = row?.lawId;
    annexId = row?.annexId;
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
