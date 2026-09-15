import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

let fixture:
  | { lawId: string; importId: string; sourceId: string; batchId?: string }
  | undefined;

test.afterEach(async () => {
  if (!fixture) return;
  const current = fixture;
  fixture = undefined;
  const db = await createDataSource().initialize();
  const q = db.createQueryRunner();
  await q.connect();
  await q.query("SET @ylp_maintenance=1");
  try {
    const batches = await q.query(
      "SELECT id FROM deletion_batches WHERE root_id IN (?,?)",
      [current.lawId, current.importId],
    );
    for (const batch of batches) {
      await q.query(
        "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.deletionBatchId'))=?",
        [batch.id],
      );
      await q.query("DELETE FROM audit_logs WHERE entity_id=?", [batch.id]);
      await q.query("DELETE FROM deletion_batches WHERE id=?", [batch.id]);
    }
    await q.query(
      "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.importId'))=?",
      [current.importId],
    );
    await q.query("DELETE FROM source_imports WHERE id=?", [current.importId]);
    await q.query(
      "DELETE av FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?",
      [current.lawId],
    );
    await q.query("DELETE FROM articles WHERE legislation_id=?", [
      current.lawId,
    ]);
    await q.query(
      "UPDATE structure_nodes SET parent_id=NULL WHERE legislation_id=?",
      [current.lawId],
    );
    await q.query("DELETE FROM structure_nodes WHERE legislation_id=?", [
      current.lawId,
    ]);
    await q.query("DELETE FROM legislation_versions WHERE legislation_id=?", [
      current.lawId,
    ]);
    await q.query(
      "DELETE FROM legislation_source_documents WHERE legislation_id=?",
      [current.lawId],
    );
    await q.query("DELETE FROM legislations WHERE id=?", [current.lawId]);
    await q.query("DELETE FROM source_documents WHERE id=?", [
      current.sourceId,
    ]);
  } finally {
    await q.query("SET @ylp_maintenance=0");
    await q.release();
    await db.destroy();
  }
});

test("previews, trashes and restores an import graph and handles a repeated hash", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  expect(
    (
      await request.get(
        `/api/v1/admin/lifecycle/imports/${randomUUID()}/delete-impact`,
      )
    ).status(),
  ).toBe(401);
  const login = await page.request.post("/api/v1/auth/login", {
    data: { username: "super", password: "DevOnly!ChangeMe2026" },
  });
  expect(login.ok()).toBeTruthy();

  const unique = randomUUID();
  const contents = `**الفصل الأول**\\\n**مادة (١)** نص حذف ${unique}`;
  const sourceName = `سلة-${unique.slice(0, 8)}.md`;
  const uploadPath = testInfo.outputPath(sourceName);
  await writeFile(uploadPath, contents);
  const db = await createDataSource().initialize();
  const [base] = await db.query(
    "SELECT (SELECT id FROM users WHERE username='super') userId,(SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId",
  );
  const lawId = randomUUID();
  const importId = randomUUID();
  const sourceId = randomUUID();
  fixture = { lawId, importId, sourceId };
  try {
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/markdown',?,?,NOW(3),'اختبار Playwright','EXTRACTED',?)`,
      [
        sourceId,
        sourceName,
        `tests/${sourceId}.md`,
        Buffer.byteLength(contents),
        createHash("sha256").update(contents).digest("hex"),
        base.userId,
      ],
    );
    await db.query(
      `INSERT INTO legislations
       (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
       VALUES (?,?,?,?,?,'DRAFT','UNKNOWN','D')`,
      [lawId, base.typeId, base.authorityId, 2026, `تشريع سلة ${unique}`],
    );
    await db.query(
      `INSERT INTO legislation_versions
       (id,legislation_id,version_no,workflow_status,content_kind,source_document_id,valid_from)
       VALUES (?,?,1,'DRAFT','EXTRACTED',?,'2026-01-01')`,
      [randomUUID(), lawId, sourceId],
    );
    const nodeId = randomUUID();
    const articleId = randomUUID();
    await db.query(
      `INSERT INTO structure_nodes
       (id,legislation_id,node_type,label_ar,title_ar,sort_key)
       VALUES (?,?,'CHAPTER','الفصل الأول','فصل السلة','000001')`,
      [nodeId, lawId],
    );
    await db.query(
      `INSERT INTO articles
       (id,legislation_id,structure_node_id,published_label,current_label,sort_key)
       VALUES (?,?,?,'1','1','000001')`,
      [articleId, lawId, nodeId],
    );
    await db.query(
      `INSERT INTO article_versions
       (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,status,source_document_id)
       VALUES (?,?,1,'نص السلة','نص السلة','نص السلة','2026-01-01','DRAFT',?)`,
      [randomUUID(), articleId, sourceId],
    );
    await db.query(
      `INSERT INTO legislation_source_documents
       (legislation_id,source_document_id,source_role) VALUES (?,?,'EXTRACTION')`,
      [lawId, sourceId],
    );
    await db.query(
      `INSERT INTO source_imports
       (id,source_document_id,legislation_id,uploaded_by,status,detected_format)
       VALUES (?,?,?,?,'REVIEWED','MARKDOWN')`,
      [importId, sourceId, lawId, base.userId],
    );
  } finally {
    await db.destroy();
  }

  const readerLogin = await request.post("/api/v1/auth/login", {
    data: { username: "reader", password: "DevOnly!ChangeMe2026" },
  });
  expect(readerLogin.ok()).toBeTruthy();
  expect(
    (
      await request.get(
        `/api/v1/admin/lifecycle/imports/${importId}/delete-impact`,
      )
    ).status(),
  ).toBe(403);

  await page.goto("/ar/admin/imports/queue");
  const card = page
    .locator("article.admin-card")
    .filter({ hasText: sourceName });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "حذف", exact: true }).click();
  const impact = page.getByRole("dialog", { name: `أثر حذف: ${sourceName}` });
  await expect(impact.getByText("التشريع الناتج من الاستيراد")).toBeVisible();
  await expect(impact.getByText(`تشريع سلة ${unique}`)).toBeVisible();
  await expect(impact.getByText("المواد والتقسيمات")).toBeVisible();
  await expect(
    impact
      .locator("details.deletion-impact-group")
      .filter({ hasText: "المواد والتقسيمات" })
      .getByText("2 عنصر"),
  ).toBeVisible();
  await expect(
    impact.getByText("عمليات الاستيراد وملفات المصدر"),
  ).toBeVisible();
  await impact.getByLabel("سبب الحذف").fill("اختبار نقل الحزمة إلى السلة");
  const deletionResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/admin/lifecycle/imports/${importId}`) &&
      response.request().method() === "PATCH",
  );
  await impact.getByRole("button", { name: "نقل إلى السلة" }).click();
  const deletion = await (await deletionResponse).json();
  fixture.batchId = deletion.batchId;
  await expect(card).toHaveCount(0);
  expect(
    (
      await page.request.post(
        `/api/v1/admin/deletions/${deletion.batchId}/restore`,
        { data: { reason: "طلب بلا CSRF" } },
      )
    ).status(),
  ).toBe(403);

  await page.goto("/ar/admin/trash");
  await expect(
    page.getByRole("heading", { name: "سلة المحذوفات" }),
  ).toBeVisible();
  const trashCard = page
    .locator("article.trash-card")
    .filter({ hasText: sourceName });
  await expect(trashCard).toBeVisible();
  await trashCard.getByText("عرض أثر الدفعة").click();
  await expect(trashCard.getByText("فصل السلة")).toBeVisible();
  await page.reload();
  await expect(
    page.locator("article.trash-card").filter({ hasText: sourceName }),
  ).toBeVisible();

  await page.goto("/ar/admin/imports/upload");
  const upload = page.getByRole("dialog", { name: "إضافة مصدر" });
  await upload.getByLabel("ملف النص للاستخراج").setInputFiles(uploadPath);
  await upload.getByLabel("جهة الحصول").fill("اختبار البصمة في السلة");
  await upload.getByRole("button", { name: "إضافة وبدء الاستخراج" }).click();
  await expect(upload.getByText("الملف موجود في سلة المحذوفات")).toBeVisible();
  await expect(
    upload.getByRole("button", { name: "إتلاف وبدء استيراد جديد" }),
  ).toBeVisible();
  await upload.getByRole("button", { name: "استعادة الدفعة" }).click();
  const restore = page.getByRole("dialog", { name: "استعادة الدفعة المحذوفة" });
  await restore.getByLabel("سبب الإجراء").fill("استعادة اختبار البصمة");
  await restore.getByRole("button", { name: "استعادة", exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/admin\/imports\/queue$/);
  await expect(
    page.locator("article.admin-card").filter({ hasText: sourceName }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar/admin/trash");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await expect(
    page.locator("article.trash-card").filter({ hasText: sourceName }),
  ).toBeVisible();
});
