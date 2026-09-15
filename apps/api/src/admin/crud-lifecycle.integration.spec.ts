import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { createDataSource } from "../database/config.js";
import { PERMISSION_CATALOG } from "../common/permission-catalog.js";
import { CRUD_PERMISSION_CATALOG } from "../common/crud-permission-catalog.js";
import { LifecycleService } from "./lifecycle.service.js";
import { AuthorizationPolicyService } from "./authorization-policy.service.js";
import { AdminService } from "./admin.service.js";
import { LegislationsService } from "../legislations/legislations.service.js";
import { AmendmentsService } from "../amendments/amendments.service.js";
import { ImportsService } from "../imports/imports.service.js";
import { SiteService } from "../site/site.service.js";
import { UserToolsService } from "../users/user-tools.service.js";
import { MariaDbSearchProvider } from "../search/mariadb-search.provider.js";

// All changed records belong to this fixture. Existing roles/grants are never changed.
describe("complete administrative lifecycle on MariaDB", () => {
  let db: DataSource,
    lifecycle: LifecycleService,
    admin: AdminService,
    publicLaws: LegislationsService,
    amendments: AmendmentsService,
    site: SiteService,
    personal: UserToolsService;
  let actor: AuthUser,
    reviewer: AuthUser,
    publisher: AuthUser,
    typeId: string,
    authorityId: string;
  const laws: string[] = [],
    refs: string[] = [],
    pages: string[] = [],
    navs: string[] = [],
    gazettes: string[] = [],
    bundles: string[] = [],
    extraSources: string[] = [],
    synonyms: string[] = [],
    accounts: string[] = [],
    users: string[] = [],
    documents: string[] = [];
  const sourceId = randomUUID(),
    marker = randomUUID();
  const all = PERMISSION_CATALOG.map((p) => p.code);
  beforeAll(async () => {
    db = await createDataSource().initialize();
    const policy = new AuthorizationPolicyService(db);
    lifecycle = new LifecycleService(db, policy);
    admin = new AdminService(db, policy);
    publicLaws = new LegislationsService(db);
    amendments = new AmendmentsService(db);
    site = new SiteService(db);
    personal = new UserToolsService(db);
    const [base] = await db.query(
      "SELECT (SELECT id FROM users WHERE username='super') actorId,(SELECT id FROM users WHERE username='legal_reviewer') reviewerId,(SELECT id FROM users WHERE username='content_manager') publisherId,(SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId",
    );
    typeId = base.typeId;
    authorityId = base.authorityId;
    actor = {
      id: base.actorId,
      username: "fixture",
      displayName: "اختبار",
      roles: [],
      permissions: all,
    };
    reviewer = { ...actor, id: base.reviewerId };
    publisher = { ...actor, id: base.publisherId };
    await db.query(
      "INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,reviewed_at,created_by) VALUES (?,?,?,'text/plain',1,?,NOW(3),'مصدر اصطناعي','REVIEWED',NOW(3),?)",
      [
        sourceId,
        marker + ".txt",
        "tests/" + marker,
        createHash("sha256").update(marker).digest("hex"),
        actor.id,
      ],
    );
  });
  async function law(title: string = marker + "-" + laws.length) {
    const result = await publicLaws.create(
      { titleAr: title, typeId, authorityId, year: 2026 },
      actor,
    );
    laws.push(result.id);
    return result.id;
  }
  async function article(
    id: string,
    label: string,
    text = "النص الأصلي والعبارة القديمة",
  ) {
    return admin.createArticle(
      id,
      {
        currentLabel: label,
        sortKey: label.padStart(6, "0"),
        sourceDocumentId: sourceId,
        validFrom: "2026-01-01",
        text,
        reason: "إنشاء مادة اصطناعية للاختبار",
      },
      actor,
    );
  }
  async function published(id: string) {
    await db.query(
      "UPDATE legislations SET status='PUBLISHED',legal_status='IN_FORCE',effective_from='2026-01-01' WHERE id=?",
      [id],
    );
    await db.query(
      "UPDATE article_versions av JOIN articles a ON a.id=av.article_id SET av.status='PUBLISHED' WHERE a.legislation_id=?",
      [id],
    );
    await db.query(
      "UPDATE legislation_versions SET workflow_status='PUBLISHED',published_at=NOW(3) WHERE legislation_id=?",
      [id],
    );
  }
  it("keeps stored baseline grants unchanged; SUPER inheritance is resolved at runtime", async () => {
    const codes = CRUD_PERMISSION_CATALOG.map((p) => p.code);
    const grants = await db.query(
      `SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.is_system=TRUE AND rp.permission_code IN (${codes.map(() => "?").join(",")})`,
      codes,
    );
    expect(grants).toEqual([]);
  });
  it("persists reference edits, prevents duplicates and cycles, blocks linked deletion, allows disable/enable", async () => {
    const result = await admin.createReference(
      "subjects",
      {
        code: "T_" + marker.slice(0, 8),
        nameAr: "موضوع اختبار",
        isActive: true,
      },
      actor,
      "إضافة اختبار",
    );
    refs.push(result.id);
    await admin.updateReference(
      "subjects",
      result.id,
      {
        code: "T_" + marker.slice(0, 8),
        nameAr: "موضوع بعد التعديل",
        editRevision: 1,
        isActive: true,
      },
      actor,
      "تعديل اختبار",
    );
    expect(
      (await admin.referenceData()).subjects.find(
        (r: { id: string }) => r.id === result.id,
      ).nameAr,
    ).toBe("موضوع بعد التعديل");
    await expect(
      admin.createReference(
        "subjects",
        { code: "T_" + marker.slice(0, 8), nameAr: "مكرر", isActive: true },
        actor,
        "تكرار اختبار",
      ),
    ).rejects.toThrow();
    const child = await admin.createReference(
      "subjects",
      {
        code: "C_" + marker.slice(0, 8),
        nameAr: "تابع اختبار",
        isActive: true,
        parentId: result.id,
      },
      actor,
      "إضافة تابع",
    );
    refs.push(child.id);
    await expect(
      admin.updateReference(
        "subjects",
        result.id,
        {
          code: "T_" + marker.slice(0, 8),
          nameAr: "دورة",
          editRevision: 2,
          isActive: true,
          parentId: child.id,
        },
        actor,
        "منع دورة",
      ),
    ).rejects.toThrow(/دورة/);
    await expect(
      lifecycle.change("subjects", result.id, "delete", actor, "حذف مرتبط"),
    ).rejects.toThrow(/علاقات/);
    await lifecycle.change(
      "subjects",
      child.id,
      "disable",
      actor,
      "تعطيل تابع",
    );
    await lifecycle.change(
      "subjects",
      result.id,
      "disable",
      actor,
      "تعطيل موضوع",
    );
    expect(
      (await admin.references()).subjects.some(
        (r: { id: string }) => r.id === result.id,
      ),
    ).toBe(false);
    expect(
      (await admin.referenceData()).subjects.find(
        (r: { id: string }) => r.id === result.id,
      ).isActive,
    ).toBe(0);
    await expect(
      lifecycle.change("subjects", child.id, "enable", actor, "تفعيل تابع"),
    ).rejects.toThrow(/الأب/);
    await lifecycle.change(
      "subjects",
      result.id,
      "enable",
      actor,
      "إعادة تفعيل",
    );
    await lifecycle.change("subjects", child.id, "enable", actor, "إعادة تابع");
    await lifecycle.change(
      "subjects",
      child.id,
      "delete",
      actor,
      "حذف تابع مستقل",
    );
  });
  it("adds, edits and soft deletes draft articles, preserves repeated labels and blocks published deletion", async () => {
    const id = await law(marker + " draft");
    const a = await article(id, "1"),
      b = await admin.createArticle(
        id,
        {
          currentLabel: "1",
          sortKey: "000002",
          sourceDocumentId: sourceId,
          validFrom: "2026-01-01",
          text: "نص مكرر الرقم مستقل",
          reason: "ترقيم قانوني مكرر",
        },
        actor,
      );
    expect((await admin.legislation(id, true)).articles).toHaveLength(2);
    await expect(
      admin.updateDraftArticleMetadata(
        b.id,
        {
          currentLabel: "1",
          publishedLabel: "1",
          sortKey: "000001",
          validFrom: "2026-01-01",
          text: "مكرر الموقع",
        },
        actor,
        "ترتيب متعارض",
      ),
    ).rejects.toThrow(/مفتاح ترتيب/);

    await admin.updateDraftArticle(
      a.id,
      "نص محفوظ بعد التعديل",
      actor,
      "تصحيح مادة",
    );
    expect(
      (await admin.legislation(id, true)).articles.find(
        (r: { id: string }) => r.id === a.id,
      ).textOriginal,
    ).toBe("نص محفوظ بعد التعديل");
    await lifecycle.change("articles", b.id, "disable", actor, "تعطيل إداري");
    await lifecycle.change("articles", b.id, "enable", actor, "إعادة تفعيل");
    const node = await admin.createStructure(
      id,
      { nodeType: "CHAPTER", titleAr: "فصل اختبار", sortKey: "000001" },
      actor,
      "إضافة فصل",
    );
    await lifecycle.change(
      "structure",
      node.id,
      "disable",
      actor,
      "إيقاف الربط الجديد",
    );
    await expect(
      admin.updateArticleAssignments(
        node.id,
        { legislationId: id, assign: [b.id], unassign: [] },
        actor,
        "رفض ربط عقدة معطلة",
      ),
    ).rejects.toThrow(/تفعيل العقدة/);
    await lifecycle.change(
      "structure",
      node.id,
      "enable",
      actor,
      "إعادة العقدة",
    );

    await lifecycle.change(
      "articles",
      b.id,
      "delete",
      actor,
      "حذف مسودة زائدة",
    );
    expect((await admin.legislation(id, true)).articles).toHaveLength(1);
    await published(id);
    await expect(
      lifecycle.change("articles", a.id, "delete", actor, "محاولة حذف منشور"),
    ).rejects.toThrow();
    await expect(
      admin.updateDraftArticle(a.id, "كتابة غير مسموحة", actor, "محاولة تغيير"),
    ).rejects.toThrow();
    await lifecycle.change(
      "legislations",
      id,
      "disable",
      actor,
      "إيقاف إداري مؤقت",
    );
    await expect(publicLaws.detail(id)).rejects.toThrow();
    expect(
      (
        await db.query(
          "SELECT status,legal_status,is_active FROM legislations WHERE id=?",
          [id],
        )
      )[0],
    ).toMatchObject({
      status: "PUBLISHED",
      legal_status: "IN_FORCE",
      is_active: 0,
    });
    const disabledList = await admin.legislations({ q: marker });
    expect(
      disabledList.items.find((l: { id: string }) => l.id === id),
    ).toMatchObject({
      status: "PUBLISHED",
      legalStatus: "IN_FORCE",
      isActive: 0,
    });
    await lifecycle.change(
      "legislations",
      id,
      "enable",
      actor,
      "إعادة الإتاحة",
    );
    expect((await publicLaws.articles(id)).items).toHaveLength(1);
    await lifecycle.change(
      "articles",
      a.id,
      "disable",
      actor,
      "إخفاء إداري للمادة",
    );
    expect((await publicLaws.articles(id)).items).toHaveLength(0);
    await lifecycle.change("articles", a.id, "enable", actor, "إعادة المادة");
  });
  it("rejects exact-permission and record-authority bypasses and rolls audit failures back", async () => {
    const id = await law(marker + " protected");
    await expect(
      lifecycle.change(
        "legislations",
        id,
        "delete",
        { ...actor, permissions: ["legislation.disable"] },
        "صلاحية خاطئة",
      ),
    ).rejects.toThrow(/الصلاحية/);
    await expect(
      lifecycle.change("users", actor.id, "delete", actor, "حذف الحساب الحالي"),
    ).rejects.toThrow(/الحساب الحالي/);
    await expect(
      lifecycle.change(
        "legislations",
        id,
        "disable",
        { ...actor, id: randomUUID() },
        "فشل التدقيق بعد التغيير",
      ),
    ).rejects.toThrow();
    expect((await lifecycle.state("legislations", id, actor)).isActive).toBe(
      true,
    );
    await lifecycle.change(
      "legislations",
      id,
      "delete",
      actor,
      "حذف مسودة مستقلة",
    );
    await expect(admin.legislation(id)).rejects.toThrow();
  });
  it("saves document elements independently, rejects stale edits and foreign elements, atomically publishes all operations", async () => {
    const id = await law(marker + " amended"),
      first = await article(id, "1"),
      second = await article(id, "2"),
      third = await article(id, "3");
    await published(id);
    const input = {
      legislationId: id,
      sourceDocumentId: sourceId,
      titleAr: "وثيقة متعددة " + marker,
      effectiveFrom: "2026-06-01",
      operations: [
        {
          articleId: first.id,
          operationType: "REPLACE" as const,
          citationText: "استبدال عبارة صريحة",
          replacementFrom: "العبارة القديمة",
          newText: "العبارة الجديدة",
        },
        {
          articleId: second.id,
          operationType: "REPLACE" as const,
          citationText: "نص المادة الثانية",
          newText: "نسخة ثانية جديدة",
        },
        {
          articleId: third.id,
          operationType: "REPEAL" as const,
          citationText: "إلغاء المادة الثالثة",
        },
        {
          operationType: "ADD" as const,
          citationText: "إضافة مادة مستقلة برقم مكرر",
          newLabel: "1",
          sortKey: "000004",
          newText: "مادة مضافة لا تكتب فوق المادة الأولى",
        },
      ],
    };
    const draft = await amendments.create(input, actor);
    documents.push(draft.id);
    let doc = (await amendments.list()).find(
      (d: { id: string }) => d.id === draft.id,
    )!;
    expect(doc.operations).toHaveLength(4);
    const detail = await amendments.detail(draft.id);
    expect(detail.id).toBe(draft.id);
    expect(detail.operations.map((op: { id: string }) => op.id)).toEqual(
      doc.operations.map((op: { id: string }) => op.id),
    );
    await expect(amendments.detail(randomUUID())).rejects.toThrow(
      /وثيقة التعديل غير موجودة/,
    );
    const changed = {
      ...input,
      revision: doc.revision,
      operations: doc.operations.map((op: any) => ({
        ...op,
        citationText: op.citationText + " مدقق",
      })),
    };
    await amendments.update(draft.id, changed, actor, "تحرير جميع العناصر");
    await expect(
      amendments.update(draft.id, changed, actor, "طلب قديم"),
    ).rejects.toThrow(/مستخدم آخر/);
    doc = (await amendments.list()).find(
      (d: { id: string }) => d.id === draft.id,
    )!;
    await expect(
      amendments.update(
        draft.id,
        {
          ...input,
          revision: doc.revision,
          operations: [{ ...input.operations[0]!, id: randomUUID() }],
        },
        actor,
        "عنصر من وثيقة أخرى",
      ),
    ).rejects.toThrow();
    expect(
      (await amendments.list()).find((d: { id: string }) => d.id === draft.id)
        .operations,
    ).toHaveLength(4);
    const retainedIds = doc.operations.map((op: { id: string }) => op.id);
    await expect(
      amendments.update(
        draft.id,
        {
          ...input,
          revision: doc.revision,
          operations: doc.operations.slice(0, 3),
        },
        { ...actor, permissions: all.filter((p) => p !== "amendment.delete") },
        "حذف مضمن دون صلاحية",
      ),
    ).rejects.toThrow(/صلاحية/);
    const extra = {
      operationType: "ADD" as const,
      citationText: "عنصر مؤقت",
      newLabel: "1",
      sortKey: "000005",
      newText: "عنصر سيحذف",
    };
    await expect(
      amendments.update(
        draft.id,
        {
          ...input,
          revision: doc.revision,
          operations: [...doc.operations, extra],
        },
        { ...actor, permissions: all.filter((p) => p !== "amendment.create") },
        "إضافة مضمنة دون صلاحية",
      ),
    ).rejects.toThrow(/صلاحية/);
    await amendments.update(
      draft.id,
      {
        ...input,
        revision: doc.revision,
        operations: [...doc.operations, extra],
      },
      actor,
      "إضافة عنصر خامس",
    );
    doc = (await amendments.list()).find(
      (d: { id: string }) => d.id === draft.id,
    )!;
    await amendments.update(
      draft.id,
      {
        ...input,
        revision: doc.revision,
        operations: doc.operations.slice(0, 4),
      },
      actor,
      "إزالة الخامس دون المساس بالبقية",
    );
    doc = (await amendments.list()).find(
      (d: { id: string }) => d.id === draft.id,
    )!;
    expect(doc.operations.map((op: { id: string }) => op.id)).toEqual(
      retainedIds,
    );
    for (const action of ["disable", "enable"] as const)
      await lifecycle.change(
        "amendment-operations",
        doc.operations[0].id,
        action,
        actor,
        "حالة عنصر المسودة",
      );
    await lifecycle.change(
      "amendments",
      draft.id,
      "disable",
      actor,
      "تعطيل إداري فقط",
    );
    await expect(
      amendments.review(draft.id, reviewer, "وثيقة غير فعالة"),
    ).rejects.toThrow();
    await lifecycle.change(
      "amendments",
      draft.id,
      "enable",
      actor,
      "إعادة إتاحة الوثيقة",
    );
    await amendments.review(draft.id, reviewer, "مراجعة مستقلة");
    await expect(
      amendments.update(
        draft.id,
        { ...input, revision: doc.revision },
        actor,
        "تجاوز مراجعة",
      ),
    ).rejects.toThrow();
    await amendments.publish(draft.id, publisher, "نشر جميع العناصر");
    expect(
      (
        await db.query(
          "SELECT status,legal_status,is_active FROM legislations WHERE id=?",
          [id],
        )
      )[0],
    ).toMatchObject({
      status: "PUBLISHED",
      legal_status: "AMENDED",
      is_active: 1,
    });
    await expect(
      amendments.publish(draft.id, publisher, "طلب نشر مكرر"),
    ).rejects.toThrow();
    const articles = (await publicLaws.articles(id, "2026-07-01")).items;
    expect(articles).toHaveLength(4);
    expect(
      articles.find((a: { id: string }) => a.id === first.id).textOriginal,
    ).toBe("النص الأصلي والعبارة الجديدة");
    expect(
      articles.filter((a: { currentLabel: string }) => a.currentLabel === "1"),
    ).toHaveLength(2);
    const mods = await db.query(
      "SELECT id FROM article_modifications WHERE operation_id IN (SELECT id FROM amendment_operations WHERE amendment_id=?)",
      [draft.id],
    );
    expect(mods).toHaveLength(4);
    const history = await db.query(
      "SELECT text_original FROM article_versions WHERE article_id=? AND version_no=1",
      [first.id],
    );
    expect(history[0].text_original).toBe("النص الأصلي والعبارة القديمة");
    await lifecycle.change(
      "amendments",
      draft.id,
      "disable",
      actor,
      "إخفاء الوثيقة إدارياً",
    );
    expect((await publicLaws.modifications(id)).amendments).toHaveLength(0);
    expect((await publicLaws.articles(id, "2026-07-01")).items).toHaveLength(4);
  });
  it("rolls every article back if a later operation cannot apply", async () => {
    const id = await law(marker + " rollback"),
      a = await article(id, "1"),
      b = await article(id, "2");
    await published(id);
    const doc = await amendments.create(
      {
        legislationId: id,
        sourceDocumentId: sourceId,
        titleAr: "وثيقة تفشل في العنصر الثاني",
        effectiveFrom: "2026-06-01",
        operations: [
          {
            articleId: a.id,
            operationType: "REPLACE",
            citationText: "عنصر صالح",
            newText: "تغيير يجب التراجع عنه",
          },
          {
            articleId: b.id,
            operationType: "REPLACE",
            citationText: "عبارة غير موجودة",
            replacementFrom: "عبارة مستحيلة",
            newText: "جديد",
          },
        ],
      },
      actor,
    );
    documents.push(doc.id);
    await amendments.review(doc.id, reviewer, "مراجعة اختبار");
    await expect(
      amendments.publish(doc.id, publisher, "نشر ذري يفشل"),
    ).rejects.toThrow(/العبارة/);
    expect(
      (
        await db.query(
          "SELECT COUNT(*) n FROM article_versions WHERE article_id=?",
          [a.id],
        )
      )[0].n,
    ).toBe("1");
    expect(
      (await db.query("SELECT status FROM amendments WHERE id=?", [doc.id]))[0]
        .status,
    ).toBe("REVIEWED");
  });
  it("creates and persists pages/navigation and enforces administrative visibility", async () => {
    const page = await site.createPage(
      {
        slug: "test-" + marker,
        titleAr: "صفحة اختبار",
        introAr: "مقدمة",
        sectionTitle: "عنوان قسم",
        sectionBody: "نص محفوظ",
        reason: "إنشاء اختبار",
      },
      actor,
    );
    pages.push(page.id);
    await site.updatePage(
      page.id,
      {
        eyebrowAr: "",
        titleAr: "صفحة محدثة",
        editRevision: 1,
        introAr: "مقدمة",
        sections: [
          { title: "أول", body: "نص أول" },
          { title: "ثان", body: "نص ثان" },
        ],
        status: "PUBLISHED",
      },
      actor,
      "نشر اختبار",
    );
    expect((await site.page(page.slug)).sections).toHaveLength(2);
    await lifecycle.change("pages", page.id, "disable", actor, "تعطيل صفحة");
    await expect(site.page(page.slug)).rejects.toThrow();
    await lifecycle.change("pages", page.id, "enable", actor, "إعادة صفحة");
    expect((await site.page(page.slug)).titleAr).toBe("صفحة محدثة");
    await expect(
      lifecycle.change("pages", page.id, "delete", actor, "حذف منشور"),
    ).rejects.toThrow();
    const nav = await site.createNavigation(
      {
        location: "FOOTER",
        labelAr: "رابط اختبار",
        path: "/ar/" + page.slug,
        sortOrder: 999,
        isVisible: true,
      },
      actor,
      "إنشاء رابط",
    );
    navs.push(nav.id);
    await lifecycle.change(
      "navigation",
      nav.id,
      "disable",
      actor,
      "إخفاء رابط",
    );
    expect(
      (await site.config()).navigation.some(
        (n: { id: string }) => n.id === nav.id,
      ),
    ).toBe(false);
    await lifecycle.change("navigation", nav.id, "enable", actor, "إعادة رابط");
    await lifecycle.change("navigation", nav.id, "delete", actor, "حذف رابط");
    expect(
      (await site.adminState()).navigation.some(
        (n: { id: string }) => n.id === nav.id,
      ),
    ).toBe(false);
  });
  it("persists structure, annex and relation operations with dependency checks", async () => {
    const id = await law(marker + " linked"),
      target = await law(marker + " relation target");
    await db.query(
      "INSERT INTO legislation_source_documents (legislation_id,source_document_id,source_role) VALUES (?,?,'SUPPORTING')",
      [id, sourceId],
    );
    const node = await admin.createStructure(
      id,
      { nodeType: "CHAPTER", titleAr: "فصل اختبار", sortKey: "000001" },
      actor,
      "إنشاء فصل",
    );
    await admin.updateStructure(
      node.id,
      { nodeType: "CHAPTER", titleAr: "فصل معدل", sortKey: "000001" },
      actor,
      "تحرير فصل",
    );
    expect((await admin.legislation(id)).structures[0].titleAr).toBe(
      "فصل معدل",
    );
    for (const action of ["disable", "enable"] as const)
      await lifecycle.change(
        "structure",
        node.id,
        action,
        actor,
        "حالة فصل اختبار",
      );
    const annex = await admin.createAnnex(
      id,
      {
        annexType: "TABLE",
        titleAr: "جدول اختبار",
        status: "DRAFT",
        sourceDocumentId: sourceId,
        validFrom: "2026-01-01",
        structuredTableJson: '{"columns":["الحقل"],"rows":[["اختبار"]]}',
      },
      actor,
      "إنشاء ملحق",
    );
    expect(admin.annexOptions().types).toHaveLength(8);
    const originalAnnex = await admin.annex(annex.id, actor);
    expect(originalAnnex).toMatchObject({
      annexTypeLabel: "جدول",
      version: {
        contentFormat: "STRUCTURED_TABLE",
        structuredTableJson: '{"columns":["الحقل"],"rows":[["اختبار"]]}',
      },
    });
    await admin.updateAnnex(
      annex.id,
      {
        annexType: "TABLE",
        titleAr: "جدول معدل",
        status: "DRAFT",
        contentFormat: "STRUCTURED_TABLE",
        structuredTableJson:
          '{"columns":["الحقل","القيمة"],"rows":[["النصاب",5]]}',
        sourceDocumentId: sourceId,
        validFrom: "2026-01-02",
        editFingerprint: originalAnnex.editFingerprint,
      },
      actor,
      "تحرير ملحق",
    );
    await expect(
      admin.updateAnnex(
        annex.id,
        {
          annexType: "TABLE",
          titleAr: "تعديل قديم",
          status: "DRAFT",
          contentFormat: "STRUCTURED_TABLE",
          structuredTableJson: '{"columns":["الحقل"],"rows":[["قديم"]]}',
          editFingerprint: originalAnnex.editFingerprint,
        },
        actor,
        "منع تعارض التحرير",
      ),
    ).rejects.toThrow(/عُدّل الملحق/);
    await admin.updateAnnex(
      annex.id,
      { annexType: "TABLE", titleAr: "جدول نهائي", status: "DRAFT" },
      actor,
      "طلب قديم لا يمسح المحتوى",
    );
    expect((await admin.annex(annex.id, actor)).version).toMatchObject({
      contentFormat: "STRUCTURED_TABLE",
      structuredTableJson:
        '{"columns":["الحقل","القيمة"],"rows":[["النصاب",5]]}',
    });
    const relation = await admin.createRelation(
      id,
      {
        relationType: "TOPICALLY_RELATED",
        targetLegislationId: target,
        reviewStatus: "UNREVIEWED",
      },
      actor,
      "إنشاء علاقة",
    );
    await admin.updateRelation(
      relation.id,
      {
        relationType: "TOPICALLY_RELATED",
        targetLegislationId: target,
        reviewStatus: "UNREVIEWED",
        scopeText: "نطاق معدل",
      },
      actor,
      "تحرير علاقة",
    );
    await expect(
      lifecycle.change("legislations", id, "delete", actor, "حذف تشريع مرتبط"),
    ).rejects.toThrow(/مرتبط/);
    for (const [kind, recordId] of [
      ["annexes", annex.id],
      ["relations", relation.id],
      ["structure", node.id],
    ]) {
      for (const action of ["disable", "enable", "delete"] as const)
        await lifecycle.change(
          kind!,
          recordId!,
          action,
          actor,
          "دورة سجل اختبار",
        );
    }
    const detail = await admin.legislation(id);
    expect(detail.annexes).toEqual([]);
    expect(detail.relations).toEqual([]);
    expect(detail.structures).toEqual([]);
    await expect(
      lifecycle.change(
        "sources",
        sourceId,
        "delete",
        actor,
        "مصدر مرتبط بتاريخ",
      ),
    ).rejects.toThrow(/علاقات/);
    const metadataEditor = {
      ...actor,
      permissions: all.filter((p) => p !== "source.review"),
    };
    const [originalSource] = await db.query(
      "SELECT reviewed_at FROM source_documents WHERE id=?",
      [sourceId],
    );
    await admin.updateSource(
      sourceId,
      { obtainedFrom: "وصف مصدر بعد التحرير", extractionStatus: "REVIEWED" },
      metadataEditor,
      "تحرير الوصف دون اعتماد جديد",
    );
    expect(
      (
        await db.query("SELECT reviewed_at FROM source_documents WHERE id=?", [
          sourceId,
        ])
      )[0].reviewed_at,
    ).toEqual(originalSource.reviewed_at);
    await expect(
      admin.updateSource(
        sourceId,
        { obtainedFrom: "وصف", extractionStatus: "EXTRACTED" },
        metadataEditor,
        "تغيير الاعتماد بلا صلاحية",
      ),
    ).rejects.toThrow(/صلاحية/);
    await lifecycle.change(
      "sources",
      sourceId,
      "disable",
      actor,
      "إيقاف إتاحة المصدر",
    );
    expect((await lifecycle.state("sources", sourceId, actor)).isActive).toBe(
      false,
    );
    await expect(
      admin.linkSource(
        id,
        {
          sourceDocumentId: sourceId,
          sourceRole: "SUPPORTING",
          reason: "رفض مصدر غير فعال",
        },
        actor,
      ),
    ).rejects.toThrow();
    await lifecycle.change(
      "sources",
      sourceId,
      "enable",
      actor,
      "إعادة المصدر",
    );
  });
  it("reviews, returns, resets and publishes annexes through guarded transitions", async () => {
    const id = await law(marker + " annex workflow");
    await db.query(
      "INSERT INTO legislation_source_documents (legislation_id,source_document_id,source_role) VALUES (?,?,'SUPPORTING')",
      [id, sourceId],
    );
    const annex = await admin.createAnnex(
      id,
      {
        annexType: "TABLE",
        titleAr: "جدول دورة النشر",
        sourceDocumentId: sourceId,
        validFrom: "2026-01-01",
        structuredTableJson: '{"columns":["الحقل"],"rows":[["قيمة"]]}',
      },
      actor,
      "إنشاء مسودة ملحق",
    );
    const draft = await admin.annex(annex.id, actor);
    expect(draft.actions.publish).toMatchObject({
      available: true,
      allowed: false,
    });
    await expect(
      admin.transitionAnnex(
        annex.id,
        "publish",
        draft.editFingerprint,
        actor,
        "محاولة نشر قبل المراجعة",
      ),
    ).rejects.toThrow(/مراجعة الملحق/);
    const withoutReview = {
      ...actor,
      permissions: actor.permissions.filter((code) => code !== "annex.review"),
    };
    await expect(
      admin.transitionAnnex(
        annex.id,
        "review",
        draft.editFingerprint,
        withoutReview,
        "اختبار صلاحية المراجعة",
      ),
    ).rejects.toThrow(/الصلاحية/);
    await admin.transitionAnnex(
      annex.id,
      "review",
      draft.editFingerprint,
      reviewer,
      "اعتماد مراجعة الملحق",
    );
    const reviewed = await admin.annex(annex.id, actor);
    expect(reviewed).toMatchObject({
      status: "REVIEWED",
      reviewedBy: reviewer.id,
      actions: { publish: { allowed: true }, return: { allowed: true } },
    });
    await expect(
      admin.transitionAnnex(
        annex.id,
        "return",
        draft.editFingerprint,
        reviewer,
        "بصمة قديمة",
      ),
    ).rejects.toThrow(/تغير الملحق/);
    await admin.updateAnnex(
      annex.id,
      {
        annexType: "TABLE",
        titleAr: "جدول دورة النشر المعدل",
        contentFormat: "STRUCTURED_TABLE",
        structuredTableJson:
          '{"columns":["الحقل"],"rows":[["قيمة معدلة"]]}',
        sourceDocumentId: sourceId,
        validFrom: "2026-01-02",
        editFingerprint: reviewed.editFingerprint,
      },
      actor,
      "تعديل محتوى مراجع",
    );
    const reset = await admin.annex(annex.id, actor);
    expect(reset).toMatchObject({
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
    });
    await admin.transitionAnnex(
      annex.id,
      "review",
      reset.editFingerprint,
      reviewer,
      "إعادة اعتماد المراجعة",
    );
    const ready = await admin.annex(annex.id, publisher);
    await admin.transitionAnnex(
      annex.id,
      "publish",
      ready.editFingerprint,
      publisher,
      "نشر الملحق المراجع",
    );
    expect(await admin.annex(annex.id, actor)).toMatchObject({
      status: "PUBLISHED",
      reviewedBy: reviewer.id,
    });

    const disabledPolicyAnnex = await admin.createAnnex(
      id,
      {
        annexType: "ANNEX",
        titleAr: "ملحق نشر بسياسة معطلة",
        sourceDocumentId: sourceId,
        validFrom: "2026-01-01",
        contentFormat: "TEXT",
        textContent: "محتوى الاختبار",
      },
      actor,
      "إنشاء ملحق لاختبار تعطيل السياسة",
    );
    await db.query(
      "UPDATE platform_settings SET value_json='false' WHERE setting_key='workflow.enforce_annex_workflow_order'",
    );
    try {
      const disabledDraft = await admin.annex(disabledPolicyAnnex.id, actor);
      expect(disabledDraft.actions.publish).toMatchObject({
        allowed: true,
      });
      await admin.transitionAnnex(
        disabledPolicyAnnex.id,
        "publish",
        disabledDraft.editFingerprint,
        publisher,
        "نشر مع تعطيل سياسة ترتيب المراجعة",
      );
    } finally {
      await db.query(
        "UPDATE platform_settings SET value_json='true' WHERE setting_key='workflow.enforce_annex_workflow_order'",
      );
    }

    const overrideAnnex = await admin.createAnnex(
      id,
      {
        annexType: "ANNEX",
        titleAr: "ملحق نشر باستثناء شخصي",
        sourceDocumentId: sourceId,
        validFrom: "2026-01-01",
        contentFormat: "TEXT",
        textContent: "محتوى الاستثناء",
      },
      actor,
      "إنشاء ملحق لاختبار الاستثناء",
    );
    await db.query(
      "INSERT IGNORE INTO user_permissions (user_id,permission_code) VALUES (?,'workflow.annex_workflow_order.override')",
      [actor.id],
    );
    try {
      const overrideDraft = await admin.annex(overrideAnnex.id, actor);
      await admin.updateAnnex(
        overrideAnnex.id,
        {
          annexType: "ANNEX",
          titleAr: "ملحق نشر باستثناء شخصي",
          status: "PUBLISHED",
          editFingerprint: overrideDraft.editFingerprint,
        },
        actor,
        "نشر طلب قديم باستثناء شخصي",
      );
      expect(await admin.annex(overrideAnnex.id, actor)).toMatchObject({
        status: "PUBLISHED",
      });
    } finally {
      await db.query(
        "DELETE FROM user_permissions WHERE user_id=? AND permission_code='workflow.annex_workflow_order.override'",
        [actor.id],
      );
    }
  });
  it("filters disabled article text from stale search indexes and suggestions immediately", async () => {
    const id = await law(marker + " indexed"),
      a = await article(id, "1", "مصطلحاختبارمعطل");
    await published(id);
    await db.query(
      "INSERT INTO search_documents (id,entity_type,entity_id,legislation_id,article_id,version_id,title_ar,text_literal,text_normalized,is_current,verification_level) VALUES (?,'ARTICLE_VERSION',?,?,?,?,?,?,?,TRUE,'D')",
      [
        randomUUID(),
        a.versionId,
        id,
        a.id,
        a.versionId,
        "عنوان اختبار",
        "مصطلحاختبارمعطل",
        "مصطلحاختبارمعطل",
      ],
    );
    const search = new MariaDbSearchProvider(db);
    const input = {
      q: "مصطلحاختبارمعطل",
      page: 1,
      pageSize: 10,
      historical: false,
      mode: "all" as const,
    };
    expect((await search.search(input)).meta.total).toBe(1);
    await lifecycle.change(
      "articles",
      a.id,
      "disable",
      actor,
      "منع ظهور فهرس قديم",
    );
    expect((await search.search(input)).meta.total).toBe(0);
    expect(await publicLaws.suggestions(input.q)).toEqual([]);
    expect((await publicLaws.list({ q: input.q })).meta.total).toBe(0);
    await lifecycle.change("articles", a.id, "enable", actor, "استعادة الظهور");
    expect((await search.search(input)).meta.total).toBe(1);
  });
  it("edits personal records with ownership enforced even for direct service calls", async () => {
    const search = await personal.saveSearch(actor.id, "بحث " + marker, {
      q: "النص",
    });
    users.push(search.id);
    await personal.updateSearch(actor.id, search.id, "اسم جديد", { q: "جديد" });
    expect(
      (await personal.savedSearches(actor.id)).find(
        (r: { id: string }) => r.id === search.id,
      ),
    ).toMatchObject({ nameAr: "اسم جديد", query: { q: "جديد" } });
    await expect(
      personal.updateSearch(reviewer.id, search.id, "تجاوز", {
        q: "غير مسموح",
      }),
    ).rejects.toThrow();
    await expect(
      personal.setActive(reviewer.id, "saved-searches", search.id, false),
    ).rejects.toThrow();
    await personal.setActive(actor.id, "saved-searches", search.id, false);
    expect(
      (await personal.savedSearches(actor.id)).find(
        (r: { id: string }) => r.id === search.id,
      ).isActive,
    ).toBe(0);
    await personal.deleteSavedSearch(actor.id, search.id);
  });
  it("manages gazette issues and preserves linked historical references", async () => {
    const input = {
      issueNumber: marker,
      publicationDate: "2026-04-01",
      publisher: "ناشر اختبار",
      reason: "اختبار الجريدة",
    };
    const g = await admin.saveGazette(input, actor);
    gazettes.push(g.id);
    await admin.saveGazette(
      { ...input, publisher: "ناشر معدل", editRevision: 1 },
      actor,
      g.id,
    );
    expect(
      (await admin.gazettes()).find((x: { id: string }) => x.id === g.id)
        .publisher,
    ).toBe("ناشر معدل");
    await expect(admin.saveGazette(input, actor)).rejects.toThrow(/مستخدم/);
    const id = await law();
    await db.query("UPDATE legislations SET gazette_issue_id=? WHERE id=?", [
      g.id,
      id,
    ]);
    await expect(
      lifecycle.change("gazettes", g.id, "delete", actor, "عدد مرتبط"),
    ).rejects.toThrow();
    for (const action of ["disable", "enable"] as const)
      await lifecycle.change(
        "gazettes",
        g.id,
        action,
        actor,
        "إدارة عدد الجريدة",
      );
    await db.query("UPDATE legislations SET gazette_issue_id=NULL WHERE id=?", [
      id,
    ]);
    await lifecycle.change(
      "gazettes",
      g.id,
      "delete",
      actor,
      "عدد تجريبي مستقل",
    );
    expect(
      (await admin.gazettes()).some((x: { id: string }) => x.id === g.id),
    ).toBe(false);
  });
  it("adds and removes import attachments atomically and rejects foreign, duplicate and published links", async () => {
    const imports = new ImportsService(db),
      bundle = randomUUID(),
      pdf = randomUUID();
    bundles.push(bundle);
    extraSources.push(pdf);
    await db.query(
      "INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,reviewed_at,created_by) VALUES (?,?,?,'application/pdf',1,?,NOW(3),'اختبار','REVIEWED',NOW(3),?)",
      [
        pdf,
        marker + ".pdf",
        "tests/" + pdf,
        createHash("sha256").update(pdf).digest("hex"),
        actor.id,
      ],
    );
    await db.query(
      "INSERT INTO source_imports (id,source_document_id,uploaded_by,status,detected_format) VALUES (?,?,?,'REVIEWED','txt')",
      [bundle, sourceId, actor.id],
    );
    await imports.changeAttachment(bundle, pdf, false, actor, "ربط ملف اختبار");
    await expect(
      imports.changeAttachment(bundle, pdf, false, actor, "طلب مكرر"),
    ).rejects.toThrow();
    expect((await imports.detail(bundle)).attachments).toHaveLength(1);
    await expect(
      imports.changeAttachment(randomUUID(), pdf, true, actor, "حزمة أخرى"),
    ).rejects.toThrow();
    await imports.changeAttachment(bundle, pdf, true, actor, "فك رابط مستقل");
    expect((await imports.detail(bundle)).attachments).toHaveLength(0);
    const id = await law();
    await db.query("UPDATE source_imports SET legislation_id=? WHERE id=?", [
      id,
      bundle,
    ]);
    await imports.changeAttachment(
      bundle,
      pdf,
      false,
      actor,
      "ربط مصدر المسودة",
    );
    await expect(
      imports.changeAttachment(bundle, pdf, true, actor, "ملف مرتبط"),
    ).rejects.toThrow(/مرتبط/);
    await published(id);
    await expect(
      imports.changeAttachment(bundle, pdf, true, actor, "رفض المساس بتاريخ"),
    ).rejects.toThrow(/مسودة/);
    expect(
      await db.query("SELECT id FROM source_documents WHERE id=?", [pdf]),
    ).toHaveLength(1);
  });
  it("edits and soft-deletes draft synonyms while refusing changes to published vocabulary", async () => {
    const item = await admin.addSynonym(marker, "عبارة اختبار مستقلة", actor);
    synonyms.push(item.id);
    await admin.updateSynonym(item.id, marker, "مرادف معدل", actor);
    for (const action of ["disable", "enable", "delete"] as const)
      await lifecycle.change(
        "synonyms",
        item.id,
        action,
        actor,
        "دورة مرادف تجريبي",
      );
    const [saved] = await db.query(
      "SELECT deleted_at,is_active FROM search_synonyms WHERE id=?",
      [item.id],
    );
    expect(saved.deleted_at).toBeTruthy();
    expect(saved.is_active).toBe(0);
    const [published] = await db.query(
      "SELECT sy.id FROM search_synonyms sy JOIN search_synonym_sets ss ON ss.id=sy.set_id WHERE ss.status='ACTIVE' LIMIT 1",
    );
    await expect(
      admin.updateSynonym(published.id, "تعديل", "مرفوض", actor),
    ).rejects.toThrow(/مسودة/);
    await expect(
      admin.createSynonymSet(actor, "رفض مسودة ثانية"),
    ).rejects.toThrow(/مسودة/);
  });
  it("soft-deletes an authorized lower-authority user and keeps credentials out of audit", async () => {
    const u = await admin.createUser(
      {
        username: "crud_" + marker.slice(0, 8),
        displayName: "حساب اختبار",
        password: "Isolated!Password2026",
        roles: [],
      },
      actor,
    );
    accounts.push(u.id);
    for (const action of ["disable", "enable", "delete"] as const)
      await lifecycle.change(
        "users",
        u.id,
        action,
        actor,
        "إدارة حساب اصطناعي",
      );
    const [row] = await db.query(
      "SELECT deleted_at,is_active,password_hash FROM users WHERE id=?",
      [u.id],
    );
    expect(row.deleted_at).toBeTruthy();
    expect(row.is_active).toBe(0);
    expect(row.password_hash).toBeTruthy();
    const logs = await db.query(
      "SELECT before_json,after_json FROM audit_logs WHERE entity_id=?",
      [u.id],
    );
    expect(JSON.stringify(logs)).not.toContain("password_hash");
    expect(JSON.stringify(logs)).not.toContain("Isolated!Password2026");
    await expect(
      lifecycle.change("users", u.id, "enable", actor, "لا تستعاد المحذوفات"),
    ).rejects.toThrow();
  });
  it("enforces ownership of notes and favorites through complete personal lifecycles", async () => {
    const id = await law();
    await published(id);
    await personal.favorite(actor.id, id);
    const note = await personal.addNote(
      actor.id,
      "LEGISLATION",
      id,
      "ملاحظة اختبار",
    );
    try {
      await personal.updateNote(actor.id, note.id, "ملاحظة معدلة");
      await expect(
        personal.updateNote(reviewer.id, note.id, "تجاوز"),
      ).rejects.toThrow();
      for (const active of [false, true]) {
        await personal.setActive(actor.id, "favorites", id, active);
        await personal.setActive(actor.id, "notes", note.id, active);
        expect(
          (await personal.notes(actor.id)).find(
            (x: { id: string }) => x.id === note.id,
          ).isActive,
        ).toBe(Number(active));
      }
      expect(
        (await personal.notes(actor.id)).find(
          (x: { id: string }) => x.id === note.id,
        ).noteText,
      ).toBe("ملاحظة معدلة");
    } finally {
      await personal.deleteNote(actor.id, note.id);
      await personal.unfavorite(actor.id, id);
    }
  });
  it("persists reports and their triage audit together without duplicating private details in audit", async () => {
    const id = await law();
    await published(id);
    const report = await personal.report(
      {
        entityType: "LEGISLATION",
        entityId: id,
        category: "OTHER",
        details: "تفاصيل خاصة باختبار بلاغ",
      },
      actor,
    );
    try {
      await admin.updateReport(
        report.id,
        "RESOLVED",
        "حلت المشكلة الاختبارية",
        actor,
        "OPEN",
      );
      expect(
        (
          await db.query("SELECT status FROM reports WHERE id=?", [report.id])
        )[0].status,
      ).toBe("RESOLVED");
      const rows = await db.query(
        "SELECT after_json FROM audit_logs WHERE entity_id=? AND action='CREATE_REPORT'",
        [report.id],
      );
      expect(rows).toHaveLength(1);
      expect(JSON.stringify(rows)).not.toContain("تفاصيل خاصة");
    } finally {
      await db.query("DELETE FROM reports WHERE id=?", [report.id]);
    }
  });
  afterAll(async () => {
    if (!db?.isInitialized) return;
    const q = db.createQueryRunner();
    await q.connect();
    await q.query("SET @ylp_maintenance=1");
    try {
      for (const id of accounts)
        await q.query("DELETE FROM users WHERE id=?", [id]);
      for (const id of bundles)
        await q.query("DELETE FROM source_imports WHERE id=?", [id]);
      for (const id of laws) {
        await q.query(
          "DELETE FROM previous_text_snapshots WHERE article_version_id IN (SELECT av.id FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?)",
          [id],
        );
        await q.query(
          "DELETE FROM article_modifications WHERE article_id IN (SELECT id FROM articles WHERE legislation_id=?)",
          [id],
        );
        await q.query("DELETE FROM amendments WHERE amended_legislation_id=?", [
          id,
        ]);
        await q.query(
          "UPDATE article_versions av JOIN articles a ON a.id=av.article_id SET av.previous_version_id=NULL WHERE a.legislation_id=?",
          [id],
        );
        await q.query(
          "DELETE av FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?",
          [id],
        );
        await q.query("DELETE FROM articles WHERE legislation_id=?", [id]);
        await q.query(
          "DELETE FROM annex_versions WHERE annex_id IN (SELECT id FROM annexes WHERE legislation_id=?)",
          [id],
        );
        await q.query("DELETE FROM annexes WHERE legislation_id=?", [id]);
        await q.query(
          "DELETE FROM legal_relations WHERE source_legislation_id=? OR target_legislation_id=?",
          [id, id],
        );
        await q.query("DELETE FROM structure_nodes WHERE legislation_id=?", [
          id,
        ]);
        await q.query("DELETE FROM search_documents WHERE legislation_id=?", [
          id,
        ]);
        for (const t of [
          "legislation_versions",
          "legislation_source_documents",
          "content_responsibilities",
          "workflow_events",
        ])
          await q.query(`DELETE FROM ${t} WHERE legislation_id=?`, [id]);
        await q.query(
          "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
          [id],
        );
        await q.query("DELETE FROM legislations WHERE id=?", [id]);
      }
      for (const id of refs.reverse())
        await q.query("DELETE FROM subjects WHERE id=?", [id]);
      for (const id of pages)
        await q.query("DELETE FROM public_pages WHERE id=?", [id]);
      for (const id of navs)
        await q.query("DELETE FROM navigation_items WHERE id=?", [id]);
      for (const id of extraSources)
        await q.query("DELETE FROM source_documents WHERE id=?", [id]);
      for (const id of gazettes)
        await q.query("DELETE FROM gazette_issues WHERE id=?", [id]);
      for (const id of synonyms)
        await q.query("DELETE FROM search_synonyms WHERE id=?", [id]);
      await q.query("DELETE FROM source_documents WHERE id=?", [sourceId]);
      // Audit records deliberately remain as evidence; no unrelated audit records are deleted.
    } finally {
      await q.query("SET @ylp_maintenance=0");
      await q.release();
      await db.destroy();
    }
  });
});
