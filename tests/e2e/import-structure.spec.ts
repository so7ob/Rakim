import { execFile as execFileCallback } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

const execFile = promisify(execFileCallback);
const password = "DevOnly!ChangeMe2026";
let activeFixture:
  { importId: string; sourceIds: string[]; lawId?: string } | undefined;

async function removeActiveFixture() {
  if (!activeFixture) return;
  const fixture = activeFixture;
  activeFixture = undefined;
  const db = await createDataSource().initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  let files: Array<{ storageKey: string }> = [];
  try {
    files = await runner.query(
      `SELECT storage_key storageKey FROM source_documents
       WHERE id IN (${fixture.sourceIds.map(() => "?").join(",")})`,
      fixture.sourceIds,
    );
    await runner.query("SET @ylp_maintenance=1");
    if (fixture.lawId) {
      await runner.query("DELETE FROM audit_logs WHERE entity_id=?", [
        fixture.lawId,
      ]);
      await runner.query(
        "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
        [fixture.lawId],
      );
      await runner.query(
        "DELETE FROM search_documents WHERE legislation_id=?",
        [fixture.lawId],
      );
      await runner.query(
        "DELETE FROM content_responsibilities WHERE legislation_id=?",
        [fixture.lawId],
      );
      await runner.query("DELETE FROM workflow_events WHERE legislation_id=?", [
        fixture.lawId,
      ]);
      await runner.query(
        `DELETE FROM article_versions WHERE article_id IN
         (SELECT id FROM articles WHERE legislation_id=?)`,
        [fixture.lawId],
      );
      await runner.query("DELETE FROM articles WHERE legislation_id=?", [
        fixture.lawId,
      ]);
      await runner.query(
        "UPDATE structure_nodes SET parent_id=NULL WHERE legislation_id=?",
        [fixture.lawId],
      );
      await runner.query("DELETE FROM structure_nodes WHERE legislation_id=?", [
        fixture.lawId,
      ]);
      await runner.query(
        "DELETE FROM legislation_versions WHERE legislation_id=?",
        [fixture.lawId],
      );
      await runner.query(
        "DELETE FROM legislation_source_documents WHERE legislation_id=?",
        [fixture.lawId],
      );
    }
    await runner.query("DELETE FROM audit_logs WHERE entity_id=?", [
      fixture.importId,
    ]);
    await runner.query(
      "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.importId'))=?",
      [fixture.importId],
    );
    await runner.query(
      "DELETE FROM source_import_attachments WHERE source_import_id=?",
      [fixture.importId],
    );
    await runner.query("DELETE FROM source_imports WHERE id=?", [
      fixture.importId,
    ]);
    if (fixture.lawId)
      await runner.query("DELETE FROM legislations WHERE id=?", [
        fixture.lawId,
      ]);
    await runner.query(
      `DELETE FROM source_documents WHERE id IN (${fixture.sourceIds.map(() => "?").join(",")})`,
      fixture.sourceIds,
    );
    await runner.query("SET @ylp_maintenance=0");
  } finally {
    await runner.release();
    await db.destroy();
  }
  const dataRoot = resolve(
    process.env.DATA_ROOT ?? resolve(process.cwd(), "data"),
  );
  await Promise.allSettled(
    files
      .map((file) => resolve(dataRoot, file.storageKey))
      .filter((path) => path.startsWith(`${dataRoot}${sep}`))
      .map((path) => unlink(path)),
  );
}

test.afterEach(removeActiveFixture);

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

test("opens source creation in a dialog without an upload tab", async ({
  page,
}, testInfo) => {
  await login(page, "data_entry");
  await page.goto("/ar/admin/imports");
  await expect(
    page.getByRole("navigation", { name: "إدارة المصادر" }).getByRole("link"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "+ إضافة مصدر", exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/admin\/imports$/);
  const dialog = page.getByRole("dialog", { name: "إضافة مصدر", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("ملف النص للاستخراج")).toBeVisible();
  await expect(page.getByLabel("نسخة PDF الرسمية (اختيارية)")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("source-add-dialog.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "+ إضافة مصدر", exact: true }),
  ).toBeFocused();
  await page.goto("/ar/admin/imports/upload");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "إغلاق النافذة" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/ar\/admin\/imports\/queue$/);
});

test("retains source files on upload failure and prevents duplicate submissions", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await login(page, "data_entry");
  await page.goto("/ar/admin/imports");
  await page.getByRole("button", { name: "+ إضافة مصدر", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "إضافة مصدر", exact: true });
  await dialog.getByLabel("ملف النص للاستخراج").setInputFiles({
    name: "retry-source.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("مصدر اختبار فشل الرفع"),
  });
  await dialog.getByLabel("جهة الحصول").fill("بيانات يحتفظ بها عند الفشل");
  let requests = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/imports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests++;
    await held;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ message: "تعذر الرفع مؤقتًا، أعد المحاولة." }),
    });
  });
  await dialog.getByRole("button", { name: "إضافة وبدء الاستخراج" }).click();
  await expect(
    dialog.getByRole("button", { name: "جار الرفع…" }),
  ).toBeDisabled();
  await dialog
    .locator("form")
    .evaluate((form) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(dialog.getByRole("alert")).toContainText("تعذر الرفع مؤقتًا");
  await expect(dialog.getByLabel("جهة الحصول")).toHaveValue(
    "بيانات يحتفظ بها عند الفشل",
  );
  expect(
    await dialog
      .getByLabel("ملف النص للاستخراج")
      .evaluate((element: HTMLInputElement) => element.files?.[0]?.name),
  ).toBe("retry-source.txt");
  await dialog.getByRole("button", { name: "إغلاق النافذة" }).click();
  const discard = page.getByRole("alertdialog", { name: "إغلاق دون حفظ؟" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "متابعة التحرير" }).click();
  await expect(dialog.getByLabel("جهة الحصول")).toHaveValue(
    "بيانات يحتفظ بها عند الفشل",
  );
});

test("imports Markdown articles with clean drafts and unchanged source text", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  test.setTimeout(90_000);
  const unique = Date.now();
  const fileName = `markdown-regression-${unique}.md`;
  const draftTitle = `اختبار استخراج النجوم ${unique}`;
  const source =
    `عينة اختبار آلي مقتبسة من بلاغ، ليست للنشر — ${unique}\n${await readFile(resolve("tests/fixtures/legal-structure-asterisks-ar.md"), "utf8")}`.replace(
      "يسمى هذا القرار",
      "**يسمى هذا القرار**",
    );

  await login(page, "data_entry");
  await page.goto("/ar/admin/imports");
  await page.getByRole("button", { name: "+ إضافة مصدر", exact: true }).click();
  await page.getByLabel("ملف النص للاستخراج").setInputFiles({
    name: fileName,
    mimeType: "text/markdown",
    buffer: Buffer.from(source),
  });
  await page.getByLabel("جهة الحصول").fill("اختبار انحدار بلاغ النجوم");
  const uploadPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "إضافة وبدء الاستخراج" }).click();
  const uploadResponse = await uploadPromise;
  expect(uploadResponse.ok()).toBeTruthy();
  const upload = await uploadResponse.json();
  activeFixture = { importId: upload.id, sourceIds: [upload.sourceDocumentId] };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await execFile(
      "npm",
      ["run", "start", "-w", "@ylp/worker", "--", "--once"],
      { cwd: process.cwd(), timeout: 30_000 },
    );
    const response = await page.request.get(`/api/v1/imports/${upload.id}`);
    expect(response.ok()).toBeTruthy();
    if ((await response.json()).status === "READY_FOR_REVIEW") break;
  }
  await page.goto("/ar/admin/imports/queue");
  const row = page.locator("details.import-row").filter({ hasText: fileName });
  await expect(row).toContainText("جاهز للمراجعة");
  await row.locator(":scope > summary").click();
  const tree = row.getByRole("tree", { name: "بنية التشريع المستخرجة" });
  await expect(tree.getByText("الفصل الأول", { exact: true })).toBeVisible();
  await expect(tree.getByText("الفصل الثاني", { exact: true })).toBeVisible();
  await expect(tree.locator(".import-article")).toHaveText([
    "مادة ١",
    "مادة ٢",
    "مادة ٣",
    "مادة ٤",
    "مادة ٥",
    "مادة ٦",
  ]);
  expect(await row.locator(".extracted-preview").textContent()).toBe(
    source.trim(),
  );
  await page.screenshot({
    path: testInfo.outputPath("markdown-import-preview.png"),
    fullPage: true,
  });

  await changeUser(page, "legal_reviewer");
  await page.goto("/ar/admin/imports/queue");
  await row.locator(":scope > summary").click();
  await row.getByRole("button", { name: "اعتماد مراجعة المصدر" }).click();
  await expect(
    row.locator(":scope > summary").getByText("مراجع", { exact: true }),
  ).toBeVisible();
  await changeUser(page, "data_entry");
  await page.goto("/ar/admin/imports/queue");
  await row.locator(":scope > summary").click();
  await row.locator('input[name="titleAr"]').fill(draftTitle);
  await row.locator('input[name="year"]').fill("2018");
  await row.locator('select[name="typeId"]').selectOption({ index: 1 });
  await row.locator('select[name="authorityId"]').selectOption({ index: 1 });
  const draftPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/imports/${upload.id}/draft`) &&
      response.request().method() === "POST",
  );
  await row.getByRole("button", { name: "إنشاء المسودة" }).click();
  const draftResponse = await draftPromise;
  expect(draftResponse.ok()).toBeTruthy();
  const lawId = (await draftResponse.json()).id;
  activeFixture.lawId = lawId;
  await page.goto(`/ar/admin/content/${lawId}/articles`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "المادة 1", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "المادة 6", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "تعديل المادة", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", {
    name: "تعديل المادة 1",
    exact: true,
  });
  await expect(dialog.getByLabel("النص")).toHaveValue(
    "يسمى هذا القرار (قرار إنشاء الهيئة العامة للزكاة).",
  );
  await dialog.getByRole("button", { name: "إلغاء", exact: true }).click();

  const detailResponse = await page.request.get(
    `/api/v1/admin/legislations/${lawId}?articleContent=full`,
  );
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json();
  expect(detail.structures).toHaveLength(2);
  expect(detail.articles).toHaveLength(6);
  const chapterIds = ["الفصل الأول", "الفصل الثاني"].map(
    (label) =>
      detail.structures.find(
        (node: { labelAr: string }) => node.labelAr === label,
      )?.id,
  );
  expect(chapterIds.every(Boolean)).toBe(true);
  expect(
    detail.articles.map(
      (article: { structureNodeId: string }) => article.structureNodeId,
    ),
  ).toEqual([
    chapterIds[0],
    chapterIds[0],
    chapterIds[1],
    chapterIds[1],
    chapterIds[1],
    chapterIds[1],
  ]);
  const texts = detail.articles.map(
    (article: { textOriginal: string }) => article.textOriginal,
  );
  expect(texts.join("\n")).not.toMatch(/[*\\]/u);
  expect(texts[1]).toContain("- الوكيل: وكيل الهيئة العامة للزكاة.");
  expect(texts[3]).toContain("المادة (٢٣)");
  expect(texts[5]).toMatch(/\n١$/u);

  const importResponse = await page.request.get(`/api/v1/imports/${upload.id}`);
  expect(importResponse.ok()).toBeTruthy();
  const imported = await importResponse.json();
  expect(imported.extracted_text).toBe(source.trim());
  expect(imported.analysis.summary).toMatchObject({
    fasls: 2,
    articles: 6,
    reviewRequired: 0,
  });
  const download = await page.request.get(
    `/api/v1/imports/${upload.id}/source`,
  );
  expect(download.ok()).toBeTruthy();
  expect(await download.body()).toEqual(Buffer.from(source));
});

test("imports and persists the complete Arabic legal hierarchy", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  test.setTimeout(90_000);
  const unique = Date.now();
  const fileName = `قانون اختبار البنية ${unique}.txt`;
  const pdfName = `قانون اختبار البنية ${unique}.pdf`;
  const draftTitle = `تشريع اختبار بنية الاستيراد ${unique}`;
  const source = `قانون نموذجي اصطناعي لا يمثل نصًا رسميًا — ${unique}

الباب الأول: الأحكام العامة
الفصل الأول
التعاريف
القسم الأول ـ المصطلحات
الفرع الأول
مجلس الإدارة
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
  await page.goto("/ar/admin/imports");
  await page.getByRole("button", { name: "+ إضافة مصدر", exact: true }).click();
  await page.getByLabel("ملف النص للاستخراج").setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(source),
  });
  await page.getByLabel("نسخة PDF الرسمية (اختيارية)").setInputFiles({
    name: pdfName,
    mimeType: "application/pdf",
    buffer: Buffer.concat([
      await readFile(resolve("tests/fixtures/import-sample.pdf")),
      Buffer.from(`\n% import hierarchy fixture ${unique}`),
    ]),
  });
  await page.getByLabel("جهة الحصول").fill("Fixture اصطناعية لاختبار E2E");
  const uploadResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/imports") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "إضافة وبدء الاستخراج" }).click();
  const uploadResponse = await uploadResponsePromise;
  expect(uploadResponse.ok()).toBeTruthy();
  const uploadResult = await uploadResponse.json();
  await expect(
    page.getByRole("dialog", { name: "إضافة مصدر", exact: true }),
  ).toBeHidden();
  await expect(page).toHaveURL(/\/ar\/admin\/imports$/);
  activeFixture = {
    importId: uploadResult.id,
    sourceIds: [
      uploadResult.sourceDocumentId,
      ...uploadResult.attachments.map(
        (attachment: { sourceDocumentId: string }) =>
          attachment.sourceDocumentId,
      ),
    ],
  };
  await expect(
    page.getByText(
      "تم رفع ملف النص ونسخة PDF معًا، ووُضع النص في طابور الاستخراج.",
    ),
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
  await expect(row).toContainText(pdfName);
  await row.locator(":scope > summary").click();
  await expect(row.getByLabel(`عارض PDF: ${pdfName}`)).toBeVisible();
  await expect(
    row.getByRole("link", { name: "تنزيل المصدر للمقارنة" }),
  ).toHaveAttribute("href", /\?download=1$/u);
  const pdfSourceId = activeFixture.sourceIds[1]!;
  const inlinePdfResponse = await page.request.get(
    `/api/v1/imports/${activeFixture.importId}/attachments/${pdfSourceId}`,
  );
  expect(inlinePdfResponse.headers()["content-disposition"]).toMatch(
    /^inline;/u,
  );
  const downloadPdfResponse = await page.request.get(
    `/api/v1/imports/${activeFixture.importId}/attachments/${pdfSourceId}?download=1`,
  );
  expect(downloadPdfResponse.headers()["content-disposition"]).toMatch(
    /^attachment;/u,
  );
  const tree = row.getByRole("tree", { name: "بنية التشريع المستخرجة" });
  await expect(tree.getByText("الباب الأول", { exact: false })).toBeVisible();
  await expect(tree.getByText("الفصل الأول", { exact: false })).toBeVisible();
  await expect(tree.getByText("القسم الأول", { exact: false })).toBeVisible();
  await expect(tree.getByText("الفرع الأول", { exact: false })).toBeVisible();
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
  await draftRow.locator('input[name="effectiveFrom"]').fill("2026-01-01");
  await draftRow.locator('select[name="typeId"]').selectOption({ index: 1 });
  await draftRow
    .locator('select[name="authorityId"]')
    .selectOption({ index: 1 });
  const draftResponsePromise = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/api/v1/imports/${activeFixture?.importId}/draft`) &&
      response.request().method() === "POST",
  );
  await draftRow.getByRole("button", { name: "إنشاء المسودة" }).click();
  const draftResponse = await draftResponsePromise;
  expect(draftResponse.ok()).toBeTruthy();
  activeFixture!.lawId = (await draftResponse.json()).id;
  await expect(draftRow).toContainText(draftTitle);
  const importResponseBeforeNavigation = await page.request.get(
    `/api/v1/imports/${activeFixture?.importId}`,
  );
  expect(importResponseBeforeNavigation.ok()).toBeTruthy();
  expect((await importResponseBeforeNavigation.json()).extracted_text).toBe(
    source.trim(),
  );
  await draftRow.locator(":scope > summary").click();
  await page.reload();
  await page.goto("/ar/admin/imports/queue");
  const refreshedRow = page
    .locator("details.import-row")
    .filter({ hasText: fileName });
  await expect(refreshedRow).toContainText(draftTitle);
  await refreshedRow.locator(":scope > summary").click();
  await expect(
    refreshedRow.getByRole("link", { name: draftTitle }),
  ).toBeVisible();
  await expect(refreshedRow.getByLabel(`عارض PDF: ${pdfName}`)).toBeVisible();
  const importResponseAfterReload = await page.request.get(
    `/api/v1/imports/${activeFixture?.importId}`,
  );
  expect(importResponseAfterReload.ok()).toBeTruthy();
  expect((await importResponseAfterReload.json()).extracted_text).toBe(
    source.trim(),
  );
  const draftLink = refreshedRow.getByRole("link", { name: draftTitle });
  await expect(draftLink).toBeVisible();
  await draftLink.click();

  await expect(page).toHaveURL(/\/ar\/admin\/content\/.+\/structure/);
  const savedTree = page.getByRole("tree", {
    name: "شجرة البنية القانونية",
  });
  await expect(
    savedTree.getByRole("button").filter({ hasText: "الباب الأول" }),
  ).toBeVisible();
  const savedChapter = savedTree
    .getByRole("button")
    .filter({ hasText: "الفصل الأول" });
  await expect(savedChapter).toBeVisible();
  await expect(
    savedTree.getByRole("button").filter({ hasText: "القسم الأول" }),
  ).toBeVisible();
  await expect(
    savedTree.getByRole("button").filter({ hasText: "الفرع الأول" }),
  ).toBeVisible();
  await expect(
    savedTree.getByRole("button").filter({ hasText: "القسم الثاني" }),
  ).toBeVisible();
  await savedChapter.click();
  await expect(
    page.getByRole("heading", { name: "الفصل الأول — التعاريف" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /النص والمواد/ }).click();
  await expect(page.getByRole("heading", { name: "المادة 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "المادة 5" })).toBeVisible();
  await expect(page.locator(".admin-list-card input")).toHaveCount(0);
  await expect(page.locator(".admin-list-card textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "تعديل المادة" }).first().click();
  const articleDialog = page.getByRole("dialog", { name: "تعديل المادة 1" });
  await expect(articleDialog).toBeVisible();
  await expect(articleDialog.getByLabel("النص")).toHaveValue(/المادة/);
  await articleDialog.getByRole("button", { name: "إلغاء" }).click();
  await expect(articleDialog).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: "المادة 1" })).toBeVisible();

  const lawId = page.url().match(/content\/([^/]+)/)?.[1];
  expect(lawId).toBeTruthy();
  await page.goto(`/ar/admin/content/${lawId}/general`);
  await expect(page.locator(".admin-card input")).toHaveCount(0);
  await expect(page.locator(".admin-card textarea")).toHaveCount(0);
  await page.getByRole("button", { name: "تعديل البيانات" }).click();
  const metadataDialog = page.getByRole("dialog", {
    name: "تعديل بيانات التشريع",
  });
  await expect(metadataDialog.getByLabel("العنوان")).toHaveValue(draftTitle);
  const updatedSummary = `ملخص View First للاختبار ${unique}`;
  await metadataDialog.getByLabel("الملخص").fill(updatedSummary);
  await metadataDialog
    .getByLabel("سبب التعديل")
    .fill("اختبار حفظ حوار البيانات الوصفية");
  const metadataResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/admin/legislations/${lawId}`) &&
      response.request().method() === "PATCH",
  );
  await metadataDialog.getByRole("button", { name: "حفظ التغييرات" }).click();
  expect((await metadataResponsePromise).ok()).toBeTruthy();
  await expect(metadataDialog).toBeHidden();
  await expect(
    page
      .locator(".admin-entity-details dd")
      .filter({ hasText: updatedSummary }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(".admin-entity-details dd")
      .filter({ hasText: updatedSummary }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("admin-content-view-first.png"),
    fullPage: true,
  });
  const detailResponse = await page.request.get(
    `/api/v1/admin/legislations/${lawId}`,
  );
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json();
  expect(detail.structures).toHaveLength(7);
  expect(detail.articles).toHaveLength(5);
  expect(detail.sources).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        originalName: fileName,
        sourceRole: "EXTRACTION",
      }),
      expect.objectContaining({
        originalName: pdfName,
        mediaType: "application/pdf",
        sourceRole: "OFFICIAL_PDF",
      }),
    ]),
  );
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
  expect(byLabel.get("الفرع الأول")?.parentId).toBe(
    byLabel.get("القسم الأول")?.id,
  );
  expect(detail.articles[0].structureNodeId).toBe(
    byLabel.get("الفرع الأول")?.id,
  );

  await page.goto(`/ar/admin/content/${lawId}/workflow`);
  await page.getByPlaceholder("سبب الإجراء").fill("إرسال اختبار الاستيراد");
  await page.getByRole("button", { name: "تنفيذ", exact: true }).click();
  await expect(page.getByText("تم انتقال الحالة بنجاح.")).toBeVisible();

  await changeUser(page, "legal_reviewer");
  await page.goto(`/ar/admin/content/${lawId}/workflow`);
  await page
    .locator('select[name="target"]')
    .selectOption("APPROVED_FOR_PUBLISHING");
  await page.getByPlaceholder("سبب الإجراء").fill("اعتماد اختبار الاستيراد");
  await page.getByRole("button", { name: "تنفيذ", exact: true }).click();
  await expect(page.getByText("تم انتقال الحالة بنجاح.")).toBeVisible();

  await changeUser(page, "super");
  await page.goto(`/ar/admin/content/${lawId}/workflow`);
  await page.getByPlaceholder("سبب الإجراء").fill("نشر اختبار الاستيراد");
  await page.getByRole("button", { name: "تنفيذ", exact: true }).click();
  await expect(
    page.getByText("تم نشر التشريع و5 نسخة مادة معًا."),
  ).toBeVisible();

  const download = await page.request.get(
    `/api/v1/legislations/${lawId}/source`,
  );
  expect(download.ok()).toBeTruthy();
  expect(download.headers()["content-type"]).toContain("application/pdf");
  expect(download.headers()["content-disposition"]).toContain(
    encodeURIComponent(pdfName),
  );
  expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
