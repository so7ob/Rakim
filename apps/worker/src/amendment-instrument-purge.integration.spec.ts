import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processPurge, workerDatabase as db } from "./main.js";

describe("purging a retained amendment instrument", () => {
  const instrumentId = randomUUID(),
    targetId = randomUUID(),
    sourceId = randomUUID(),
    amendmentId = randomUUID(),
    operationId = randomUUID(),
    articleId = randomUUID(),
    versionId = randomUUID(),
    modificationId = randomUUID(),
    noteId = randomUUID(),
    batchId = randomUUID(),
    jobId = randomUUID();
  beforeAll(async () => {
    await db.initialize();
    const [refs] = await db.query(
      "SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId,(SELECT id FROM users WHERE username='super') actorId",
    );
    await db.query(
      "INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status) VALUES (?,? ,?,'text/plain',1,?,NOW(3),'اختبار الإتلاف','REVIEWED')",
      [
        sourceId,
        "مصدر محفوظ",
        `tests/${sourceId}.txt`,
        createHash("sha256").update(sourceId).digest("hex"),
      ],
    );
    for (const [id, deleted] of [
      [instrumentId, true],
      [targetId, false],
    ] as const)
      await db.query(
        "INSERT INTO legislations (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level,is_active,deleted_at) VALUES (?,?,?,2026,'تشريع اختبار السند','PUBLISHED','IN_FORCE','A',?,?)",
        [
          id,
          refs.typeId,
          refs.authorityId,
          deleted ? 0 : 1,
          deleted ? new Date() : null,
        ],
      );
    await db.query(
      "INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key) VALUES (?,?,'1','1','0001')",
      [articleId, targetId],
    );
    await db.query(
      "INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,status,source_document_id) VALUES (?,?,1,'نص محفوظ','نص محفوظ','نص محفوظ','2026-01-01','PUBLISHED',?)",
      [versionId, articleId, sourceId],
    );
    await db.query(
      "INSERT INTO amendments (id,amended_legislation_id,instrument_legislation_id,title_ar,effective_from,source_document_id,status) VALUES (?,?,?,'وثيقة منشورة محفوظة','2026-01-01',?,'PUBLISHED')",
      [amendmentId, targetId, instrumentId, sourceId],
    );
    await db.query(
      "INSERT INTO amendment_operations (id,amendment_id,operation_type,target_kind,target_id,effective_from,application_order,citation_text,source_document_id) VALUES (?,?,'CORRECT','ARTICLE',?,'2026-01-01',1,'نص الاستناد',?)",
      [operationId, amendmentId, articleId, sourceId],
    );
    await db.query(
      "INSERT INTO article_modifications (id,operation_id,article_id,after_version_id,new_text,effective_from) VALUES (?,?,?,?,'نص محفوظ','2026-01-01')",
      [modificationId, operationId, articleId, versionId],
    );
    await db.query(
      "INSERT INTO user_notes (id,user_id,entity_type,entity_id,note_text) VALUES (?,?,'AMENDMENT',?,'ملاحظة تبقى محفوظة')",
      [noteId, refs.actorId, amendmentId],
    );
    await db.query(
      "INSERT INTO deletion_batches (id,root_kind,root_id,root_label,status,actor_id,reason,impact_token,selected_optional_json,summary_json,restore_until) VALUES (?,'legislations',?,'السند','PURGING',?,'إتلاف السند فقط',REPEAT('a',64),JSON_ARRAY(),JSON_OBJECT(),NOW(3))",
      [batchId, instrumentId, refs.actorId],
    );
    await db.query(
      "INSERT INTO deletion_batch_items (batch_id,item_kind,item_id,relation_key,label_ar,is_required,snapshot_json) VALUES (?,'legislations',?,'root','السند',TRUE,JSON_OBJECT())",
      [batchId, instrumentId],
    );
    await db.query(
      "INSERT INTO deletion_batch_items (batch_id,item_kind,item_id,relation_key,label_ar,is_required,snapshot_json) VALUES (?,'amendment_instrument_link',?,'retained-amendment-links','ارتباط محفوظ',TRUE,?)",
      [
        batchId,
        amendmentId,
        JSON.stringify({
          instrumentLegislationId: instrumentId,
          instrumentTitle: "اسم السند المحذوف",
          amendedLegislationId: targetId,
          sourceDocumentId: sourceId,
        }),
      ],
    );
    await db.query(
      "INSERT INTO job_queue (id,job_type,payload_json,status) VALUES (?,'PURGE_DELETION_BATCH',?,'RUNNING')",
      [jobId, JSON.stringify({ deletionBatchId: batchId })],
    );
  });
  it("rejects a changed instrument or a shared source included for deletion", async () => {
    await db.query(
      "UPDATE amendments SET instrument_legislation_id=NULL WHERE id=?",
      [amendmentId],
    );
    await expect(
      processPurge({ deletionBatchId: batchId }, jobId),
    ).rejects.toThrow("RETAINED_AMENDMENT_LINK_CHANGED");
    await db.query(
      "UPDATE amendments SET instrument_legislation_id=? WHERE id=?",
      [instrumentId, amendmentId],
    );
    await db.query(
      "INSERT INTO deletion_batch_items (batch_id,item_kind,item_id,relation_key,label_ar,is_required,snapshot_json) VALUES (?,'source_documents',?,'imports-and-sources','مصدر مشترك',TRUE,JSON_OBJECT())",
      [batchId, sourceId],
    );
    await expect(
      processPurge({ deletionBatchId: batchId }, jobId),
    ).rejects.toThrow("RETAINED_AMENDMENT_LINK_CHANGED");
    await db.query(
      "DELETE FROM deletion_batch_items WHERE batch_id=? AND item_kind='source_documents'",
      [batchId],
    );
  });
  it("requires a recorded link for every retained amendment", async () => {
    await db.query(
      "UPDATE deletion_batch_items SET item_kind='unapproved_link' WHERE batch_id=? AND item_kind='amendment_instrument_link'",
      [batchId],
    );
    await expect(
      processPurge({ deletionBatchId: batchId }, jobId),
    ).rejects.toThrow("AMENDMENT_INSTRUMENT_OUTSIDE_BATCH");
    await db.query(
      "UPDATE deletion_batch_items SET item_kind='amendment_instrument_link' WHERE batch_id=? AND item_kind='unapproved_link'",
      [batchId],
    );
  });
  it("purges only the instrument, retaining the document, effects, notes and audit", async () => {
    const [before] = await db.query(
      "SELECT revision FROM amendments WHERE id=?",
      [amendmentId],
    );
    await processPurge({ deletionBatchId: batchId }, jobId);
    expect(
      await db.query("SELECT id FROM legislations WHERE id=?", [instrumentId]),
    ).toHaveLength(0);
    const [am] = await db.query("SELECT * FROM amendments WHERE id=?", [
      amendmentId,
    ]);
    expect(am.instrument_legislation_id).toBeNull();
    expect(am.status).toBe("PUBLISHED");
    expect(am.deleted_at).toBeNull();
    expect(am.revision).toBe(before.revision + 1);
    for (const [table, id] of [
      ["legislations", targetId],
      ["articles", articleId],
      ["article_versions", versionId],
      ["amendment_operations", operationId],
      ["article_modifications", modificationId],
      ["source_documents", sourceId],
      ["user_notes", noteId],
    ])
      expect(
        await db.query(`SELECT id FROM ${table} WHERE id=?`, [id]),
      ).toHaveLength(1);
    const [audit] = await db.query(
      "SELECT before_json FROM audit_logs WHERE entity_id=? AND action='DETACH_AMENDMENT_INSTRUMENT'",
      [amendmentId],
    );
    expect(
      typeof audit.before_json === "string"
        ? JSON.parse(audit.before_json)
        : audit.before_json,
    ).toMatchObject({
      instrumentLegislationId: instrumentId,
      instrumentTitle: "اسم السند المحذوف",
    });
    expect(
      (
        await db.query("SELECT status FROM deletion_batches WHERE id=?", [
          batchId,
        ])
      )[0].status,
    ).toBe("PURGED");
  });
  afterAll(async () => {
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await q.query("SET @ylp_maintenance=1");
      for (const [table, id] of [
        ["audit_logs", amendmentId],
        ["user_notes", noteId],
        ["article_modifications", modificationId],
        ["amendments", amendmentId],
        ["article_versions", versionId],
        ["articles", articleId],
        ["legislations", instrumentId],
        ["legislations", targetId],
        ["source_documents", sourceId],
        ["job_queue", jobId],
        ["deletion_batches", batchId],
      ])
        await q.query(
          `DELETE FROM ${table} WHERE ${table === "audit_logs" ? "entity_id" : "id"}=?`,
          [id],
        );
    } finally {
      await q.query("SET @ylp_maintenance=0");
      await q.release();
      await db.destroy();
    }
  });
});
