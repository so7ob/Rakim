import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

const execFile = promisify(execFileCallback);
const password = "DevOnly!ChangeMe2026";

async function login(page: import("@playwright/test").Page, username: string) {
  const sessionBootstrap = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/status") &&
      response.request().method() === "GET",
  );
  await page.goto("/ar/login");
  await sessionBootstrap;
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin/);
}

async function changeUser(
  page: import("@playwright/test").Page,
  username: string,
) {
  await page.context().clearCookies();
  await login(page, username);
}

test("imports and persists the complete Arabic legal hierarchy", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  test.setTimeout(90_000);
  const unique = Date.now();
  const fileName = `legal-structure-${unique}.txt`;
  const draftTitle = `تشريع اختبار بنية الاستيراد ${unique}`;
  const source = `قانون نموذجي اصطناعي لا يمثل نصًا رسميًا — ${unique}

الباب الأول: الأحكام العامة
الفصل الأول
التعاريف
القسم الأول ـ المصطلحات
المادة (1): يقصد بالكلمات الآتية المعاني المبينة قرين كل منها.
ولا يؤدي ورود كلمة المادة في هذا النص إلى إنشاء مادة جديدة.
المادة ٢: تسري التعاريف على أحكام هذا القانون.

القسم الثاني - نطاق التطبيق
المادة رقم (3): تسري الأحكام على الجهات المشمولة.

الفصل الثاني: أحكام أخرى
المادة الرابعة: يعمل بالضوابط المبينة في هذا الفصل.

الباب الثاني
الأحكام المالية
المادة 5: تحفظ السجلات المالية وفق الإجراءات المعتمدة.`;

  await login(page, "data_entry");
  await page.goto("/ar/admin/imports/upload");
  await page.getByLabel("الملف").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await page.getByLabel("جهة الحصول").fill("Fixture اصطناعية لاختبار E2E");
  await page.getByRole("button", { name: "رفع وبدء الاستخراج" }).click();
  await expect(
    page.getByText("تم رفع المصدر ووضعه في طابور الاستخراج."),
  ).toBeVisible();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await execFile(
      "npm",
      ["run", "start", "-w", "@ylp/worker", "--", "--once"],
      {
        cwd: process.cwd(),
        timeout: 30_000,
      },
    );
    await page.goto("/ar/admin/imports/queue");
    const row = page
      .locator("details.import-row")
      .filter({ hasText: fileName });
    if (
      (await row.count()) &&
      (await row.textContent())?.includes("جاهز للمراجعة")
    )
      break;
  }

  const row = page.locator("details.import-row").filter({ hasText: fileName });
  await expect(row).toContainText("جاهز للمراجعة");
  await row.locator(":scope > summary").click();
  const tree = row.getByRole("tree", { name: "بنية التشريع المستخرجة" });
  await expect(tree.getByText("الباب الأول", { exact: false })).toBeVisible();
  await expect(tree.getByText("الفصل الأول", { exact: false })).toBeVisible();
  await expect(tree.getByText("القسم الأول", { exact: false })).toBeVisible();
  await expect(tree.getByText("المادة 1", { exact: true })).toBeVisible();
  await expect(row.getByLabel("ملخص نتيجة التحليل")).toContainText("5");
  await page.screenshot({
    path: testInfo.outputPath("import-structure-preview.png"),
    fullPage: true,
  });

  await changeUser(page, "legal_reviewer");
  await page.goto("/ar/admin/imports/queue");
  const reviewRow = page
    .locator("details.import-row")
    .filter({ hasText: fileName });
  await reviewRow.locator(":scope > summary").click();
  await reviewRow.getByRole("button", { name: "اعتماد مراجعة المصدر" }).click();
  await expect(reviewRow).toContainText("مراجع");

  await changeUser(page, "data_entry");
  await page.goto("/ar/admin/imports/queue");
  const draftRow = page
    .locator("details.import-row")
    .filter({ hasText: fileName });
  await draftRow.locator(":scope > summary").click();
  await draftRow.locator('input[name="titleAr"]').fill(draftTitle);
  await draftRow.locator('input[name="officialNumber"]').fill("25");
  await draftRow.locator('input[name="year"]').fill("2026");
  await draftRow.locator('select[name="typeId"]').selectOption({ index: 1 });
  await draftRow
    .locator('select[name="authorityId"]')
    .selectOption({ index: 1 });
  await draftRow.getByRole("button", { name: "إنشاء المسودة" }).click();
  await expect(draftRow).toContainText(draftTitle);
  await draftRow.locator(":scope > summary").click();
  const draftLink = draftRow.getByRole("link", { name: draftTitle });
  await expect(draftLink).toBeVisible();
  await draftLink.click();

  await expect(page).toHaveURL(/\/ar\/admin\/content\/.+\/structure/);
  await expect(page.getByText("الأحكام العامة — TITLE")).toBeVisible();
  await expect(page.getByText("التعاريف — CHAPTER")).toBeVisible();
  await expect(page.getByText("المصطلحات — SECTION")).toBeVisible();
  await expect(page.getByText("نطاق التطبيق — SECTION")).toBeVisible();
  await page.getByRole("link", { name: /النص والمواد/ }).click();
  await expect(
    page.getByText("المادة 1 — النسخة 1", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("المادة 5 — النسخة 1", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("المادة 1 — النسخة 1", { exact: false }),
  ).toBeVisible();

  const detailResponse = await page.request.get(
    `/api/v1/admin/legislations/${page.url().match(/content\/([^/]+)/)?.[1]}`,
  );
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json();
  expect(detail.structures).toHaveLength(6);
  expect(detail.articles).toHaveLength(5);
  type StoredNode = { id: string; labelAr: string; parentId: string | null };
  const byLabel = new Map<string, StoredNode>(
    detail.structures.map((node: StoredNode) => [node.labelAr, node] as const),
  );
  expect(byLabel.get("الفصل الأول")?.parentId).toBe(
    byLabel.get("الباب الأول")?.id,
  );
  expect(byLabel.get("القسم الأول")?.parentId).toBe(
    byLabel.get("الفصل الأول")?.id,
  );
  expect(detail.articles[0].structureNodeId).toBe(
    byLabel.get("القسم الأول")?.id,
  );
});
