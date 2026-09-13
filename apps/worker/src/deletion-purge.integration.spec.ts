import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  executeJob,
  processImport,
  processPurge,
  workerDatabase,
} from "./main.js";

describe("deletion batch purge worker", () => {
  const sourceId = randomUUID();
  const importId = randomUUID();
  const lawId = randomUUID();
  const structureId = randomUUID();
  const articleId = randomUUID();
  const batchId = randomUUID();
  const jobId = randomUUID();
  const verificationId = randomUUID();
  const noteId = randomUUID();
  const reportId = randomUUID();

  beforeAll(async () => {
    await workerDatabase.initialize();
    const [base] = await workerDatabase.query(
      "SELECT (SELECT id FROM users WHERE username='super') userId,(SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId",
    );
    await workerDatabase.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار عامل الإتلاف','FAILED',?)`,
      [
        sourceId,
        `purge-${sourceId}.txt`,
        `../unsafe-${sourceId}.txt`,
        createHash("sha256").update(sourceId).digest("hex"),
        base.userId,
      ],
    );
    await workerDatabase.query(
      `INSERT INTO legislations
       (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level,is_active,deleted_at)
       VALUES (?,?,?,?,?,'DRAFT','UNKNOWN','D',FALSE,NOW(3))`,
      [lawId, base.typeId, base.authorityId, 2026, "تشريع إتلاف مترابط"],
    );
    await workerDatabase.query(
      `INSERT INTO legislation_versions
       (id,legislation_id,version_no,workflow_status,content_kind,source_document_id,valid_from)
       VALUES (?,?,1,'DRAFT','EXTRACTED',?,'2026-01-01')`,
      [randomUUID(), lawId, sourceId],
    );
    await workerDatabase.query(
      `INSERT INTO structure_nodes
       (id,legislation_id,node_type,label_ar,title_ar,sort_key,is_active,deleted_at)
       VALUES (?,?,'CHAPTER','الفصل الأول','فصل الإتلاف','000001',FALSE,NOW(3))`,
      [structureId, lawId],
    );
    await workerDatabase.query(
      `INSERT INTO articles
       (id,legislation_id,structure_node_id,published_label,current_label,sort_key,is_active,deleted_at)
       VALUES (?,?,?,'1','1','000001',FALSE,NOW(3))`,
      [articleId, lawId, structureId],
    );
    await workerDatabase.query(
      `INSERT INTO article_versions
       (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,status,source_document_id)
       VALUES (?,?,1,'نص','نص','نص','2026-01-01','DRAFT',?)`,
      [randomUUID(), articleId, sourceId],
    );
    await workerDatabase.query(
      `INSERT INTO legislation_source_documents
       (legislation_id,source_document_id,source_role) VALUES (?,?,'EXTRACTION')`,
      [lawId, sourceId],
    );
    await workerDatabase.query(
      `INSERT INTO source_imports
       (id,source_document_id,legislation_id,uploaded_by,status,detected_format,is_active,deleted_at)
       VALUES (?,?,?,?,'FAILED','TXT',FALSE,NOW(3))`,
      [importId, sourceId, lawId, base.userId],
    );
    await workerDatabase.query(
      `INSERT INTO verification_records
       (id,entity_type,entity_id,level,verified_at) VALUES (?,'LEGISLATION',?,'D',NOW(3))`,
      [verificationId, lawId],
    );
    await workerDatabase.query(
      `INSERT INTO user_notes
       (id,user_id,entity_type,entity_id,note_text) VALUES (?,?,'LEGISLATION',?,'ملاحظة اختبار')`,
      [noteId, base.userId, lawId],
    );
    await workerDatabase.query(
      `INSERT INTO reports
       (id,reporter_id,entity_type,entity_id,category,details) VALUES (?,?,'ARTICLE',?,'اختبار','بلاغ اختبار')`,
      [reportId, base.userId, articleId],
    );
    await workerDatabase.query(
      `UPDATE source_documents SET is_active=FALSE,deleted_at=NOW(3) WHERE id=?`,
      [sourceId],
    );
    await workerDatabase.query(
      `INSERT INTO deletion_batches
       (id,root_kind,root_id,root_label,status,reason,impact_token,selected_optional_json,summary_json,restore_until)
       VALUES (?,'imports',?,'اختبار إتلاف','PURGING','اختبار عامل الإتلاف',REPEAT('a',64),JSON_ARRAY(),JSON_OBJECT(),NOW(3))`,
      [batchId, importId],
    );
    for (const [kind, id, relationKey, label] of [
      ["legislations", lawId, "root", "تشريع اختبار"],
      ["structure_nodes", structureId, "legislation-content", "فصل اختبار"],
      ["articles", articleId, "legislation-content", "مادة اختبار"],
      ["source_imports", importId, "imports-and-sources", "عملية اختبار"],
      ["source_documents", sourceId, "imports-and-sources", "مصدر اختبار"],
    ])
      await workerDatabase.query(
        `INSERT INTO deletion_batch_items
         (batch_id,item_kind,item_id,relation_key,label_ar,is_required,snapshot_json)
         VALUES (?,?,?,?,?,TRUE,JSON_OBJECT())`,
        [batchId, kind, id, relationKey ?? "imports-and-sources", label],
      );
    await workerDatabase.query(
      `INSERT INTO job_queue (id,job_type,payload_json,status,locked_by,locked_at)
       VALUES (?,'PURGE_DELETION_BATCH',?,'RUNNING','test-worker',NOW(3))`,
      [jobId, JSON.stringify({ deletionBatchId: batchId })],
    );
  });

  it("hard-deletes relational rows and completes the durable purge job", async () => {
    await executeJob({
      id: jobId,
      job_type: "PURGE_DELETION_BATCH",
      payload_json: JSON.stringify({ deletionBatchId: batchId }),
    });
    expect(
      (
        await workerDatabase.query(
          "SELECT status FROM deletion_batches WHERE id=?",
          [batchId],
        )
      )[0].status,
    ).toBe("PURGE_FAILED");
    expect(
      (
        await workerDatabase.query("SELECT status FROM job_queue WHERE id=?", [
          jobId,
        ])
      )[0].status,
    ).toBe("FAILED");
    await workerDatabase.query(
      "UPDATE source_documents SET storage_key=? WHERE id=?",
      [`tests/${sourceId}.txt`, sourceId],
    );
    await workerDatabase.query(
      "UPDATE job_queue SET status='RUNNING',last_error=NULL,completed_at=NULL WHERE id=?",
      [jobId],
    );
    await executeJob({
      id: jobId,
      job_type: "PURGE_DELETION_BATCH",
      payload_json: JSON.stringify({ deletionBatchId: batchId }),
    });
    const [batch] = await workerDatabase.query(
      "SELECT status,purged_at FROM deletion_batches WHERE id=?",
      [batchId],
    );
    const [job] = await workerDatabase.query(
      "SELECT status,progress FROM job_queue WHERE id=?",
      [jobId],
    );
    expect(batch.status).toBe("PURGED");
    expect(batch.purged_at).toBeTruthy();
    expect(job).toMatchObject({ status: "SUCCEEDED", progress: 100 });
    expect(
      await workerDatabase.query("SELECT id FROM source_imports WHERE id=?", [
        importId,
      ]),
    ).toEqual([]);
    expect(
      await workerDatabase.query("SELECT id FROM source_documents WHERE id=?", [
        sourceId,
      ]),
    ).toEqual([]);
    expect(
      await workerDatabase.query("SELECT id FROM legislations WHERE id=?", [
        lawId,
      ]),
    ).toEqual([]);
    for (const [table, id] of [
      ["verification_records", verificationId],
      ["user_notes", noteId],
      ["reports", reportId],
    ])
      expect(
        await workerDatabase.query(`SELECT id FROM ${table} WHERE id=?`, [id]),
      ).toEqual([]);
    await processPurge({ deletionBatchId: batchId }, jobId);
    expect(
      (
        await workerDatabase.query(
          "SELECT status FROM deletion_batches WHERE id=?",
          [batchId],
        )
      )[0].status,
    ).toBe("PURGED");
  });

  afterAll(async () => {
    if (!workerDatabase.isInitialized) return;
    await workerDatabase.query("SET @ylp_maintenance=1");
    await workerDatabase.query("DELETE FROM job_queue WHERE id=?", [jobId]);
    await workerDatabase.query("DELETE FROM deletion_batches WHERE id=?", [
      batchId,
    ]);
    await workerDatabase.query("SET @ylp_maintenance=0");
    await workerDatabase.destroy();
  });
});

describe("cooperative import cancellation", () => {
  const sourceId = randomUUID();
  const importId = randomUUID();
  const jobId = randomUUID();

  beforeAll(async () => {
    if (!workerDatabase.isInitialized) await workerDatabase.initialize();
    const [user] = await workerDatabase.query(
      "SELECT id FROM users WHERE username='super'",
    );
    await workerDatabase.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار الإلغاء','PENDING',?)`,
      [
        sourceId,
        `cancel-${sourceId}.txt`,
        `tests/${sourceId}.txt`,
        createHash("sha256").update(sourceId).digest("hex"),
        user.id,
      ],
    );
    await workerDatabase.query(
      `INSERT INTO source_imports
       (id,source_document_id,uploaded_by,status,detected_format)
       VALUES (?,?,?,'QUEUED','TXT')`,
      [importId, sourceId, user.id],
    );
    await workerDatabase.query(
      `INSERT INTO job_queue
       (id,job_type,payload_json,status,locked_by,locked_at,cancel_requested_at)
       VALUES (?,'IMPORT_SOURCE',?,'RUNNING','test-worker',NOW(3),NOW(3))`,
      [
        jobId,
        JSON.stringify({
          importId,
          sourceDocumentId: sourceId,
          storageKey: `tests/${sourceId}.txt`,
          mediaType: "text/plain",
        }),
      ],
    );
  });

  it("checks cancellation before writing extraction state", async () => {
    await expect(
      processImport(
        {
          importId,
          sourceDocumentId: sourceId,
          storageKey: `tests/${sourceId}.txt`,
          mediaType: "text/plain",
        },
        jobId,
      ),
    ).rejects.toThrow("JOB_CANCELLED");
    const [source] = await workerDatabase.query(
      "SELECT extraction_status FROM source_documents WHERE id=?",
      [sourceId],
    );
    const [item] = await workerDatabase.query(
      "SELECT status,extracted_text FROM source_imports WHERE id=?",
      [importId],
    );
    expect(source.extraction_status).toBe("PENDING");
    expect(item).toMatchObject({ status: "QUEUED", extracted_text: null });
  });

  afterAll(async () => {
    if (!workerDatabase.isInitialized) return;
    await workerDatabase.query("DELETE FROM job_queue WHERE id=?", [jobId]);
    await workerDatabase.query("DELETE FROM source_imports WHERE id=?", [
      importId,
    ]);
    await workerDatabase.query("DELETE FROM source_documents WHERE id=?", [
      sourceId,
    ]);
    await workerDatabase.destroy();
  });
});
