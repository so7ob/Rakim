import { createHash, randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { PERMISSION_CATALOG } from "../common/permission-catalog.js";
import { createDataSource } from "../database/config.js";
import { ImportsService } from "../imports/imports.service.js";
import { DeletionService } from "./deletion.service.js";

describe("relational deletion trash on MariaDB", () => {
  let db: DataSource;
  let service: DeletionService;
  let actor: AuthUser;
  let typeId: string;
  let authorityId: string;
  const lawIds: string[] = [];
  const sourceIds: string[] = [];
  const importIds: string[] = [];
  const batchIds: string[] = [];

  beforeAll(async () => {
    db = await createDataSource().initialize();
    service = new DeletionService(db);
    const [base] = await db.query(
      "SELECT (SELECT id FROM users WHERE username='super') actorId,(SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId",
    );
    actor = {
      id: base.actorId,
      username: "super",
      displayName: "اختبار الحذف",
      roles: [],
      permissions: PERMISSION_CATALOG.map((permission) => permission.code),
    };
    typeId = base.typeId;
    authorityId = base.authorityId;
  });

  async function fixture(
    options: {
      law?: boolean;
      lawStatus?: string;
      importStatus?: string;
      jobStatus?: "READY" | "RUNNING";
    } = {},
  ) {
    const sourceId = randomUUID();
    const importId = randomUUID();
    const lawId = options.law === false ? null : randomUUID();
    sourceIds.push(sourceId);
    importIds.push(importId);
    if (lawId) lawIds.push(lawId);
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار الحذف','EXTRACTED',?)`,
      [
        sourceId,
        `trash-${sourceId}.txt`,
        `tests/${sourceId}.txt`,
        createHash("sha256").update(sourceId).digest("hex"),
        actor.id,
      ],
    );
    if (lawId) {
      await db.query(
        `INSERT INTO legislations
         (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
         VALUES (?,?,?,?,?,?,'UNKNOWN','D')`,
        [
          lawId,
          typeId,
          authorityId,
          2026,
          `تشريع حذف ${lawId}`,
          options.lawStatus ?? "DRAFT",
        ],
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
         VALUES (?,?,'CHAPTER','الفصل الأول','فصل اختبار','000001')`,
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
         VALUES (?,?,1,'نص اختبار','نص اختبار','نص اختبار','2026-01-01','DRAFT',?)`,
        [randomUUID(), articleId, sourceId],
      );
      await db.query(
        `INSERT INTO legislation_source_documents
         (legislation_id,source_document_id,source_role) VALUES (?,?,'EXTRACTION')`,
        [lawId, sourceId],
      );
    }
    await db.query(
      `INSERT INTO source_imports
       (id,source_document_id,legislation_id,uploaded_by,status,detected_format)
       VALUES (?,?,?,?,?,'TXT')`,
      [importId, sourceId, lawId, actor.id, options.importStatus ?? "REVIEWED"],
    );
    let jobId: string | null = null;
    if (options.jobStatus) {
      jobId = randomUUID();
      await db.query(
        `INSERT INTO job_queue
         (id,job_type,payload_json,status,locked_by,locked_at)
         VALUES (?,'IMPORT_SOURCE',?,?,?,?)`,
        [
          jobId,
          JSON.stringify({ importId, sourceDocumentId: sourceId }),
          options.jobStatus,
          options.jobStatus === "RUNNING" ? "test-worker" : null,
          options.jobStatus === "RUNNING" ? new Date() : null,
        ],
      );
    }
    return { sourceId, importId, lawId, jobId };
  }

  it("shows the full impact, trashes a reviewed import and restores its draft graph", async () => {
    const record = await fixture({
      lawStatus: "DRAFT",
      jobStatus: "READY",
    });
    const sourceOnly = {
      ...actor,
      permissions: ["source.view", "source.enable"],
    };
    await expect(
      service.impact("imports", record.importId, sourceOnly),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const impact = (await service.impact(
      "imports",
      record.importId,
      actor,
    )) as any;
    expect(impact.allowed).toBe(true);
    expect(
      impact.groups.find((group: any) => group.key === "legislation-content")
        .count,
    ).toBe(2);
    expect(
      impact.groups.find((group: any) => group.key === "linked-legislation")
        .items[0].label,
    ).toContain("تشريع حذف");
    expect(
      impact.groups.find((group: any) => group.key === "imports-and-sources")
        .required,
    ).toBe(true);
    const removed = await service.remove(
      "imports",
      record.importId,
      actor,
      "حذف حزمة اختبار مترابطة",
      impact.impactToken,
      [],
    );
    batchIds.push(removed.batchId);
    expect(removed.status).toBe("TRASHED");
    expect(
      (await service.list(sourceOnly)).some(
        (batch: any) => batch.id === removed.batchId,
      ),
    ).toBe(false);
    await expect(
      service.detail(removed.batchId, sourceOnly),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.restore(
        removed.batchId,
        sourceOnly,
        "استعادة بلا صلاحية التشريع",
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (
        await db.query("SELECT status FROM job_queue WHERE id=?", [
          record.jobId,
        ])
      )[0].status,
    ).toBe("CANCELLED");
    expect(
      (await new ImportsService(db).list()).some(
        (x: any) => x.id === record.importId,
      ),
    ).toBe(false);
    await service.restore(removed.batchId, actor, "استعادة حزمة الاختبار");
    const [restoredImport] = await db.query(
      "SELECT deleted_at,is_active,status FROM source_imports WHERE id=?",
      [record.importId],
    );
    const [restoredLaw] = await db.query(
      "SELECT deleted_at,is_active,status FROM legislations WHERE id=?",
      [record.lawId],
    );
    expect(restoredImport.deleted_at).toBeNull();
    expect(restoredImport.is_active).toBe(1);
    expect(restoredImport.status).toBe("REVIEWED");
    expect(restoredLaw.deleted_at).toBeNull();
    expect(restoredLaw.status).toBe("DRAFT");
  });

  it("keeps an unselected import and source usable when trashing only a draft law", async () => {
    const record = await fixture();
    const impact = (await service.impact(
      "legislations",
      record.lawId!,
      actor,
    )) as any;
    const optional = impact.groups.find(
      (group: any) => group.key === "imports-and-sources",
    );
    expect(optional.required).toBe(false);
    expect(optional.selectedByDefault).toBe(false);
    const removed = await service.remove(
      "legislations",
      record.lawId!,
      actor,
      "حذف التشريع فقط",
      impact.impactToken,
      [],
    );
    batchIds.push(removed.batchId);
    const [kept] = await db.query(
      `SELECT si.deleted_at importDeleted,si.legislation_id legislationId,sd.deleted_at sourceDeleted
       FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE si.id=?`,
      [record.importId],
    );
    expect(kept.importDeleted).toBeNull();
    expect(kept.sourceDeleted).toBeNull();
    expect(kept.legislationId).toBe(record.lawId);
    await db.query("UPDATE source_imports SET legislation_id=NULL WHERE id=?", [
      record.importId,
    ]);
    await expect(
      service.restore(removed.batchId, actor, "رفض استعادة ارتباط تغير لاحقًا"),
    ).rejects.toMatchObject({ response: { code: "RESTORE_CONFLICT" } });
    await db.query("UPDATE source_imports SET legislation_id=? WHERE id=?", [
      record.lawId,
      record.importId,
    ]);
    await service.restore(removed.batchId, actor, "استعادة ارتباط التشريع");
    expect(
      (
        await db.query("SELECT legislation_id FROM source_imports WHERE id=?", [
          record.importId,
        ])
      )[0].legislation_id,
    ).toBe(record.lawId);
  });

  it("rejects stale impact tokens and published history", async () => {
    const stale = await fixture();
    const initial = (await service.impact(
      "legislations",
      stale.lawId!,
      actor,
    )) as any;
    await db.query(
      `INSERT INTO structure_nodes
       (id,legislation_id,node_type,label_ar,title_ar,sort_key)
       VALUES (?,?,'SECTION','فرع','فرع جديد','000002')`,
      [randomUUID(), stale.lawId],
    );
    await expect(
      service.remove(
        "legislations",
        stale.lawId!,
        actor,
        "رمز أثر قديم",
        initial.impactToken,
        [],
      ),
    ).rejects.toMatchObject({ response: { code: "DELETE_IMPACT_CHANGED" } });

    const published = await fixture({ lawStatus: "PUBLISHED" });
    await db.query(
      "UPDATE legislation_versions SET workflow_status='PUBLISHED',published_at=NOW(3) WHERE legislation_id=?",
      [published.lawId],
    );
    const impact = (await service.impact(
      "legislations",
      published.lawId!,
      actor,
    )) as any;
    expect(impact.allowed).toBe(false);
    expect(impact.blockers.join(" ")).toMatch(/منشور/);
  });

  it("requests cancellation for a running extraction and enforces permissions", async () => {
    const record = await fixture({
      law: false,
      importStatus: "EXTRACTING",
      jobStatus: "RUNNING",
    });
    const impact = (await service.impact(
      "imports",
      record.importId,
      actor,
    )) as any;
    const removed = await service.remove(
      "imports",
      record.importId,
      actor,
      "إلغاء استخراج جار",
      impact.impactToken,
      [],
    );
    batchIds.push(removed.batchId);
    expect(removed.status).toBe("CANCELLING");
    expect(
      (
        await db.query("SELECT cancel_requested_at FROM job_queue WHERE id=?", [
          record.jobId,
        ])
      )[0].cancel_requested_at,
    ).toBeTruthy();
    await expect(
      service.impact("imports", record.importId, {
        ...actor,
        permissions: [],
      }),
    ).rejects.toThrow(/الصلاحية/);
    await db.query("UPDATE job_queue SET status='CANCELLED' WHERE id=?", [
      record.jobId,
    ]);
    await db.query("UPDATE deletion_batches SET status='TRASHED' WHERE id=?", [
      removed.batchId,
    ]);
    await service.restore(removed.batchId, actor, "استعادة بعد الإلغاء");
  });

  it("reports the exact conflict when the source hash is reused before restore", async () => {
    const record = await fixture({ law: false });
    const impact = (await service.impact(
      "imports",
      record.importId,
      actor,
    )) as any;
    const removed = await service.remove(
      "imports",
      record.importId,
      actor,
      "حذف لاختبار تعارض الاستعادة",
      impact.impactToken,
      [],
    );
    batchIds.push(removed.batchId);
    const [original] = await db.query(
      "SELECT sha256 FROM source_documents WHERE id=?",
      [record.sourceId],
    );
    const duplicateId = randomUUID();
    sourceIds.push(duplicateId);
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'مصدر تعارض الاستعادة','EXTRACTED',?)`,
      [
        duplicateId,
        `restore-conflict-${duplicateId}.txt`,
        `tests/${duplicateId}.txt`,
        original.sha256,
        actor.id,
      ],
    );
    await expect(
      service.restore(removed.batchId, actor, "محاولة استعادة متعارضة"),
    ).rejects.toMatchObject({ response: { code: "RESTORE_CONFLICT" } });
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    const q = db.createQueryRunner();
    await q.connect();
    await q.query("SET @ylp_maintenance=1");
    try {
      if (importIds.length) {
        await q.query(
          `DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.importId')) IN (${importIds.map(() => "?").join(",")})`,
          importIds,
        );
        await q.query(
          `DELETE FROM source_imports WHERE id IN (${importIds.map(() => "?").join(",")})`,
          importIds,
        );
      }
      for (const id of lawIds) {
        await q.query(
          "DELETE av FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?",
          [id],
        );
        await q.query("DELETE FROM articles WHERE legislation_id=?", [id]);
        await q.query(
          "UPDATE structure_nodes SET parent_id=NULL WHERE legislation_id=?",
          [id],
        );
        await q.query("DELETE FROM structure_nodes WHERE legislation_id=?", [
          id,
        ]);
        await q.query(
          "UPDATE legislation_versions SET previous_version_id=NULL WHERE legislation_id=?",
          [id],
        );
        await q.query(
          "DELETE FROM legislation_versions WHERE legislation_id=?",
          [id],
        );
        await q.query(
          "DELETE FROM legislation_source_documents WHERE legislation_id=?",
          [id],
        );
        await q.query("DELETE FROM legislations WHERE id=?", [id]);
      }
      if (sourceIds.length)
        await q.query(
          `DELETE FROM source_documents WHERE id IN (${sourceIds.map(() => "?").join(",")})`,
          sourceIds,
        );
      if (batchIds.length) {
        await q.query(
          `DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.deletionBatchId')) IN (${batchIds.map(() => "?").join(",")})`,
          batchIds,
        );
        await q.query(
          `DELETE FROM deletion_batches WHERE id IN (${batchIds.map(() => "?").join(",")})`,
          batchIds,
        );
      }
    } finally {
      await q.query("SET @ylp_maintenance=0");
      await q.release();
      await db.destroy();
    }
  });
});
