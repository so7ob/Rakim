import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { createDataSource } from "../database/config.js";
import { LegislationsService } from "../legislations/legislations.service.js";
import { AdminService } from "./admin.service.js";
import type { AuthorizationPolicyService } from "./authorization-policy.service.js";

describe("legislation publication article versions", () => {
  let db: DataSource;
  let admin: AdminService;
  let publicLegislations: LegislationsService;
  let publisher: AuthUser;
  const sourceId = randomUUID();
  const legislationId = randomUUID();
  const legislationVersionId = randomUUID();
  const articleIds = Array.from({ length: 52 }, () => randomUUID());

  beforeAll(async () => {
    db = await createDataSource().initialize();
    admin = new AdminService(db, {} as AuthorizationPolicyService);
    publicLegislations = new LegislationsService(db);
    const refs = await db.query(
      `SELECT
       (SELECT id FROM legislation_types LIMIT 1) typeId,
       (SELECT id FROM authorities LIMIT 1) authorityId,
       (SELECT id FROM users ORDER BY username LIMIT 1) userId`,
    );
    publisher = {
      id: refs[0].userId,
      username: "publication_test_publisher",
      displayName: "ناشر اختبار",
      roles: [],
      permissions: ["legislation.publish"],
    };
    const marker = randomUUID();
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
        obtained_from,extraction_status,reviewed_at,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار نشر المواد','REVIEWED',NOW(3),?)`,
      [
        sourceId,
        `${marker}.txt`,
        `tests/${marker}.txt`,
        createHash("sha256").update(marker).digest("hex"),
        publisher.id,
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
        "تشريع اصطناعي لاختبار نشر نسخ المواد",
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
      await db.query(
        `INSERT INTO articles
         (id,legislation_id,published_label,current_label,sort_key)
         VALUES (?,?,?,?,?)`,
        [articleId, legislationId, label, label, label.padStart(6, "0")],
      );
      const text = `نص اصطناعي للمادة ${label}.`;
      await db.query(
        `INSERT INTO article_versions
         (id,article_id,version_no,text_original,text_structured,text_normalized,
          valid_from,status,source_document_id)
         VALUES (?,?,1,?,?,?,'2026-01-01','DRAFT',?)`,
        [randomUUID(), articleId, text, text, text, sourceId],
      );
    }
  });

  beforeEach(async () => {
    await db.query(
      "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
      [legislationId],
    );
    await db.query(
      "DELETE FROM content_responsibilities WHERE legislation_id=?",
      [legislationId],
    );
    await db.query("DELETE FROM workflow_events WHERE legislation_id=?", [
      legislationId,
    ]);
    await db.query(
      "UPDATE legislations SET status='APPROVED_FOR_PUBLISHING' WHERE id=?",
      [legislationId],
    );
    await db.query(
      "UPDATE legislation_versions SET workflow_status='APPROVED_FOR_PUBLISHING',published_at=NULL WHERE id=?",
      [legislationVersionId],
    );
    await db.query(
      `UPDATE article_versions SET status='DRAFT',verified_at=NULL
       WHERE article_id IN (${articleIds.map(() => "?").join(",")})`,
      articleIds,
    );
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query("SET @ylp_maintenance=1");
      await runner.query(
        "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
        [legislationId],
      );
      await runner.query("DELETE FROM audit_logs WHERE entity_id=?", [
        legislationId,
      ]);
      await runner.query(
        "DELETE FROM content_responsibilities WHERE legislation_id=?",
        [legislationId],
      );
      await runner.query("DELETE FROM workflow_events WHERE legislation_id=?", [
        legislationId,
      ]);
      await runner.query(
        `DELETE FROM article_versions WHERE article_id IN (${articleIds.map(() => "?").join(",")})`,
        articleIds,
      );
      await runner.query("DELETE FROM articles WHERE legislation_id=?", [
        legislationId,
      ]);
      await runner.query("DELETE FROM legislation_versions WHERE id=?", [
        legislationVersionId,
      ]);
      await runner.query("DELETE FROM legislations WHERE id=?", [
        legislationId,
      ]);
      await runner.query("DELETE FROM source_documents WHERE id=?", [sourceId]);
      await runner.query("SET @ylp_maintenance=0");
    } finally {
      await runner.release();
      await db.destroy();
    }
  });

  it("publishes every current draft article version with the legislation", async () => {
    const result = await admin.transition(
      legislationId,
      "PUBLISHED",
      publisher,
      "نشر التشريع ونسخ مواده معًا",
    );
    expect(result).toMatchObject({
      from: "APPROVED_FOR_PUBLISHING",
      to: "PUBLISHED",
      publishedArticleCount: 52,
    });

    const statusRows = await db.query(
      `SELECT av.status,COUNT(*) count,COUNT(av.verified_at) verifiedCount
       FROM article_versions av JOIN articles a ON a.id=av.article_id
       WHERE a.legislation_id=? GROUP BY av.status`,
      [legislationId],
    );
    expect(statusRows).toEqual([
      { status: "PUBLISHED", count: "52", verifiedCount: "52" },
    ]);
    const publicArticles = await publicLegislations.articles(legislationId);
    expect(publicArticles.items).toHaveLength(52);

    const audits = await db.query(
      "SELECT after_json afterJson FROM audit_logs WHERE entity_id=? AND action='PUBLISH'",
      [legislationId],
    );
    const after =
      typeof audits[0].afterJson === "string"
        ? JSON.parse(audits[0].afterJson)
        : audits[0].afterJson;
    expect(after.publishedArticleCount).toBe(52);
  });

  it("rolls back the law and all article statuses when publication fails later", async () => {
    await expect(
      admin.transition(
        legislationId,
        "PUBLISHED",
        { ...publisher, id: randomUUID() },
        "اختبار rollback بعد تحديث المواد",
      ),
    ).rejects.toBeTruthy();

    const laws = await db.query("SELECT status FROM legislations WHERE id=?", [
      legislationId,
    ]);
    const articleStatuses = await db.query(
      `SELECT av.status,COUNT(*) count FROM article_versions av
       JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?
       GROUP BY av.status`,
      [legislationId],
    );
    expect(laws[0].status).toBe("APPROVED_FOR_PUBLISHING");
    expect(articleStatuses).toEqual([{ status: "DRAFT", count: "52" }]);
  });
});
