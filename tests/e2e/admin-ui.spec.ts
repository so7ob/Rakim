import { expect, test } from "@playwright/test";

const password = "DevOnly!ChangeMe2026";

async function loginAsSystemAdministrator(
  page: import("@playwright/test").Page,
  username = "system_admin",
) {
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
}

test("hierarchical navigation, route tabs, browser history, and collapse state work", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await loginAsSystemAdministrator(page);
  const tree = page.getByRole("tree", { name: "أقسام الإدارة" });
  await expect(tree).toBeVisible();
  const accessGroup = tree
    .getByRole("treeitem")
    .filter({ hasText: "المستخدمون والوصول" });
  await accessGroup.getByRole("button", { name: "المستخدمون والوصول" }).click();
  await expect(accessGroup).toHaveAttribute("aria-expanded", "true");
  await accessGroup.getByRole("link", { name: "الأدوار", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/roles$/);
  await expect(page.getByRole("heading", { name: "الأدوار" })).toBeVisible();

  await page.getByRole("button", { name: "إعدادات المنصة" }).click();
  await page.getByRole("link", { name: "عام", exact: true }).click();
  await page.getByRole("link", { name: "الهوية والمظهر" }).last().click();
  await expect(page).toHaveURL(/\/admin\/settings\/appearance$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "الألوان والتدرجات" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin\/settings\/general$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/admin\/settings\/appearance$/);

  await page.getByRole("button", { name: "تصغير القائمة الجانبية" }).click();
  await expect(page.locator(".admin-shell")).toHaveClass(/sidebar-collapsed/);
  await page.reload();
  await expect(page.locator(".admin-shell")).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "توسيع القائمة الجانبية" }).click();
  expect(errors).toEqual([]);
});

test("mobile administration drawer is keyboard accessible and has no horizontal overflow", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile-"));
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await loginAsSystemAdministrator(page);

  const menu = page.getByRole("button", { name: "فتح قائمة الإدارة" });
  await expect(menu).toBeVisible();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "المستخدمون والوصول" }).click();
  await page.getByRole("link", { name: "الصلاحيات", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/permissions\/matrix$/);
  await expect(
    page.getByRole("heading", { name: "نموذج الصلاحيات" }),
  ).toBeVisible();
  await expect(page.locator(".admin-sidebar")).not.toHaveClass(/mobile-open/);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  expect(pageErrors).toEqual([]);
});

test("legal content stays View First and its edit dialog fits mobile RTL", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390");
  await loginAsSystemAdministrator(page, "super");
  await page.goto("/ar/admin/content");
  await page.getByRole("link", { name: "عرض" }).first().click();
  await page.getByRole("link", { name: "البيانات العامة" }).click();
  await expect(page.locator(".admin-card input")).toHaveCount(0);
  await page.getByRole("button", { name: "تعديل البيانات" }).click();
  const dialog = page.getByRole("dialog", { name: "تعديل بيانات التشريع" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("admin-content-dialog-mobile.png"),
    fullPage: false,
  });
});
