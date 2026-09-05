import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

const password = "DevOnly!ChangeMe2026";

interface PublicationFixture {
  sourceId: string;
  legislationId: string;
  legislationVersionId: string;
  articleIds: string[];
}

let activeFixture: PublicationFixture | null = null;

async function createPublicationFixture(): Promise<PublicationFixture> {
  const db = await createDataSource().initialize();
  const sourceId = randomUUID();
  const legislationId = randomUUID();
  const legislationVersionId = randomUUID();
  const articleIds = Array.from({ length: 10 }, () => randomUUID());
  try {
    const refs = await db.query(
      `SELECT
       (SELECT id FROM legislation_types LIMIT 1) typeId,
       (SELECT id FROM authorities LIMIT 1) authorityId,
       (SELECT id FROM users WHERE username='super' LIMIT 1) userId`,
    );
    const marker = randomUUID();
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
        obtained_from,extraction_status,reviewed_at,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'Fixture E2E للنشر','REVIEWED',NOW(3),?)`,
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
       (id,type_id,authority_id,official_number,year,title_ar,status,legal_status,
        verification_level,effective_from)
       VALUES (?,?,?,'31',2026,?,'APPROVED_FOR_PUBLISHING','UNKNOWN','D','2026-01-01')`,
      [
        legislationId,
        refs[0].typeId,
        refs[0].authorityId,
        `تشريع اختبار النشر الذري ${Date.now()}`,
      ],
    );
    await db.query(
      `INSERT INTO legislation_versions
       (id,legislation_id,version_no,workflow_status,content_kind,
        source_document_id,valid_from)
       VALUES (?,?,1,'APPROVED_FOR_PUBLISHING','EXTRACTED',?,'2026-01-01')`,
      [legislationVersionId, legislationId, sourceId],
    );
    for (const [index, articleId] of articleIds.entries()) {
      const label = String(index + 1);
      const text = `نص اصطناعي للمادة ${label}.`;
      await db.query(
        `INSERT INTO articles
         (id,legislation_id,published_label,current_label,sort_key)
         VALUES (?,?,?,?,?)`,
        [articleId, legislationId, label, label, label.padStart(6, "0")],
      );
      await db.query(
        `INSERT INTO article_versions
         (id,article_id,version_no,text_original,text_structured,text_normalized,
          valid_from,status,source_document_id)
         VALUES (?,?,1,?,?,?,'2026-01-01','DRAFT',?)`,
        [randomUUID(), articleId, text, text, text, sourceId],
      );
    }
    return { sourceId, legislationId, legislationVersionId, articleIds };
  } finally {
    await db.destroy();
  }
}

async function removePublicationFixture(fixture: PublicationFixture) {
  const db = await createDataSource().initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.query("SET @ylp_maintenance=1");
    await runner.query(
      "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
      [fixture.legislationId],
    );
    await runner.query("DELETE FROM audit_logs WHERE entity_id=?", [
      fixture.legislationId,
    ]);
    await runner.query(
      "DELETE FROM content_responsibilities WHERE legislation_id=?",
      [fixture.legislationId],
    );
    await runner.query("DELETE FROM workflow_events WHERE legislation_id=?", [
      fixture.legislationId,
    ]);
    await runner.query(
      `DELETE FROM article_versions WHERE article_id IN (${fixture.articleIds.map(() => "?").join(",")})`,
      fixture.articleIds,
    );
    await runner.query("DELETE FROM articles WHERE legislation_id=?", [
      fixture.legislationId,
    ]);
    await runner.query("DELETE FROM legislation_versions WHERE id=?", [
      fixture.legislationVersionId,
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
  if (activeFixture) await removePublicationFixture(activeFixture);
  activeFixture = null;
});

async function login(page: import("@playwright/test").Page) {
  const bootstrap = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/status") &&
      response.request().method() === "GET",
  );
  await page.goto("/ar/login");
  await bootstrap;
  await page.getByLabel("اسم المستخدم").fill("super");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin/);
}

test("publishes draft article versions with the legislation", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  activeFixture = await createPublicationFixture();
  const legislationId = activeFixture.legislationId;
  await login(page);
  await page.goto(`/ar/admin/content/${legislationId}/workflow`);

  await expect(
    page.getByText(
      "يوجد 10 نسخة مادة مسودة. لا تحتاج إلى اعتماد المواد منفردة",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByPlaceholder("سبب الإجراء")
    .fill("اختبار نشر المواد مع التشريع");
  await page.getByRole("button", { name: "تنفيذ", exact: true }).click();
  await expect(
    page.getByText("تم نشر التشريع و10 نسخة مادة معًا."),
  ).toBeVisible();

  const publicResponse = await page.request.get(
    `/api/v1/legislations/${legislationId}/articles`,
  );
  expect(publicResponse.ok()).toBeTruthy();
  const publicArticles = await publicResponse.json();
  expect(publicArticles.items).toHaveLength(10);

  await page.reload();
  await expect(page.locator(".status-published").first()).toHaveText("منشور");
  const persistedResponse = await page.request.get(
    `/api/v1/legislations/${legislationId}/articles`,
  );
  expect((await persistedResponse.json()).items).toHaveLength(10);
  await page.screenshot({
    path: testInfo.outputPath("published-articles-workflow.png"),
    fullPage: true,
  });
});
