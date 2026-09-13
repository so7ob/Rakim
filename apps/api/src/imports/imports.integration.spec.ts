import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { createDataSource } from "../database/config.js";
import { ImportsService } from "./imports.service.js";
import { LegislationsService } from "../legislations/legislations.service.js";

describe("structured import draft persistence", () => {
  let db: DataSource;
  let service: ImportsService;
  let publicLegislations: LegislationsService;
  let actor: AuthUser;
  let typeId: string;
  let authorityId: string;
  const sourceIds: string[] = [];
  const importIds: string[] = [];
  const lawIds: string[] = [];

  beforeAll(async () => {
    db = await createDataSource().initialize();
    service = new ImportsService(db);
    publicLegislations = new LegislationsService(db);
    const refs = await db.query(
      `SELECT
       (SELECT id FROM legislation_types LIMIT 1) typeId,
       (SELECT id FROM authorities LIMIT 1) authorityId,
       (SELECT id FROM users WHERE username='data_entry' LIMIT 1) userId`,
    );
    typeId = refs[0].typeId;
    authorityId = refs[0].authorityId;
    actor = {
      id: refs[0].userId,
      username: "data_entry",
      displayName: "مدخل البيانات",
      roles: ["DATA_ENTRY"],
      permissions: ["source.draft.create"],
    };
  });

  async function createReviewedImport(parsed: Record<string, unknown>) {
    const sourceId = randomUUID();
    const importId = randomUUID();
    const body = `integration-${sourceId}`;
    sourceIds.push(sourceId);
    importIds.push(importId);
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
        obtained_from,extraction_status,reviewed_at,created_by)
       VALUES (?,?,?,'text/plain',?,?,NOW(3),'اختبار تكامل','REVIEWED',NOW(3),?)`,
      [
        sourceId,
        `${sourceId}.txt`,
        `tests/${sourceId}.txt`,
        Buffer.byteLength(body),
        createHash("sha256").update(body).digest("hex"),
        actor.id,
      ],
    );
    await db.query(
      `INSERT INTO source_imports
       (id,source_document_id,uploaded_by,status,detected_format,extracted_text,extraction_json)
       VALUES (?,?,?,'REVIEWED','TXT',?,?)`,
      [importId, sourceId, actor.id, body, JSON.stringify(parsed)],
    );
    return importId;
  }

  async function attachOfficialPdf(importId: string) {
    const sourceId = randomUUID();
    const body = `%PDF-1.4 integration-${sourceId}`;
    sourceIds.push(sourceId);
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
        obtained_from,extraction_status,reviewed_at,created_by)
       VALUES (?,?,?,'application/pdf',?,?,NOW(3),'اختبار تكامل','REVIEWED',NOW(3),?)`,
      [
        sourceId,
        "نسخة القانون الرسمية.pdf",
        `tests/${sourceId}.pdf`,
        Buffer.byteLength(body),
        createHash("sha256").update(body).digest("hex"),
        actor.id,
      ],
    );
    await db.query(
      `INSERT INTO source_import_attachments
       (source_import_id,source_document_id,attachment_role)
       VALUES (?,?,'OFFICIAL_PDF')`,
      [importId, sourceId],
    );
    return sourceId;
  }

  afterAll(async () => {
    if (!db?.isInitialized) return;
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query("SET @ylp_maintenance=1");
      if (lawIds.length) {
        const placeholders = lawIds.map(() => "?").join(",");
        await runner.query(
          `DELETE FROM audit_logs WHERE entity_type='LEGISLATION' AND entity_id IN (${placeholders})`,
          lawIds,
        );
        await runner.query(
          `DELETE FROM content_responsibilities WHERE legislation_id IN (${placeholders})`,
          lawIds,
        );
        await runner.query(
          `DELETE FROM article_versions WHERE article_id IN
           (SELECT id FROM articles WHERE legislation_id IN (${placeholders}))`,
          lawIds,
        );
        await runner.query(
          `DELETE FROM articles WHERE legislation_id IN (${placeholders})`,
          lawIds,
        );
        await runner.query(
          `UPDATE structure_nodes SET parent_id=NULL WHERE legislation_id IN (${placeholders})`,
          lawIds,
        );
        await runner.query(
          `DELETE FROM structure_nodes WHERE legislation_id IN (${placeholders})`,
          lawIds,
        );
        await runner.query(
          `DELETE FROM legislation_versions WHERE legislation_id IN (${placeholders})`,
          lawIds,
        );
      }
      if (importIds.length) {
        const placeholders = importIds.map(() => "?").join(",");
        await runner.query(
          `DELETE FROM source_imports WHERE id IN (${placeholders})`,
          importIds,
        );
      }
      if (lawIds.length) {
        const placeholders = lawIds.map(() => "?").join(",");
        await runner.query(
          `DELETE FROM legislations WHERE id IN (${placeholders})`,
          lawIds,
        );
      }
      if (sourceIds.length) {
        const placeholders = sourceIds.map(() => "?").join(",");
        await runner.query(
          `DELETE FROM source_documents WHERE id IN (${placeholders})`,
          sourceIds,
        );
      }
      await runner.query("SET @ylp_maintenance=0");
    } finally {
      await runner.release();
      await db.destroy();
    }
  });

  it("exposes a lightweight preview derived from the persisted representation", async () => {
    const importId = await createReviewedImport({
      schemaVersion: 2,
      parser: "arabic-legal-structure-v2",
      preamble: "ديباجة",
      nodes: [],
      articles: [
        {
          key: "article-0001",
          label: "1",
          number: "1",
          headingLabel: "المادة 1",
          text: "نص كامل لا ينبغي تكراره في حمولة شجرة المعاينة",
          structureNodeKey: null,
          sortKey: "000001",
          documentOrder: 1,
          status: "CONFIRMED",
        },
      ],
      issues: [],
      summary: {
        babs: 0,
        fasls: 0,
        qisms: 0,
        articles: 1,
        rootArticles: 1,
        reviewRequired: 0,
      },
    });
    const detail = (await service.detail(importId)) as Record<string, unknown>;
    const preview = detail.analysis as {
      articles: Array<Record<string, unknown>>;
    };
    expect(preview.articles[0]).not.toHaveProperty("text");
    expect(preview.articles[0]?.textExcerpt).toContain("نص كامل");
    expect(detail).not.toHaveProperty("extraction_json");
  });

  it("atomically persists hierarchy, ordering, root articles and retry idempotency", async () => {
    const importId = await createReviewedImport({
      schemaVersion: 2,
      parser: "arabic-legal-structure-v2",
      preamble: "ديباجة اختبار التكامل",
      nodes: [
        {
          key: "bab-1",
          nodeType: "TITLE",
          label: "الباب الأول",
          title: "الأحكام العامة",
          parentKey: null,
          sortKey: "000001",
        },
        {
          key: "fasl-1",
          nodeType: "CHAPTER",
          label: "الفصل الأول",
          title: "التعاريف",
          parentKey: "bab-1",
          sortKey: "000002",
        },
        {
          key: "qism-1",
          nodeType: "SECTION",
          label: "القسم الأول",
          title: "المصطلحات",
          parentKey: "fasl-1",
          sortKey: "000003",
        },
        {
          key: "bab-2",
          nodeType: "TITLE",
          label: "الباب الثاني",
          title: "الأحكام الختامية",
          parentKey: null,
          sortKey: "000006",
        },
      ],
      articles: [
        {
          number: "1",
          label: "1",
          text: "نص المادة الأولى وفيه إحالة إلى المادة 2.",
          structureNodeKey: "qism-1",
          sortKey: "000001",
        },
        {
          number: "2",
          label: "2",
          text: "نص المادة الثانية",
          structureNodeKey: "bab-2",
          sortKey: "000002",
        },
        {
          number: "2",
          label: "2",
          text: "نص تاريخي بوسم مكرر",
          structureNodeKey: null,
          sortKey: "000003",
        },
      ],
      issues: [],
      summary: {
        babs: 2,
        fasls: 1,
        qisms: 1,
        articles: 3,
        rootArticles: 1,
        reviewRequired: 0,
      },
    });
    const extractionSourceId = sourceIds.at(-1)!;
    const officialPdfId = await attachOfficialPdf(importId);
    const input = {
      titleAr: "تشريع تكامل البنية القانونية",
      officialNumber: "25",
      year: 2026,
      typeId,
      authorityId,
      effectiveFrom: "2026-01-01",
    };
    const results = await Promise.all([
      service.createDraft(importId, input, actor),
      service.createDraft(importId, input, actor),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const lawId = results[0].id;
    lawIds.push(lawId);
    expect(results.some((result) => result.idempotentReplay === true)).toBe(
      true,
    );

    const nodes = await db.query(
      `SELECT node.label_ar label,node.node_type nodeType,parent.label_ar parentLabel,node.sort_key sortKey
       FROM structure_nodes node LEFT JOIN structure_nodes parent ON parent.id=node.parent_id
       WHERE node.legislation_id=? ORDER BY node.sort_key`,
      [lawId],
    );
    expect(nodes).toEqual([
      {
        label: "الباب الأول",
        nodeType: "TITLE",
        parentLabel: null,
        sortKey: "000001",
      },
      {
        label: "الفصل الأول",
        nodeType: "CHAPTER",
        parentLabel: "الباب الأول",
        sortKey: "000002",
      },
      {
        label: "القسم الأول",
        nodeType: "SECTION",
        parentLabel: "الفصل الأول",
        sortKey: "000003",
      },
      {
        label: "الباب الثاني",
        nodeType: "TITLE",
        parentLabel: null,
        sortKey: "000006",
      },
    ]);
    const persistedArticles = await db.query(
      `SELECT a.current_label currentLabel,a.sort_key sortKey,sn.label_ar structureLabel,
              av.text_original textOriginal
       FROM articles a JOIN article_versions av ON av.article_id=a.id
       LEFT JOIN structure_nodes sn ON sn.id=a.structure_node_id
       WHERE a.legislation_id=? ORDER BY a.sort_key`,
      [lawId],
    );
    expect(persistedArticles).toEqual([
      {
        currentLabel: "1",
        sortKey: "000001",
        structureLabel: "القسم الأول",
        textOriginal: "نص المادة الأولى وفيه إحالة إلى المادة 2.",
      },
      {
        currentLabel: "2",
        sortKey: "000002",
        structureLabel: "الباب الثاني",
        textOriginal: "نص المادة الثانية",
      },
      {
        currentLabel: "2",
        sortKey: "000003",
        structureLabel: null,
        textOriginal: "نص تاريخي بوسم مكرر",
      },
    ]);
    const crossLegislation = await db.query(
      `SELECT
       (SELECT COUNT(*) FROM structure_nodes child JOIN structure_nodes parent ON parent.id=child.parent_id
        WHERE child.legislation_id=? AND parent.legislation_id<>child.legislation_id) nodeCount,
       (SELECT COUNT(*) FROM articles article JOIN structure_nodes node ON node.id=article.structure_node_id
        WHERE article.legislation_id=? AND node.legislation_id<>article.legislation_id) articleCount`,
      [lawId, lawId],
    );
    expect(Number(crossLegislation[0].nodeCount)).toBe(0);
    expect(Number(crossLegislation[0].articleCount)).toBe(0);
    expect(
      Number(
        (
          await db.query(
            "SELECT COUNT(*) count FROM audit_logs WHERE action='CREATE_DRAFT_FROM_IMPORT' AND entity_id=?",
            [lawId],
          )
        )[0].count,
      ),
    ).toBe(1);

    const sourceLinks = await db.query(
      `SELECT source_document_id sourceDocumentId,source_role sourceRole
       FROM legislation_source_documents WHERE legislation_id=?
       ORDER BY FIELD(source_role,'EXTRACTION','OFFICIAL_PDF')`,
      [lawId],
    );
    expect(sourceLinks).toEqual([
      { sourceDocumentId: extractionSourceId, sourceRole: "EXTRACTION" },
      { sourceDocumentId: officialPdfId, sourceRole: "OFFICIAL_PDF" },
    ]);
    await db.query("UPDATE legislations SET status='PUBLISHED' WHERE id=?", [
      lawId,
    ]);
    await db.query(
      "UPDATE legislation_versions SET workflow_status='PUBLISHED' WHERE legislation_id=?",
      [lawId],
    );
    await db.query(
      `UPDATE article_versions av JOIN articles a ON a.id=av.article_id
       SET av.status='PUBLISHED' WHERE a.legislation_id=?`,
      [lawId],
    );
    await expect(publicLegislations.source(lawId)).resolves.toMatchObject({
      fileName: "نسخة القانون الرسمية.pdf",
      mediaType: "application/pdf",
    });
  });

  it("rolls back the entire draft when a parsed relationship is invalid", async () => {
    const importId = await createReviewedImport({
      schemaVersion: 2,
      parser: "arabic-legal-structure-v2",
      preamble: "",
      nodes: [
        {
          key: "orphan",
          nodeType: "SECTION",
          label: "القسم الأول",
          title: "غير صالح",
          parentKey: "missing-parent",
          sortKey: "000001",
        },
      ],
      articles: [],
    });
    await expect(
      service.createDraft(
        importId,
        {
          titleAr: "مسودة يجب التراجع عنها",
          year: 2026,
          typeId,
          authorityId,
        },
        actor,
      ),
    ).rejects.toThrow("أب غير موجود");
    const rows = await db.query(
      "SELECT legislation_id legislationId FROM source_imports WHERE id=?",
      [importId],
    );
    expect(rows[0].legislationId).toBeNull();
    expect(
      Number(
        (
          await db.query(
            "SELECT COUNT(*) count FROM legislations WHERE title_ar='مسودة يجب التراجع عنها'",
          )
        )[0].count,
      ),
    ).toBe(0);
  });

  it("allows reupload when a previously imported source is soft-deleted", async () => {
    const duplicateText = "نص يمكن إعادة رفعه بعد الحذف الناعم";
    const duplicateBytes = Buffer.from(duplicateText, "utf8");
    const duplicateSourceId = randomUUID();
    const duplicateSha = createHash("sha256")
      .update(duplicateBytes)
      .digest("hex");
    sourceIds.push(duplicateSourceId);
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,is_active,created_by)
       VALUES (?,?,?,'text/plain',?,?,NOW(3),'اختبار حذف','REVIEWED',TRUE,?)`,
      [
        duplicateSourceId,
        "مكرر_محذوف.txt",
        `tests/${duplicateSourceId}.txt`,
        duplicateBytes.length,
        duplicateSha,
        actor.id,
      ],
    );
    await db.query(
      "UPDATE source_documents SET deleted_at=NOW(3), is_active=FALSE WHERE id=?",
      [duplicateSourceId],
    );

    const duplicateFile = {
      buffer: duplicateBytes,
      originalname: "مكرر_محذوف.txt",
      size: duplicateBytes.length,
      fieldname: "file",
      encoding: "7bit",
      mimetype: "text/plain",
      destination: "",
      filename: "مكرر_محذوف.txt",
      path: "/tmp/mocked-upload",
      stream: null,
    } as unknown as Express.Multer.File;

    const reupload = await service.upload(
      duplicateFile,
      "بيانات الحقل بعد الحذف",
      actor,
    );
    sourceIds.push(reupload.sourceDocumentId);
    importIds.push(reupload.id);

    const activeWithSameHash = await db.query(
      "SELECT COUNT(*) count FROM source_documents WHERE sha256=? AND deleted_at IS NULL AND is_active=TRUE",
      [duplicateSha],
    );
    expect(Number(activeWithSameHash[0].count)).toBe(1);
  });
});
