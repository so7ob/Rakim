import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

const password = "DevOnly!ChangeMe2026";

interface AssignmentFixture {
  sourceId: string;
  legislationId: string;
  nodeIds: string[];
  articleIds: string[];
}

let activeFixture: AssignmentFixture | null = null;

async function createAssignmentFixture(): Promise<AssignmentFixture> {
  const db = await createDataSource().initialize();
  const sourceId = randomUUID();
  const legislationId = randomUUID();
  const nodeIds = [randomUUID(), randomUUID(), randomUUID()];
  const articleIds = Array.from({ length: 6 }, () => randomUUID());
  try {
    const refs = await db.query(
      `SELECT
       (SELECT id FROM legislation_types LIMIT 1) typeId,
       (SELECT id FROM authorities LIMIT 1) authorityId,
       (SELECT id FROM users WHERE username='data_entry' LIMIT 1) userId`,
    );
    const marker = randomUUID();
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
        obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'Fixture E2E للربط','REVIEWED',?)`,
      [
        sourceId,
        `${marker}.txt`,
        `tests/${marker}.txt`,
        createHash("sha256").update(marker).digest("hex"),
        refs[0].userId,
      ],
    );
    await db.query(
      `INSERT INTO legislations
       (id,type_id,authority_id,official_number,year,title_ar,status,legal_status,verification_level)
       VALUES (?,?,?,'27',2026,?,'DRAFT','UNKNOWN','D')`,
      [
        legislationId,
        refs[0].typeId,
        refs[0].authorityId,
        `تشريع اختبار الربط الجماعي ${Date.now()}`,
      ],
    );
    await db.query(
      `INSERT INTO structure_nodes
       (id,legislation_id,parent_id,node_type,label_ar,title_ar,sort_key) VALUES
       (?,?,NULL,'TITLE','الباب الأول','الأحكام العامة','000001'),
       (?,?,?,'CHAPTER','الفصل الأول','أحكام البداية','000002'),
       (?,?,?,'CHAPTER','الفصل الثاني','أحكام النهاية','000003')`,
      [
        nodeIds[0],
        legislationId,
        nodeIds[1],
        legislationId,
        nodeIds[0],
        nodeIds[2],
        legislationId,
        nodeIds[0],
      ],
    );
    for (const [index, articleId] of articleIds.entries()) {
      const label = index === 3 ? "4 مكرر" : String(index + 1);
      const targetNodeId = index < 4 ? nodeIds[1] : nodeIds[2];
      const text = `نص اصطناعي للمادة ${label}.`;
      await db.query(
        `INSERT INTO articles
         (id,legislation_id,structure_node_id,published_label,current_label,sort_key)
         VALUES (?,?,?,?,?,?)`,
        [
          articleId,
          legislationId,
          targetNodeId,
          label,
          label,
          String(index + 1).padStart(6, "0"),
        ],
      );
      await db.query(
        `INSERT INTO article_versions
         (id,article_id,version_no,text_original,text_structured,text_normalized,
          valid_from,status,source_document_id)
         VALUES (?,?,1,?,?,?,'2026-01-01','DRAFT',?)`,
        [randomUUID(), articleId, text, text, text, sourceId],
      );
    }
    return { sourceId, legislationId, nodeIds, articleIds };
  } finally {
    await db.destroy();
  }
}

async function removeAssignmentFixture(fixture: AssignmentFixture) {
  const db = await createDataSource().initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.query("SET @ylp_maintenance=1");
    await runner.query(
      `DELETE FROM audit_logs WHERE entity_id IN (${fixture.nodeIds.map(() => "?").join(",")})`,
      fixture.nodeIds,
    );
    await runner.query(
      "DELETE FROM content_responsibilities WHERE legislation_id=?",
      [fixture.legislationId],
    );
    await runner.query(
      `DELETE FROM article_versions WHERE article_id IN (${fixture.articleIds.map(() => "?").join(",")})`,
      fixture.articleIds,
    );
    await runner.query("DELETE FROM articles WHERE legislation_id=?", [
      fixture.legislationId,
    ]);
    await runner.query(
      "UPDATE structure_nodes SET parent_id=NULL WHERE legislation_id=?",
      [fixture.legislationId],
    );
    await runner.query("DELETE FROM structure_nodes WHERE legislation_id=?", [
      fixture.legislationId,
    ]);
    await runner.query("DELETE FROM legislations WHERE id=?", [
      fixture.legislationId,
    ]);
    await runner.query("DELETE FROM source_documents WHERE id=?", [
      fixture.sourceId,
    ]);
    await runner.query("SET @ylp_maintenance=0");
  } finally {
    await runner.release();
    await db.destroy();
  }
}

test.afterEach(async () => {
  if (activeFixture) await removeAssignmentFixture(activeFixture);
  activeFixture = null;
});

async function login(page: import("@playwright/test").Page, username: string) {
  const bootstrap = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/status") &&
      response.request().method() === "GET",
  );
  await page.goto("/ar/login");
  await bootstrap;
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

test("bulk assigns, moves, persists, and enforces article.update", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  test.setTimeout(120_000);
  activeFixture = await createAssignmentFixture();
  const legislationId = activeFixture.legislationId;
  const structureUrl = `/ar/admin/content/${legislationId}/structure`;
  await login(page, "data_entry");
  await page.goto(structureUrl);

  const firstChapter = page
    .getByRole("tree", { name: "شجرة البنية القانونية" })
    .getByRole("button")
    .filter({ hasText: "الفصل الأول" });
  await firstChapter.click();
  let structureEditor = page
    .locator(".structure-node-details")
    .locator("details.draft-article");
  await structureEditor.locator("summary").click();
  await expect(structureEditor.locator('input[name="titleAr"]')).toHaveValue(
    "أحكام البداية",
  );

  const secondChapter = page
    .getByRole("tree", { name: "شجرة البنية القانونية" })
    .getByRole("button")
    .filter({ hasText: "الفصل الثاني" });
  await secondChapter.click();
  structureEditor = page
    .locator(".structure-node-details")
    .locator("details.draft-article");
  await structureEditor.locator("summary").click();
  await expect(structureEditor.locator('input[name="titleAr"]')).toHaveValue(
    "أحكام النهاية",
  );
  await structureEditor
    .locator('input[name="titleAr"]')
    .fill("أحكام النهاية المعدلة");
  await structureEditor
    .getByLabel("سبب التعديل")
    .fill("التحقق من تعديل العقدة المحددة");
  await structureEditor.getByRole("button", { name: "حفظ الهيكل" }).click();
  await expect(
    page.getByRole("heading", {
      name: "الفصل الثاني — أحكام النهاية المعدلة",
    }),
  ).toBeVisible();
  await firstChapter.click();
  await page.getByRole("button", { name: "ربط المواد" }).click();
  let dialog = page.getByRole("dialog", { name: /ربط المواد بـ/ });
  await expect(dialog).toBeVisible();
  const pickerList = dialog.getByRole("list", { name: "مواد التشريع" });
  const pickerDimensions = await pickerList.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(pickerDimensions.height).toBeGreaterThanOrEqual(240);
  expect(pickerDimensions.scrollHeight).toBeGreaterThan(
    pickerDimensions.clientHeight,
  );
  await dialog.getByRole("button", { name: "مرتبطة هنا" }).click();
  await dialog.getByLabel(/^المادة 1/).uncheck();
  await dialog
    .getByLabel("سبب التصحيح")
    .fill("فك ربط المادة الأولى لاختبار الحالة");
  await dialog.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "ربط المواد" }).click();
  dialog = page.getByRole("dialog", { name: /ربط المواد بـ/ });
  await dialog.getByRole("button", { name: "غير مرتبطة" }).click();
  await dialog.getByLabel(/^المادة 1/).check();
  await dialog
    .getByLabel("سبب التصحيح")
    .fill("ربط المادة الجذرية بالفصل الأول");
  await dialog.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/حُفظت 1 تغييرات/)).toBeVisible();
  await firstChapter.click();
  await expect(page.locator(".direct-article-list")).toContainText("المادة 1");

  await secondChapter.click();
  await page.getByRole("button", { name: "ربط المواد" }).click();
  dialog = page.getByRole("dialog", { name: /ربط المواد بـ/ });
  await dialog.getByRole("button", { name: "مرتبطة بعنصر آخر" }).click();
  await dialog.getByLabel(/^المادة 2/).check();
  await dialog.getByLabel(/^المادة 3/).check();
  await dialog.getByLabel("سبب التصحيح").fill("نقل مادتين إلى الفصل الثاني");
  await dialog.getByRole("button", { name: "حفظ التغييرات" }).click();
  await expect(dialog.getByText(/سيتم نقل 2 مادة/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("bulk-move-confirmation.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  expect(
    await dialog
      .getByRole("list", { name: "مواد التشريع" })
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(200);
  const mobileOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(mobileOverflow).toBeLessThanOrEqual(1);
  await dialog.getByText(/سيتم نقل 2 مادة/).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("bulk-move-confirmation-mobile.png"),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole("button", { name: "تأكيد النقل والحفظ" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".direct-article-list")).toContainText("المادة 2");
  await expect(page.locator(".direct-article-list")).toContainText("المادة 3");

  await firstChapter.click();
  await expect(page.locator(".direct-article-list")).not.toContainText(
    "المادة 2",
  );
  await expect(page.locator(".direct-article-list")).not.toContainText(
    "المادة 3",
  );
  await page.reload();
  await secondChapter.click();
  await expect(page.locator(".direct-article-list")).toContainText("المادة 2");
  await expect(page.locator(".direct-article-list")).toContainText("المادة 3");

  const detail = await page
    .context()
    .request.get(`/api/v1/admin/legislations/${legislationId}`);
  const detailJson = await detail.json();
  const chapterTwo = detailJson.structures.find(
    (node: { labelAr: string }) => node.labelAr === "الفصل الثاني",
  );
  const articleTwo = detailJson.articles.find(
    (article: { currentLabel: string }) => article.currentLabel === "2",
  );
  expect(articleTwo.structureNodeId).toBe(chapterTwo.id);

  await changeUser(page, "legal_reviewer");
  await page.goto(structureUrl);
  await expect(page.getByRole("button", { name: "ربط المواد" })).toHaveCount(0);
  const status = await page.evaluate(async () =>
    fetch("/api/v1/auth/status", { credentials: "include" }).then((response) =>
      response.json(),
    ),
  );
  const forbidden = await page.evaluate(
    async ({ nodeId, lawId, articleId, csrfToken }) => {
      const response = await fetch(
        `/api/v1/admin/structure/${nodeId}/articles`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            legislationId: lawId,
            assign: [articleId],
            unassign: [],
            reason: "محاولة مباشرة دون صلاحية",
          }),
        },
      );
      return response.status;
    },
    {
      nodeId: chapterTwo.id,
      lawId: legislationId!,
      articleId: articleTwo.id,
      csrfToken: status.csrfToken,
    },
  );
  expect(forbidden).toBe(403);

  const anonymous = await browser.newContext();
  const unauthorized = await anonymous.request.patch(
    `/api/v1/admin/structure/${chapterTwo.id}/articles`,
    {
      data: {
        legislationId,
        assign: [articleTwo.id],
        unassign: [],
        reason: "طلب بلا جلسة",
      },
    },
  );
  expect(unauthorized.status()).toBe(401);
  await anonymous.close();
});
