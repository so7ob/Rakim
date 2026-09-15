import { AmendmentsService } from "../amendments/amendments.service.js";
import { LifecycleService } from "./lifecycle.service.js";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { createDataSource } from "../database/config.js";
import { PERMISSION_CATALOG } from "../common/permission-catalog.js";
import { DeletionService } from "./deletion.service.js";
import { CorrectionsService } from "./corrections.service.js";
import { AdminService } from "./admin.service.js";
import { AuthorizationPolicyService } from "./authorization-policy.service.js";
import { LegislationsService } from "../legislations/legislations.service.js";
import {
  workflowPolicy,
  type WorkflowPolicyCode,
} from "./workflow-policies.js";

describe("operation policies and correction drafts on MariaDB", () => {
  let db: DataSource,
    deletion: DeletionService,
    corrections: CorrectionsService,
    admin: AdminService;
  const actorId = randomUUID(),
    lawIds: string[] = [],
    sourceIds: string[] = [],
    batches: string[] = [];
  let actor: AuthUser;
  beforeAll(async () => {
    db = await createDataSource().initialize();
    deletion = new DeletionService(db);
    corrections = new CorrectionsService(db);
    admin = new AdminService(db, new AuthorizationPolicyService(db));
    await db.query(
      "INSERT INTO users (id,username,display_name,password_hash) VALUES (?,?,?,'test-unusable-hash')",
      [actorId, `policy-${actorId}`, "مستخدم اختبار السياسات"],
    );
    actor = {
      id: actorId,
      username: `policy-${actorId}`,
      displayName: "اختبار",
      roles: [],
      permissions: PERMISSION_CATALOG.map((p) => p.code),
      policyCapabilities: [],
    };
  });
  async function grants(codes: WorkflowPolicyCode[]) {
    await db.query("DELETE FROM user_permissions WHERE user_id=?", [actorId]);
    actor.policyCapabilities = codes.map(
      (code) => workflowPolicy(code)!.permissionCode,
    );
    for (const permission of actor.policyCapabilities)
      await db.query(
        "INSERT INTO user_permissions (user_id,permission_code,granted_by,grant_reason) VALUES (?,?,?,'اختبار الاستثناء')",
        [actorId, permission, actorId],
      );
  }
  async function fixture() {
    await grants([]);
    const lawId = randomUUID(),
      sourceId = randomUUID(),
      articleId = randomUUID(),
      versionId = randomUUID(),
      lawVersionId = randomUUID();
    lawIds.push(lawId);
    sourceIds.push(sourceId);
    const [refs] = await db.query(
      "SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId",
    );
    await db.query(
      `INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,reviewed_at,created_by)
    VALUES (?,?,?,'text/plain',1,?,NOW(3),'مصدر اختبار','REVIEWED',NOW(3),?)`,
      [
        sourceId,
        `test-${sourceId}`,
        `tests/${sourceId}.txt`,
        createHash("sha256").update(sourceId).digest("hex"),
        actorId,
      ],
    );
    await db.query(
      "INSERT INTO legislations (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level,effective_from) VALUES (?,?,?,2026,'قانون اصطناعي لاختبار السياسات','PUBLISHED','IN_FORCE','A','2026-01-01')",
      [lawId, refs.typeId, refs.authorityId],
    );
    await db.query(
      "INSERT INTO legislation_versions (id,legislation_id,version_no,workflow_status,content_kind,source_document_id,valid_from,published_at,preamble_text) VALUES (?,?,1,'PUBLISHED','EXTRACTED',?,'2026-01-01',NOW(3),'ديباجة أصلية')",
      [lawVersionId, lawId, sourceId],
    );
    await db.query(
      "INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key) VALUES (?,?,'1','1','0001')",
      [articleId, lawId],
    );
    await db.query(
      "INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,status,source_document_id) VALUES (?,?,1,'نص أصلي','نص أصلي','نص اصلي','2026-01-01','PUBLISHED',?)",
      [versionId, articleId, sourceId],
    );
    return { lawId, sourceId, articleId, versionId, lawVersionId };
  }
  const deleteCodes: WorkflowPolicyCode[] = [
    "DELETE_LEGISLATION_HISTORY",
    "DELETE_LEGISLATION_VERSIONS",
    "DELETE_ARTICLE_HISTORY",
  ];
  it.each(["legislations", "imports"])(
    "retains external amendments when deleting their instrument through %s",
    async (kind) => {
      const instrument = await fixture(),
        outside = await fixture();
      const amendmentId = randomUUID(),
        operationId = randomUUID(),
        importId = randomUUID();
      await db.query(
        "INSERT INTO amendments (id,amended_legislation_id,instrument_legislation_id,title_ar,effective_from,source_document_id,status) VALUES (?,?,?,'وثيقة محفوظة على قانون آخر','2026-01-01',?,'PUBLISHED')",
        [amendmentId, outside.lawId, instrument.lawId, outside.sourceId],
      );
      await db.query(
        "INSERT INTO amendment_operations (id,amendment_id,operation_type,target_kind,target_id,effective_from,application_order,citation_text,source_document_id) VALUES (?,?,'REPEAL','ARTICLE',?,'2026-01-01',1,'استناد محفوظ',?)",
        [operationId, amendmentId, outside.articleId, outside.sourceId],
      );
      if (kind === "imports")
        await db.query(
          "INSERT INTO source_imports (id,source_document_id,legislation_id,uploaded_by,status,detected_format) VALUES (?,?,?,?,'REVIEWED','TXT')",
          [importId, instrument.sourceId, instrument.lawId, actorId],
        );
      const rootId = kind === "imports" ? importId : instrument.lawId;
      try {
        await grants(deleteCodes);
        await db.query(
          "UPDATE amendment_operations SET target_id=? WHERE id=?",
          [instrument.articleId, operationId],
        );
        expect((await deletion.impact(kind, rootId, actor)).allowed).toBe(
          false,
        );
        await db.query(
          "UPDATE amendment_operations SET target_id=? WHERE id=?",
          [outside.articleId, operationId],
        );
        await db.query(
          "INSERT INTO legislation_source_documents (legislation_id,source_document_id,source_role) VALUES (?,?,'EXTRACTION')",
          [instrument.lawId, instrument.sourceId],
        );
        await db.query(
          "UPDATE amendments SET source_document_id=? WHERE id=?",
          [instrument.sourceId, amendmentId],
        );
        const shared: any = await deletion.impact(kind, rootId, actor);
        expect(
          shared.groups.find(
            (group: any) => group.key === "imports-and-sources",
          ).blockers.length,
        ).toBeGreaterThan(0);
        if (kind === "imports") expect(shared.allowed).toBe(false);
        await db.query(
          "UPDATE amendments SET source_document_id=? WHERE id=?",
          [outside.sourceId, amendmentId],
        );
        let impact: any = await deletion.impact(kind, rootId, actor);
        expect(impact.allowed).toBe(true);
        expect(
          impact.groups.find(
            (group: any) => group.key === "retained-amendment-links",
          ).items[0].id,
        ).toBe(amendmentId);
        const missingUpdate = {
          ...actor,
          permissions: actor.permissions.filter(
            (p) => p !== "amendment.update",
          ),
        };
        expect(
          (await deletion.impact(kind, rootId, missingUpdate)).allowed,
        ).toBe(false);
        await expect(
          deletion.remove(
            kind,
            rootId,
            missingUpdate,
            "حذف بلا صلاحية فك الارتباط",
            impact.impactToken,
          ),
        ).rejects.toThrow();
        await db.query("UPDATE amendments SET revision=revision+1 WHERE id=?", [
          amendmentId,
        ]);
        await expect(
          deletion.remove(kind, rootId, actor, "أثر قديم", impact.impactToken),
        ).rejects.toThrow(/تغيرت العلاقات/);
        impact = await deletion.impact(kind, rootId, actor);
        const batch = await deletion.remove(
          kind,
          rootId,
          actor,
          "حذف السند مع حفظ التعديل",
          impact.impactToken,
        );
        batches.push(batch.batchId);
        const [document] = await db.query(
          "SELECT * FROM amendments WHERE id=?",
          [amendmentId],
        );
        expect(document.deleted_at).toBeNull();
        expect(document.status).toBe("PUBLISHED");
        expect(document.instrument_legislation_id).toBe(instrument.lawId);
        expect(
          (
            await db.query(
              "SELECT deleted_at FROM amendment_operations WHERE id=?",
              [operationId],
            )
          )[0].deleted_at,
        ).toBeNull();
        expect(
          (
            await db.query("SELECT deleted_at FROM legislations WHERE id=?", [
              outside.lawId,
            ])
          )[0].deleted_at,
        ).toBeNull();
        const detail: any = await deletion.detail(batch.batchId, actor);
        expect(
          detail.items.some(
            (item: any) =>
              item.kind === "amendments" && item.id === amendmentId,
          ),
        ).toBe(false);
        expect(
          detail.items.find(
            (item: any) => item.kind === "amendment_instrument_link",
          ).snapshot.instrumentLegislationId,
        ).toBe(instrument.lawId);
        await grants([]);
        await db.query(
          "UPDATE amendments SET instrument_legislation_id=NULL WHERE id=?",
          [amendmentId],
        );
        await expect(
          deletion.restore(batch.batchId, actor, "استعادة مع ارتباط متغير"),
        ).rejects.toThrow(/تغير ارتباط سند/);
        await db.query(
          "UPDATE amendments SET instrument_legislation_id=? WHERE id=?",
          [instrument.lawId, amendmentId],
        );
        expect(
          (await deletion.restore(batch.batchId, actor, "استعادة سند التعديل"))
            .status,
        ).toBe("RESTORED");
      } finally {
        await db.query("DELETE FROM amendments WHERE id=?", [amendmentId]);
        await db.query("DELETE FROM source_imports WHERE id=?", [importId]);
      }
    },
  );
  it("keeps external relations and shared sources blocked despite all deletion exceptions", async () => {
    const f = await fixture();
    const outside = await fixture();
    const relationId = randomUUID(),
      importId = randomUUID();
    await grants([...deleteCodes, "DELETE_REVIEWED_RELATION"]);
    try {
      await db.query(
        "INSERT INTO legal_relations (id,source_legislation_id,target_legislation_id,relation_type,review_status) VALUES (?,?,?,'REFERS_TO','REVIEWED')",
        [relationId, f.lawId, outside.lawId],
      );
      let impact: any = await deletion.impact("legislations", f.lawId, actor);
      expect(impact.policyChecks.every((check: any) => check.allowed)).toBe(
        true,
      );
      expect(impact.allowed).toBe(false);
      expect(impact.blockers.join(" ")).toContain("خارج مجموعة الحذف");
      await expect(
        deletion.remove(
          "legislations",
          f.lawId,
          actor,
          "اختبار العلاقات الخارجية",
          impact.impactToken,
        ),
      ).rejects.toThrow();
      await db.query("DELETE FROM legal_relations WHERE id=?", [relationId]);
      await db.query(
        "INSERT INTO source_imports (id,source_document_id,legislation_id,uploaded_by,status,detected_format) VALUES (?,?,?,?,'REVIEWED','TXT')",
        [importId, f.sourceId, f.lawId, actorId],
      );
      await db.query(
        "INSERT INTO legislation_source_documents (legislation_id,source_document_id,source_role) VALUES (?,?,'EXTRACTION')",
        [outside.lawId, f.sourceId],
      );
      impact = await deletion.impact("imports", importId, actor);
      expect(impact.policyChecks.every((check: any) => check.allowed)).toBe(
        true,
      );
      expect(impact.allowed).toBe(false);
      await expect(
        deletion.remove(
          "imports",
          importId,
          actor,
          "اختبار المصادر المشتركة",
          impact.impactToken,
        ),
      ).rejects.toThrow();
      expect(
        (
          await db.query("SELECT deleted_at FROM legislations WHERE id=?", [
            outside.lawId,
          ])
        )[0].deleted_at,
      ).toBeNull();
    } finally {
      await db.query("DELETE FROM legal_relations WHERE id=?", [relationId]);
      await db.query("DELETE FROM source_imports WHERE id=?", [importId]);
      await db.query(
        "DELETE FROM legislation_source_documents WHERE legislation_id=? AND source_document_id=?",
        [outside.lawId, f.sourceId],
      );
    }
  });
  it("blocks each published-history policy, allows complete exceptions, audits and restores", async () => {
    const f = await fixture();
    let impact: any = await deletion.impact("legislations", f.lawId, actor);
    expect(impact.allowed).toBe(false);
    expect(
      impact.policyChecks
        .filter((p: any) => !p.allowed)
        .map((p: any) => p.code),
    ).toEqual(deleteCodes);
    await grants([deleteCodes[0]!]);
    impact = await deletion.impact("legislations", f.lawId, actor);
    expect(impact.policyChecks.filter((p: any) => !p.allowed)).toHaveLength(2);
    await grants(deleteCodes);
    impact = await deletion.impact("legislations", f.lawId, actor);
    expect(impact.allowed).toBe(true);
    const missingPermission = {
      ...actor,
      permissions: actor.permissions.filter((p) => p !== "article.delete"),
    };
    await expect(
      deletion.remove(
        "legislations",
        f.lawId,
        missingPermission,
        "محاولة دون صلاحية",
        impact.impactToken,
      ),
    ).rejects.toThrow(/صلاحية/);
    const result = await deletion.remove(
      "legislations",
      f.lawId,
      actor,
      "حذف منشور باستثناء",
      impact.impactToken,
    );
    batches.push(result.batchId);
    const [batch] = await db.query(
      "SELECT policy_checks_json checks FROM deletion_batches WHERE id=?",
      [result.batchId],
    );
    expect(
      (typeof batch.checks === "string"
        ? JSON.parse(batch.checks)
        : batch.checks
      )
        .filter((p: any) => p.applies)
        .every((p: any) => p.result === "USER_PERMISSION_OVERRIDE"),
    ).toBe(true);
    await grants([]);
    await deletion.restore(
      result.batchId,
      actor,
      "استعادة المنشور بعد إلغاء الاستثناء",
    );
    expect(
      (
        await db.query("SELECT deleted_at FROM legislations WHERE id=?", [
          f.lawId,
        ])
      )[0].deleted_at,
    ).toBeNull();
  });
  it("rechecks removed exceptions inside the transaction and rejects stale impact", async () => {
    const f = await fixture();
    await grants(deleteCodes);
    const impact: any = await deletion.impact("legislations", f.lawId, actor);
    // Simulate revocation after authentication but before execution.
    await db.query("DELETE FROM user_permissions WHERE user_id=?", [actorId]);
    await expect(
      deletion.remove(
        "legislations",
        f.lawId,
        actor,
        "تأكيد بعد سحب الاستثناء",
        impact.impactToken,
      ),
    ).rejects.toThrow(/تغيرت/);
    expect(
      (
        await db.query("SELECT deleted_at FROM legislations WHERE id=?", [
          f.lawId,
        ])
      )[0].deleted_at,
    ).toBeNull();
  });
  it("allows global disabling but still requires deletion permission", async () => {
    const f = await fixture();
    const before = await db.query(
      "SELECT setting_key,value_json FROM platform_settings WHERE setting_key IN (?,?,?)",
      deleteCodes.map((code) => workflowPolicy(code)!.settingKey),
    );
    try {
      for (const code of deleteCodes)
        await db.query(
          "UPDATE platform_settings SET value_json='false' WHERE setting_key=?",
          [workflowPolicy(code)!.settingKey],
        );
      const impact: any = await deletion.impact("legislations", f.lawId, actor);
      expect(impact.allowed).toBe(true);
      await expect(
        deletion.remove(
          "legislations",
          f.lawId,
          { ...actor, permissions: ["legislation.view"] },
          "اختبار صلاحية",
          impact.impactToken,
        ),
      ).rejects.toThrow(/صلاحية/);
    } finally {
      for (const row of before)
        await db.query(
          "UPDATE platform_settings SET value_json=? WHERE setting_key=?",
          [row.value_json, row.setting_key],
        );
    }
  });
  it("keeps a published article unchanged until approval and publication of its correction", async () => {
    const f = await fixture();
    await expect(
      corrections.create(
        "ARTICLE",
        f.articleId,
        { text: "نص مصحح" },
        "2026-02-01",
        actor,
        "تصحيح النص",
      ),
    ).rejects.toThrow(/حماية/);
    await grants(["EDIT_ARTICLE_HISTORY"]);
    const draft = await corrections.create(
      "ARTICLE",
      f.articleId,
      { text: "نص مصحح" },
      "2026-02-01",
      actor,
      "تصحيح النص",
    );
    expect(
      (
        await db.query(
          "SELECT text_original FROM article_versions WHERE article_id=?",
          [f.articleId],
        )
      ).map((r: any) => r.text_original),
    ).toEqual(["نص أصلي"]);
    await expect(
      corrections.transition(
        draft.correctionId,
        "publish",
        actor,
        "نشر قبل الاعتماد",
      ),
    ).rejects.toThrow(/حالة/);
    await expect(
      corrections.transition(
        draft.correctionId,
        "approve",
        actor,
        "اعتماد نفس المحرر",
      ),
    ).rejects.toThrow();
    await grants(["LEGISLATION_SELF_APPROVAL", "LEGISLATION_SELF_PUBLICATION"]);
    await corrections.transition(
      draft.correctionId,
      "approve",
      actor,
      "اعتماد التصحيح باستثناء",
    );
    await corrections.transition(
      draft.correctionId,
      "publish",
      actor,
      "نشر التصحيح المعتمد",
    );
    const versions = await db.query(
      "SELECT text_original,DATE_FORMAT(valid_from,'%Y-%m-%d') start,DATE_FORMAT(valid_to,'%Y-%m-%d') end FROM article_versions WHERE article_id=? ORDER BY version_no",
      [f.articleId],
    );
    expect(versions).toEqual([
      { text_original: "نص أصلي", start: "2026-01-01", end: "2026-02-01" },
      { text_original: "نص مصحح", start: "2026-02-01", end: null },
    ]);
  });
  it("rejects overlapping dates, unsupported fields, missing permissions, and stale correction bases", async () => {
    const f = await fixture();
    await grants(["EDIT_ARTICLE_HISTORY", "LEGISLATION_SELF_APPROVAL"]);
    await expect(
      corrections.create(
        "ARTICLE",
        f.articleId,
        { text: "تصحيح" },
        "2026-01-01",
        actor,
        "تاريخ متداخل",
      ),
    ).rejects.toThrow(/تاريخ/);
    await expect(
      corrections.create(
        "ARTICLE",
        f.articleId,
        { text: "تصحيح", status: "PUBLISHED" },
        "2026-02-01",
        actor,
        "حقول غير مسموحة",
      ),
    ).rejects.toThrow(/حقول/);
    await expect(
      corrections.create(
        "ARTICLE",
        f.articleId,
        { text: "تصحيح" },
        "2026-02-01",
        { ...actor, permissions: ["legislation.view"] },
        "صلاحية مفقودة",
      ),
    ).rejects.toThrow(/صلاحية/);
    const draft = await corrections.create(
      "ARTICLE",
      f.articleId,
      { text: "تصحيح" },
      "2026-02-01",
      actor,
      "تصحيح للاختبار",
    );
    await db.query("UPDATE articles SET current_label='2' WHERE id=?", [
      f.articleId,
    ]);
    await expect(
      corrections.transition(
        draft.correctionId,
        "approve",
        actor,
        "محاولة اعتماد قديمة",
      ),
    ).rejects.toThrow(/تغير الأصل/);
    await corrections.transition(
      draft.correctionId,
      "cancel",
      actor,
      "إلغاء المسودة القديمة",
    );
  });
  it("creates and publishes preamble and annex corrections without overwriting original content", async () => {
    const f = await fixture();
    await grants([
      "EDIT_LEGISLATION_HISTORY",
      "EDIT_ANNEX_HISTORY",
      "LEGISLATION_SELF_APPROVAL",
      "LEGISLATION_SELF_PUBLICATION",
    ]);
    const draft = await corrections.create(
      "LEGISLATION",
      f.lawId,
      { preambleText: "ديباجة مصححة" },
      "2026-02-01",
      actor,
      "تصحيح الديباجة",
    );
    await corrections.transition(
      draft.correctionId,
      "approve",
      actor,
      "اعتماد الديباجة",
    );
    await corrections.transition(
      draft.correctionId,
      "publish",
      actor,
      "نشر الديباجة",
    );
    expect(
      (
        await db.query(
          "SELECT preamble_text FROM legislation_versions WHERE legislation_id=? ORDER BY version_no",
          [f.lawId],
        )
      ).map((r: any) => r.preamble_text),
    ).toEqual(["ديباجة أصلية", "ديباجة مصححة"]);
    const annexId = randomUUID();
    await db.query(
      "INSERT INTO legislation_source_documents (legislation_id,source_document_id,source_role) VALUES (?,?,'SUPPORTING')",
      [f.lawId, f.sourceId],
    );
    await db.query(
      "INSERT INTO annexes (id,legislation_id,annex_type,title_ar,status) VALUES (?,?,'ANNEX','عنوان أصلي','PUBLISHED')",
      [annexId, f.lawId],
    );
    await db.query(
      "INSERT INTO annex_versions (id,annex_id,version_no,valid_from,source_document_id,content_format,text_content) VALUES (?,?,1,'2026-01-01',?,'TEXT','محتوى أصلي')",
      [randomUUID(), annexId, f.sourceId],
    );
    const annexDraft = await corrections.create(
      "ANNEX",
      annexId,
      {
        titleAr: "عنوان مصحح",
        annexType: "TABLE",
        contentFormat: "STRUCTURED_TABLE",
        textContent: null,
        structuredTable: {
          columns: ["الفئة", "النصاب"],
          rows: [["الإبل", 5]],
        },
        sourceDocumentId: f.sourceId,
      },
      "2026-02-01",
      actor,
      "تصحيح الملحق",
    );
    expect(
      (await db.query("SELECT title_ar FROM annexes WHERE id=?", [annexId]))[0]
        .title_ar,
    ).toBe("عنوان أصلي");
    expect(
      (
        await db.query(
          "SELECT content_format,text_content FROM annex_versions WHERE annex_id=? ORDER BY version_no DESC LIMIT 1",
          [annexId],
        )
      )[0],
    ).toMatchObject({
      content_format: "TEXT",
      text_content: "محتوى أصلي",
    });
    await corrections.transition(
      annexDraft.correctionId,
      "approve",
      actor,
      "اعتماد الملحق",
    );
    await corrections.transition(
      annexDraft.correctionId,
      "publish",
      actor,
      "نشر الملحق",
    );
    expect(
      (await corrections.list(f.lawId, actor)).find(
        (r: any) => r.id === annexDraft.correctionId,
      ).before.titleAr,
    ).toBe("عنوان أصلي");
    expect(
      (
        await db.query(
          "SELECT content_format,text_content,structured_table_json FROM annex_versions WHERE annex_id=? ORDER BY version_no DESC LIMIT 1",
          [annexId],
        )
      )[0],
    ).toMatchObject({
      content_format: "STRUCTURED_TABLE",
      text_content: null,
      structured_table_json: {
        columns: ["الفئة", "النصاب"],
        rows: [["الإبل", 5]],
      },
    });
    expect(
      (await new LegislationsService(db).annexes(f.lawId))[0],
    ).toMatchObject({
      annexTypeLabel: "جدول",
      contentFormat: "STRUCTURED_TABLE",
      fileId: null,
      structuredTable: {
        columns: ["الفئة", "النصاب"],
        rows: [["الإبل", 5]],
      },
      sourceId: f.sourceId,
    });
  });
  it("enforces publication order as a policy while preserving target permissions", async () => {
    const f = await fixture();
    await db.query("UPDATE legislations SET status='DRAFT' WHERE id=?", [
      f.lawId,
    ]);
    await db.query(
      "UPDATE legislation_versions SET workflow_status='DRAFT',published_at=NULL WHERE id=?",
      [f.lawVersionId],
    );
    await expect(
      admin.transition(f.lawId, "PUBLISHED", actor, "نشر مباشر"),
    ).rejects.toThrow(/ترتيب/);
    await grants(["LEGISLATION_WORKFLOW_ORDER"]);
    await expect(
      admin.transition(
        f.lawId,
        "PUBLISHED",
        { ...actor, permissions: ["legislation.update"] },
        "نشر دون صلاحية",
      ),
    ).rejects.toThrow();
    expect(
      (
        await admin.transition(
          f.lawId,
          "PUBLISHED",
          actor,
          "نشر باستثناء الترتيب",
        )
      ).to,
    ).toBe("PUBLISHED");
  });
  it("clones a published amendment and preserves the already applied document", async () => {
    const f = await fixture();
    const amendments = new AmendmentsService(db);
    await grants([
      "AMENDMENT_SELF_REVIEW",
      "AMENDMENT_SELF_PUBLICATION",
      "EDIT_AMENDMENT_REVIEWED",
    ]);
    const input = {
      legislationId: f.lawId,
      titleAr: "وثيقة تصحيح اصطناعية",
      effectiveFrom: "2026-02-01",
      sourceDocumentId: f.sourceId,
      operations: [
        {
          articleId: f.articleId,
          operationType: "CORRECT" as const,
          citationText: "استناد اصطناعي للاختبار",
          newText: "تصحيح أول",
        },
      ],
    };
    const original = await amendments.create(input, actor);
    await amendments.review(original.id, actor, "مراجعة الوثيقة");
    await amendments.publish(original.id, actor, "نشر الوثيقة");
    const originalDetail = await amendments.detail(original.id);
    const copy = await amendments.update(
      original.id,
      {
        ...input,
        revision: Number(originalDetail.revision),
        effectiveFrom: "2026-03-01",
        operations: [{ ...input.operations[0]!, newText: "تصحيح ثان" }],
      },
      actor,
      "إنشاء نسخة تصحيح جديدة",
    );
    expect(copy.id).not.toBe(original.id);
    expect((await amendments.detail(original.id)).status).toBe("PUBLISHED");
    expect((await amendments.detail(copy.id)).status).toBe("DRAFT");
    expect(
      (
        await db.query(
          "SELECT text_original FROM article_versions WHERE article_id=? ORDER BY version_no DESC LIMIT 1",
          [f.articleId],
        )
      )[0].text_original,
    ).toBe("تصحيح أول");
  });

  it("keeps source review and inactive-parent restrictions configurable", async () => {
    const f = await fixture();
    const lifecycle = new LifecycleService(
      db,
      new AuthorizationPolicyService(db),
    );
    await db.query("UPDATE legislations SET is_active=FALSE WHERE id=?", [
      f.lawId,
    ]);
    await db.query("UPDATE articles SET is_active=FALSE WHERE id=?", [
      f.articleId,
    ]);
    await expect(
      lifecycle.change("articles", f.articleId, "enable", actor, "تفعيل تابع"),
    ).rejects.toThrow(/الأب/);
    await grants(["ACTIVE_PARENT"]);
    await lifecycle.change(
      "articles",
      f.articleId,
      "enable",
      actor,
      "تفعيل باستثناء الأصل",
    );
    await db.query(
      "UPDATE legislations SET status='APPROVED_FOR_PUBLISHING',is_active=TRUE WHERE id=?",
      [f.lawId],
    );
    await db.query(
      "UPDATE source_documents SET extraction_status='EXTRACTED',reviewed_at=NULL WHERE id=?",
      [f.sourceId],
    );
    await expect(
      admin.transition(f.lawId, "PUBLISHED", actor, "نشر بمصدر غير مراجع"),
    ).rejects.toThrow(/مراجعة المصدر/);
    await grants(["LEGISLATION_REVIEWED_SOURCE"]);
    expect(
      (
        await admin.transition(
          f.lawId,
          "PUBLISHED",
          actor,
          "نشر باستثناء مراجعة المصدر",
        )
      ).to,
    ).toBe("PUBLISHED");
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await q.query("SET @ylp_maintenance=1");
      for (const lawId of lawIds) {
        await q.query(
          "DELETE FROM previous_text_snapshots WHERE modification_id IN (SELECT id FROM article_modifications WHERE article_id IN (SELECT id FROM articles WHERE legislation_id=?))",
          [lawId],
        );
        await q.query(
          "DELETE FROM article_modifications WHERE article_id IN (SELECT id FROM articles WHERE legislation_id=?)",
          [lawId],
        );
        await q.query("DELETE FROM amendments WHERE amended_legislation_id=?", [
          lawId,
        ]);

        await q.query(
          "DELETE FROM content_corrections WHERE legislation_id=?",
          [lawId],
        );
        await q.query(
          "UPDATE article_versions SET previous_version_id=NULL WHERE article_id IN (SELECT id FROM articles WHERE legislation_id=?)",
          [lawId],
        );
        await q.query(
          "DELETE FROM article_versions WHERE article_id IN (SELECT id FROM articles WHERE legislation_id=?)",
          [lawId],
        );
        await q.query(
          "UPDATE annex_versions SET previous_version_id=NULL WHERE annex_id IN (SELECT id FROM annexes WHERE legislation_id=?)",
          [lawId],
        );
        await q.query(
          "DELETE FROM annex_versions WHERE annex_id IN (SELECT id FROM annexes WHERE legislation_id=?)",
          [lawId],
        );
        await q.query("DELETE FROM annexes WHERE legislation_id=?", [lawId]);
        await q.query(
          "UPDATE legislation_versions SET previous_version_id=NULL WHERE legislation_id=?",
          [lawId],
        );
        await q.query(
          "DELETE FROM legislation_versions WHERE legislation_id=?",
          [lawId],
        );
        await q.query("DELETE FROM workflow_events WHERE legislation_id=?", [
          lawId,
        ]);
        await q.query(
          "DELETE FROM content_responsibilities WHERE legislation_id=?",
          [lawId],
        );
        await q.query(
          "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
          [lawId],
        );
        await q.query("DELETE FROM legislations WHERE id=?", [lawId]);
      }
      for (const id of batches) {
        await q.query(
          "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.deletionBatchId'))=?",
          [id],
        );
        await q.query("DELETE FROM deletion_batches WHERE id=?", [id]);
      }
      for (const id of sourceIds)
        await q.query("DELETE FROM source_documents WHERE id=?", [id]);
      await q.query("DELETE FROM user_permissions WHERE user_id=?", [actorId]);
      await q.query("DELETE FROM audit_logs WHERE actor_id=?", [actorId]);
      await q.query("DELETE FROM users WHERE id=?", [actorId]);
    } finally {
      await q.query("SET @ylp_maintenance=0");
      await q.release();
      await db.destroy();
    }
  });
});
