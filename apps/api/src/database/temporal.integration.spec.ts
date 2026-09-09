import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { AmendmentsService } from "../amendments/amendments.service.js";
import {
  TemporalConflictError,
  TemporalVersionService,
} from "../articles/temporal-version.service.js";
import { LegislationsService } from "../legislations/legislations.service.js";
import { createDataSource } from "./config.js";

describe("MariaDB temporal integrity", () => {
  let db: DataSource;
  let lawId: string;
  let articleId: string;
  let sourceId: string;
  let auditedLawId: string | null = null;
  let amendmentId: string | null = null;
  beforeAll(async () => {
    db = await createDataSource().initialize();
    const refs = await db.query(
      'SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId,(SELECT id FROM source_documents WHERE extraction_status="REVIEWED" LIMIT 1) sourceId',
    );
    sourceId = refs[0].sourceId;
    lawId = randomUUID();
    articleId = randomUUID();
    await db.query(
      `INSERT INTO legislations (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
      VALUES (?,?,?,2026,'تشريع مؤقت لاختبار التزامن','DRAFT','UNKNOWN','D')`,
      [lawId, refs[0].typeId, refs[0].authorityId],
    );
    await db.query(
      `INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key) VALUES (?,?,'1','1','00001')`,
      [articleId, lawId],
    );
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        await runner.query("SET @ylp_maintenance=1");
        if (amendmentId) {
          await runner.query(
            "DELETE FROM previous_text_snapshots WHERE modification_id IN (SELECT id FROM article_modifications WHERE article_id=?)",
            [articleId],
          );
          await runner.query(
            "DELETE FROM article_modifications WHERE article_id=?",
            [articleId],
          );
          await runner.query("DELETE FROM amendments WHERE id=?", [
            amendmentId,
          ]);
        }
        await runner.query(
          "DELETE FROM search_documents WHERE legislation_id=?",
          [lawId],
        );
        await runner.query("DELETE FROM job_queue WHERE payload_json LIKE ?", [
          `%${lawId}%`,
        ]);
        await runner.query(
          "DELETE FROM content_responsibilities WHERE legislation_id=?",
          [lawId],
        );
        await runner.query(
          "DELETE FROM audit_logs WHERE entity_id IN (?,?,?)",
          [lawId, articleId, amendmentId ?? ""],
        );
        await runner.query(
          "UPDATE article_versions SET previous_version_id=NULL WHERE article_id=?",
          [articleId],
        );
        await runner.query("DELETE FROM article_versions WHERE article_id=?", [
          articleId,
        ]);
        await runner.query("DELETE FROM articles WHERE id=?", [articleId]);
        await runner.query("DELETE FROM legislations WHERE id=?", [lawId]);
        if (auditedLawId) {
          await runner.query(
            "DELETE FROM audit_logs WHERE entity_type='LEGISLATION' AND entity_id=?",
            [auditedLawId],
          );
          await runner.query("DELETE FROM legislations WHERE id=?", [
            auditedLawId,
          ]);
        }
      } finally {
        await runner.release();
      }
      await db.destroy();
    }
  });

  it("serializes concurrent writes and accepts only one overlapping interval", async () => {
    const service = new TemporalVersionService(db);
    const input = {
      articleId,
      textOriginal: "نسخة اختبار التزامن",
      validFrom: "2026-01-01",
      validTo: "2027-01-01",
      sourceDocumentId: sourceId,
    };
    const results = await Promise.allSettled([
      service.create(input),
      service.create({ ...input, textOriginal: "نسخة متعارضة" }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = results.find(
      (item) => item.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(TemporalConflictError);
  });

  it("rejects changing the legal text of a published version", async () => {
    const versionId = (
      await db.query(
        "SELECT id FROM article_versions WHERE status='PUBLISHED' LIMIT 1",
      )
    )[0].id;
    await expect(
      db.query(
        "UPDATE article_versions SET text_original='تغيير صامت' WHERE id=?",
        [versionId],
      ),
    ).rejects.toThrow(/PUBLISHED_ARTICLE_VERSION_IMMUTABLE/);
  });

  it("rejects deleting a published historical version", async () => {
    const versionId = (
      await db.query(
        "SELECT id FROM article_versions WHERE status='PUBLISHED' LIMIT 1",
      )
    )[0].id;
    await expect(
      db.query("DELETE FROM article_versions WHERE id=?", [versionId]),
    ).rejects.toThrow(/PUBLISHED_ARTICLE_VERSION_DELETE_FORBIDDEN/);
  });

  it("creates an authorized draft with an immutable audit event", async () => {
    const refs =
      await db.query(`SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,
      (SELECT id FROM authorities LIMIT 1) authorityId,(SELECT id FROM users WHERE username='data_entry') actorId`);
    const created = await new LegislationsService(db).create(
      {
        titleAr: "مسودة تكامل مدققة",
        typeId: refs[0].typeId,
        authorityId: refs[0].authorityId,
        year: 2026,
      },
      {
        id: refs[0].actorId,
        username: "data_entry",
        displayName: "مدخل",
        roles: ["DATA_ENTRY"],
        permissions: ["legislation.create"],
      },
    );
    auditedLawId = created.id;
    const logs = await db.query(
      "SELECT action,reason FROM audit_logs WHERE entity_type='LEGISLATION' AND entity_id=?",
      [created.id],
    );
    expect(logs).toMatchObject([
      { action: "CREATE_DRAFT", reason: "إنشاء مسودة عبر API" },
    ]);
  });

  it("applies a reviewed amendment as a new version without overwriting history", async () => {
    const users = await db.query(
      "SELECT username,id FROM users WHERE username IN ('data_entry','legal_reviewer','content_manager')",
    );
    const userId = (name: string) =>
      users.find((user: { username: string }) => user.username === name).id;
    await db.query("UPDATE legislations SET status='PUBLISHED' WHERE id=?", [
      lawId,
    ]);
    await db.query(
      "UPDATE article_versions SET status='PUBLISHED' WHERE article_id=?",
      [articleId],
    );
    const service = new AmendmentsService(db);
    const draft = await service.create(
      {
        articleId,
        sourceDocumentId: sourceId,
        titleAr: "تعديل تكامل زمني",
        issueDate: "2026-05-20",
        effectiveFrom: "2026-06-01",
        operationType: "REPLACE",
        citationText: "استبدال النص وفق مصدر الاختبار",
        newText: "نسخة جديدة لا تمحو النسخة السابقة",
      },
      {
        id: userId("data_entry"),
        username: "data_entry",
        displayName: "مدخل",
        roles: ["DATA_ENTRY"],
        permissions: ["amendment.create"],
      },
    );
    amendmentId = draft.id;
    await service.review(
      draft.id,
      {
        id: userId("legal_reviewer"),
        username: "legal_reviewer",
        displayName: "مراجع",
        roles: ["LEGAL_REVIEWER"],
        permissions: ["amendment.review"],
      },
      "مراجعة قانونية مستقلة",
    );
    await service.publish(
      draft.id,
      {
        id: userId("content_manager"),
        username: "content_manager",
        displayName: "مدير محتوى",
        roles: ["CONTENT_MANAGER"],
        permissions: ["amendment.publish"],
      },
      "نشر بعد اكتمال المراجعة",
    );
    const versions = await db.query(
      "SELECT text_original textOriginal,DATE_FORMAT(valid_to,'%Y-%m-%d') validTo FROM article_versions WHERE article_id=? ORDER BY version_no",
      [articleId],
    );
    expect(versions).toHaveLength(2);
    expect(versions[0].validTo).toBe("2026-06-01");
    expect(versions[1].textOriginal).toBe("نسخة جديدة لا تمحو النسخة السابقة");
  });
});
