import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { assertWorkflowPolicy } from "../admin/workflow-policies.js";
import { requireExactPermission } from "../admin/lifecycle.service.js";
import { DATABASE } from "../database/database.module.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";

export interface AmendmentOperationInput {
  id?: string;
  articleId?: string;
  operationType:
    "ADD" | "REPLACE" | "DELETE" | "REPEAL" | "RENUMBER" | "CORRECT";
  paragraphLocator?: string;
  citationText: string;
  newText?: string;
  newLabel?: string;
  sortKey?: string;
  replacementFrom?: string;
}
export interface AmendmentInput {
  legislationId?: string;
  sourceDocumentId: string;
  instrumentLegislationId?: string;
  titleAr: string;
  issueDate?: string;
  effectiveFrom: string;
  operations?: AmendmentOperationInput[];
  revision?: number;
  // Compatibility with previously saved single-operation forms.
  articleId?: string;
  operationType?: AmendmentOperationInput["operationType"];
  paragraphLocator?: string;
  citationText?: string;
  newText?: string;
  newLabel?: string;
}
const isoDate = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

@Injectable()
export class AmendmentsService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}
  async candidates() {
    const [articles, sources, legislations] = await Promise.all([
      this.db.query(
        `SELECT a.id,a.legislation_id legislationId,a.current_label currentLabel,l.title_ar legislationTitle,av.text_original currentText FROM articles a JOIN legislations l ON l.id=a.legislation_id JOIN article_versions av ON av.article_id=a.id WHERE a.deleted_at IS NULL AND a.is_active=TRUE AND l.deleted_at IS NULL AND l.is_active=TRUE AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED') AND av.status IN ('PUBLISHED','REPEALED') AND av.valid_from<=CURRENT_DATE() AND (av.valid_to IS NULL OR av.valid_to>CURRENT_DATE()) ORDER BY l.title_ar,a.sort_key,a.id`,
      ),
      this.db.query(
        "SELECT id,original_name originalName FROM source_documents WHERE deleted_at IS NULL AND is_active=TRUE AND extraction_status='REVIEWED' ORDER BY received_at DESC",
      ),
      this.db.query(
        "SELECT id,title_ar titleAr FROM legislations WHERE deleted_at IS NULL AND is_active=TRUE AND status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED') ORDER BY title_ar",
      ),
    ]);
    return { articles, sources, legislations };
  }
  private documentRows(id?: string) {
    return this.db.query(
      `SELECT am.id,am.revision,am.is_active isActive,am.title_ar titleAr,am.status,
       am.amended_legislation_id legislationId,am.source_document_id sourceDocumentId,
       am.instrument_legislation_id instrumentLegislationId,
       DATE_FORMAT(am.issue_date,'%Y-%m-%d') issueDate,
       DATE_FORMAT(am.effective_from,'%Y-%m-%d') effectiveFrom,
       DATE_FORMAT(am.created_at,'%Y-%m-%d %H:%i:%s') createdAt,
       DATE_FORMAT(am.reviewed_at,'%Y-%m-%d %H:%i:%s') reviewedAt,
       DATE_FORMAT(am.published_at,'%Y-%m-%d %H:%i:%s') publishedAt,
       l.title_ar legislationTitle,instrument.title_ar instrumentLegislationTitle,
       creator.display_name createdBy,reviewer.display_name reviewedBy,
       sd.original_name sourceName
       FROM amendments am
       JOIN legislations l ON l.id=am.amended_legislation_id
       JOIN source_documents sd ON sd.id=am.source_document_id
       LEFT JOIN legislations instrument ON instrument.id=am.instrument_legislation_id
       LEFT JOIN users creator ON creator.id=am.created_by
       LEFT JOIN users reviewer ON reviewer.id=am.reviewed_by
       WHERE am.deleted_at IS NULL${id ? " AND am.id=?" : ""}
       ORDER BY am.created_at DESC`,
      id ? [id] : [],
    );
  }
  private operationRows(amendmentId?: string) {
    return this.db.query(
      `SELECT ao.id,ao.amendment_id amendmentId,ao.is_active isActive,
       ao.operation_type operationType,ao.target_id articleId,
       ao.target_locator paragraphLocator,ao.proposed_text newText,
       ao.proposed_label newLabel,ao.proposed_sort_key sortKey,
       ao.replacement_from replacementFrom,ao.citation_text citationText,
       a.current_label articleLabel,ao.application_order applicationOrder
       FROM amendment_operations ao
       LEFT JOIN articles a ON a.id=ao.target_id
       WHERE ao.deleted_at IS NULL${amendmentId ? " AND ao.amendment_id=?" : ""}
       ORDER BY ao.application_order`,
      amendmentId ? [amendmentId] : [],
    );
  }
  async list() {
    const [documents, operations] = await Promise.all([
      this.documentRows(),
      this.operationRows(),
    ]);
    return documents.map((doc: { id: string }) => ({
      ...doc,
      operations: operations.filter(
        (op: { amendmentId: string }) => op.amendmentId === doc.id,
      ),
    }));
  }
  async detail(id: string) {
    const [documents, operations] = await Promise.all([
      this.documentRows(id),
      this.operationRows(id),
    ]);
    if (!documents[0]) throw new NotFoundException("وثيقة التعديل غير موجودة.");
    return { ...documents[0], operations };
  }
  async create(input: AmendmentInput, actor: AuthUser) {
    requireExactPermission(actor, "amendment.create");
    return this.save(input, actor);
  }
  async update(
    id: string,
    input: AmendmentInput,
    actor: AuthUser,
    reason: string,
  ) {
    requireExactPermission(actor, "amendment.update");
    return this.save(input, actor, id, reason);
  }
  private async save(
    input: AmendmentInput,
    actor: AuthUser,
    id?: string,
    reason = "إنشاء وثيقة تعديل مرتبطة بمصدر مدقق",
  ) {
    const operations =
      input.operations ??
      (input.operationType
        ? [
            {
              ...input,
              operationType: input.operationType,
              citationText: input.citationText ?? "",
            },
          ]
        : []);
    if (!operations.length || operations.length > 200)
      throw new BadRequestException(
        "أضف من عنصر واحد إلى 200 عنصر في الوثيقة.",
      );
    if (
      !input.titleAr.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) ||
      !Number.isFinite(Date.parse(input.effectiveFrom)) ||
      isoDate(new Date(input.effectiveFrom)) !== input.effectiveFrom
    )
      throw new BadRequestException("عنوان الوثيقة وتاريخ أثر صحيح مطلوبان.");
    return this.db.transaction(async (m) => {
      const [before] = id
        ? await m.query(
            "SELECT * FROM amendments WHERE id=? AND deleted_at IS NULL FOR UPDATE",
            [id],
          )
        : [];
      if (id && !before) throw new NotFoundException("الوثيقة غير موجودة.");
      if (before && before.status !== "DRAFT")
        throw new ConflictException(
          "تعدل وثيقة التعديل في حالة المسودة فقط؛ لا يغير المحتوى بعد المراجعة أو النشر.",
        );
      if (before && input.revision !== Number(before.revision))
        throw new ConflictException(
          "عدّل مستخدم آخر الوثيقة؛ أعد تحميلها قبل الحفظ حتى لا تفقد عناصره.",
        );
      const [targetArticle] = input.articleId
        ? await m.query(
            "SELECT legislation_id FROM articles WHERE id=? AND deleted_at IS NULL",
            [input.articleId],
          )
        : [];
      const legislationId =
        input.legislationId ??
        before?.amended_legislation_id ??
        targetArticle?.legislation_id;
      const [law] = await m.query(
        "SELECT id,status FROM legislations WHERE id=? AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE",
        [legislationId ?? null],
      );
      if (
        !law ||
        !["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"].includes(law.status)
      )
        throw new ConflictException(
          "اختر تشريعاً منشوراً وفعالاً لإعداد وثيقة التعديل.",
        );
      if (before && legislationId !== before.amended_legislation_id)
        throw new ConflictException("لا يمكن نقل وثيقة التعديل إلى تشريع آخر.");
      const [source] = await m.query(
        "SELECT id FROM source_documents WHERE id=? AND deleted_at IS NULL AND is_active=TRUE AND extraction_status='REVIEWED' FOR UPDATE",
        [input.sourceDocumentId],
      );
      if (!source)
        throw new ConflictException("يلزم مصدر فعال ومدقق قبل تسجيل التعديل.");
      if (input.instrumentLegislationId) {
        const [instrument] = await m.query(
          "SELECT id FROM legislations WHERE id=? AND deleted_at IS NULL AND is_active=TRUE",
          [input.instrumentLegislationId],
        );
        if (!instrument)
          throw new BadRequestException(
            "تشريع أداة التعديل غير موجود أو غير فعال.",
          );
      }
      if (
        !id &&
        (
          await m.query(
            "SELECT id FROM amendments WHERE amended_legislation_id=? AND source_document_id=? AND title_ar=? AND effective_from=? AND deleted_at IS NULL LIMIT 1",
            [
              legislationId,
              input.sourceDocumentId,
              input.titleAr.trim(),
              input.effectiveFrom,
            ],
          )
        ).length
      )
        throw new ConflictException(
          "توجد وثيقة مطابقة؛ افتحها لاستكمال عناصرها بدلاً من إنشاء وثيقة مكررة.",
        );
      const documentId = id ?? randomUUID();
      const oldOps = id
        ? await m.query(
            "SELECT * FROM amendment_operations WHERE amendment_id=? AND deleted_at IS NULL FOR UPDATE",
            [id],
          )
        : [];
      if (id)
        await m.query(
          "UPDATE amendments SET title_ar=?,source_document_id=?,instrument_legislation_id=?,issue_date=?,effective_from=?,revision=revision+1 WHERE id=?",
          [
            input.titleAr.trim(),
            input.sourceDocumentId,
            input.instrumentLegislationId || null,
            input.issueDate || null,
            input.effectiveFrom,
            id,
          ],
        );
      else
        await m.query(
          "INSERT INTO amendments (id,amended_legislation_id,instrument_legislation_id,title_ar,issue_date,effective_from,source_document_id,status,created_by) VALUES (?,?,?,?,?,?,?,'DRAFT',?)",
          [
            documentId,
            legislationId,
            input.instrumentLegislationId || null,
            input.titleAr.trim(),
            input.issueDate || null,
            input.effectiveFrom,
            input.sourceDocumentId,
            actor.id,
          ],
        );
      const retained = new Set<string>();
      // Move existing order values out of the incoming range before reordering.
      await m.query(
        "UPDATE amendment_operations SET application_order=application_order+100000 WHERE amendment_id=?",
        [documentId],
      );
      for (const [index, op] of operations.entries()) {
        if (
          !op.citationText.trim() ||
          ![
            "ADD",
            "REPLACE",
            "DELETE",
            "REPEAL",
            "RENUMBER",
            "CORRECT",
          ].includes(op.operationType)
        )
          throw new BadRequestException(
            "نوع العملية ونص الاستناد مطلوبان لكل عنصر.",
          );
        const old = op.id
          ? oldOps.find((r: { id: string }) => r.id === op.id)
          : undefined;
        if (op.id && (!old || retained.has(op.id)))
          throw new BadRequestException(
            "معرّف عنصر مكرر أو لا يتبع هذه الوثيقة.",
          );
        if (
          ["ADD", "REPLACE", "CORRECT"].includes(op.operationType) &&
          !op.newText?.trim()
        )
          throw new BadRequestException(
            "النص الجديد مطلوب لعنصر الإضافة أو الاستبدال أو التصحيح.",
          );
        if (
          ["ADD", "RENUMBER"].includes(op.operationType) &&
          !op.newLabel?.trim()
        )
          throw new BadRequestException("رقم المادة الجديد مطلوب.");
        if (op.operationType === "ADD" && !op.sortKey?.trim())
          throw new BadRequestException(
            "مفتاح ترتيب المادة المضافة مطلوب؛ يسمح بتكرار رقم المادة.",
          );
        let articleId: string;
        if (op.operationType === "ADD")
          articleId =
            old?.operation_type === "ADD" ? old.target_id : randomUUID();
        else {
          const [article] = await m.query(
            "SELECT id FROM articles WHERE id=? AND legislation_id=? AND deleted_at IS NULL AND is_active=TRUE FOR UPDATE",
            [op.articleId || null, legislationId],
          );
          if (!article)
            throw new BadRequestException(
              "المادة المستهدفة غير فعالة أو لا تتبع تشريع الوثيقة.",
            );
          articleId = article.id;
        }
        if (op.paragraphLocator && !op.replacementFrom?.trim())
          throw new BadRequestException(
            "استبدال كلمة أو عبارة يتطلب النص الأصلي الصريح؛ لن يستبدل نص المادة بالكامل ضمنياً.",
          );
        if (id && !old) requireExactPermission(actor, "amendment.create");
        const operationId = op.id ?? randomUUID();
        retained.add(operationId);
        const values = [
          op.operationType,
          articleId,
          input.effectiveFrom,
          index + 1,
          op.citationText.trim(),
          input.sourceDocumentId,
          op.paragraphLocator || null,
          op.newText?.trim() || null,
          op.newLabel?.trim() || null,
          op.sortKey?.trim() || null,
          op.replacementFrom || null,
        ];
        if (old)
          await m.query(
            "UPDATE amendment_operations SET operation_type=?,target_id=?,effective_from=?,application_order=?,citation_text=?,source_document_id=?,target_locator=?,proposed_text=?,proposed_label=?,proposed_sort_key=?,replacement_from=? WHERE id=? AND amendment_id=?",
            [...values, operationId, documentId],
          );
        else
          await m.query(
            "INSERT INTO amendment_operations (operation_type,target_id,effective_from,application_order,citation_text,source_document_id,target_locator,proposed_text,proposed_label,proposed_sort_key,replacement_from,id,amendment_id,target_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'ARTICLE')",
            [...values, operationId, documentId],
          );
      }
      if (oldOps.some((old: { id: string }) => !retained.has(old.id)))
        requireExactPermission(actor, "amendment.delete");
      for (const old of oldOps)
        if (!retained.has(old.id))
          await m.query(
            "UPDATE amendment_operations SET deleted_at=NOW(3),is_active=FALSE WHERE id=?",
            [old.id],
          );
      await m.query(
        "INSERT IGNORE INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'EDIT')",
        [legislationId, actor.id],
      );
      await this.audit(
        m,
        actor,
        id ? "UPDATE_AMENDMENT_DRAFT" : "CREATE_AMENDMENT_DRAFT",
        documentId,
        before ? { ...before, operations: oldOps } : null,
        { ...input, operations },
        reason,
      );
      return {
        id: documentId,
        status: "DRAFT",
        revision: before ? Number(before.revision) + 1 : 1,
      };
    });
  }
  async review(id: string, actor: AuthUser, reason: string) {
    requireExactPermission(actor, "amendment.review");
    return this.db.transaction(async (m) => {
      const doc = await this.document(m, id, "DRAFT");
      const ops = await this.operations(m, id);
      if (!ops.length)
        throw new ConflictException("لا تراجع وثيقة بلا عناصر فعالة.");
      const workflowPolicy = await assertWorkflowPolicy(
        m,
        "AMENDMENT_SELF_REVIEW",
        actor,
        doc.created_by === actor.id,
      );
      await m.query(
        "UPDATE amendments SET status='REVIEWED',reviewed_by=?,reviewed_at=NOW(3),revision=revision+1 WHERE id=?",
        [actor.id, id],
      );
      await this.audit(
        m,
        actor,
        "REVIEW_AMENDMENT",
        id,
        { status: "DRAFT" },
        { status: "REVIEWED", workflowPolicy },
        reason,
      );
      return { id, status: "REVIEWED", workflowPolicy };
    });
  }
  async publish(id: string, actor: AuthUser, reason: string) {
    requireExactPermission(actor, "amendment.publish");
    return this.db.transaction(async (m) => {
      const doc = await this.document(m, id, "REVIEWED");
      const [law] = await m.query(
        "SELECT status FROM legislations WHERE id=? AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE",
        [doc.amended_legislation_id],
      );
      if (
        !law ||
        !["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"].includes(law.status)
      )
        throw new ConflictException("التشريع المستهدف غير متاح للنشر.");
      const [source] = await m.query(
        "SELECT id FROM source_documents WHERE id=? AND is_active=TRUE AND deleted_at IS NULL AND extraction_status='REVIEWED' FOR UPDATE",
        [doc.source_document_id],
      );
      if (!source)
        throw new ConflictException("مصدر الوثيقة غير فعال أو غير مدقق.");
      const operations = await this.operations(m, id);
      if (!operations.length)
        throw new ConflictException("الوثيقة لا تحتوي عناصر فعالة.");
      const workflowPolicy = await assertWorkflowPolicy(
        m,
        "AMENDMENT_SELF_PUBLICATION",
        actor,
        doc.created_by === actor.id || doc.reviewed_by === actor.id,
      );
      const groups = new Map<string, any[]>();
      for (const op of operations) {
        const group = groups.get(op.target_id) ?? [];
        group.push(op);
        groups.set(op.target_id, group);
      }
      const results = [];
      for (const [articleId, ops] of groups)
        results.push(await this.applyArticle(m, doc, articleId, ops));
      await m.query(
        "UPDATE amendments SET status='PUBLISHED',published_at=NOW(3),revision=revision+1 WHERE id=?",
        [id],
      );
      // Legal amendment does not change the publication workflow or administrative availability.
      await m.query(
        "UPDATE legislations SET legal_status='AMENDED' WHERE id=?",
        [doc.amended_legislation_id],
      );
      await m.query(
        "INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)",
        [
          randomUUID(),
          JSON.stringify({ legislationId: doc.amended_legislation_id }),
        ],
      );
      await m.query(
        "INSERT IGNORE INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'PUBLISH')",
        [doc.amended_legislation_id, actor.id],
      );
      await this.audit(
        m,
        actor,
        "PUBLISH_AMENDMENT",
        id,
        { status: "REVIEWED" },
        { status: "PUBLISHED", results, workflowPolicy },
        reason,
      );
      return {
        id,
        status: "PUBLISHED",
        ...results[0],
        results,
        workflowPolicy,
      };
    });
  }
  private async applyArticle(
    m: EntityManager,
    doc: any,
    articleId: string,
    ops: any[],
  ) {
    const date = isoDate(doc.effective_from),
      adding = ops[0].operation_type === "ADD";
    let [article] = await m.query(
      "SELECT * FROM articles WHERE id=? AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE",
      [articleId],
    );
    if (adding) {
      if (article || ops.length !== 1)
        throw new ConflictException("عنصر الإضافة يجب أن ينشئ مادة مستقلة.");
      article = { id: articleId, current_label: ops[0].proposed_label };
      await m.query(
        "INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key) VALUES (?,?,?,?,?)",
        [
          articleId,
          doc.amended_legislation_id,
          ops[0].proposed_label,
          ops[0].proposed_label,
          ops[0].proposed_sort_key,
        ],
      );
    } else if (
      !article ||
      article.legislation_id !== doc.amended_legislation_id
    )
      throw new ConflictException(
        "مادة مستهدفة غير فعالة أو خارج تشريع الوثيقة.",
      );
    const [before] = adding
      ? []
      : await m.query(
          "SELECT * FROM article_versions WHERE article_id=? AND status IN ('PUBLISHED','REPEALED','FUTURE') AND valid_from<=? AND (valid_to IS NULL OR valid_to>?) ORDER BY valid_from DESC LIMIT 1 FOR UPDATE",
          [articleId, date, date],
        );
    if (!adding && (!before || isoDate(before.valid_from) === date))
      throw new ConflictException(
        "لا توجد نسخة سابقة صالحة عند تاريخ الأثر أو توجد نسخة تبدأ بالتاريخ نفسه.",
      );
    let text = String(before?.text_original ?? ""),
      label = article.current_label,
      repealed = false;
    const changes = [];
    for (const op of ops) {
      const previous = text;
      if (repealed)
        throw new ConflictException(
          "لا يمكن تطبيق عنصر آخر بعد إلغاء المادة في الوثيقة نفسها.",
        );
      if (["DELETE", "REPEAL"].includes(op.operation_type)) {
        text = "";
        repealed = true;
      } else if (op.operation_type === "RENUMBER") label = op.proposed_label;
      else if (op.replacement_from) {
        const occurrences = text.split(op.replacement_from).length - 1;
        if (occurrences !== 1)
          throw new ConflictException(
            "العبارة الأصلية غير موجودة أو مكررة؛ حدد نصاً أصلياً فريداً قبل الاستبدال.",
          );
        text = text.replace(op.replacement_from, () => op.proposed_text);
      } else text = op.proposed_text;
      changes.push({ op, previous, text });
    }
    const afterId = randomUUID();
    const [version] = await m.query(
      "SELECT COALESCE(MAX(version_no),0)+1 n FROM article_versions WHERE article_id=?",
      [articleId],
    );
    if (before)
      await m.query(
        "UPDATE article_versions SET valid_to=?,ending_reason=? WHERE id=?",
        [date, doc.title_ar.slice(0, 500), before.id],
      );
    await m.query(
      "INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,valid_to,status,source_document_id,previous_version_id,verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(3))",
      [
        afterId,
        articleId,
        version.n,
        text,
        text,
        normalizeArabic(text),
        date,
        before?.valid_to ?? null,
        repealed
          ? "REPEALED"
          : date > isoDate(new Date())
            ? "FUTURE"
            : "PUBLISHED",
        doc.source_document_id,
        before?.id ?? null,
      ],
    );
    await m.query("UPDATE articles SET current_label=? WHERE id=?", [
      label,
      articleId,
    ]);
    for (const change of changes) {
      const modificationId = randomUUID();
      await m.query(
        "INSERT INTO article_modifications (id,operation_id,article_id,paragraph_locator,before_version_id,after_version_id,previous_text,new_text,effective_from) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          modificationId,
          change.op.id,
          articleId,
          change.op.target_locator,
          before?.id ?? null,
          afterId,
          change.previous,
          change.text,
          date,
        ],
      );
      if (before)
        await m.query(
          "INSERT INTO previous_text_snapshots (id,article_version_id,modification_id,article_label,full_text,valid_from,valid_to,ending_reason,source_document_id) VALUES (?,?,?,?,?,?,?,?,?)",
          [
            randomUUID(),
            before.id,
            modificationId,
            article.current_label,
            before.text_original,
            before.valid_from,
            date,
            doc.title_ar.slice(0, 500),
            doc.source_document_id,
          ],
        );
    }
    return {
      articleId,
      beforeVersionId: before?.id ?? null,
      afterVersionId: afterId,
    };
  }
  private async document(m: EntityManager, id: string, status: string) {
    const [doc] = await m.query(
      "SELECT * FROM amendments WHERE id=? AND deleted_at IS NULL AND is_active=TRUE FOR UPDATE",
      [id],
    );
    if (!doc) throw new NotFoundException("وثيقة التعديل غير موجودة أو معطلة.");
    if (doc.status !== status)
      throw new ConflictException("حالة الوثيقة لا تسمح بهذا الإجراء.");
    return doc;
  }
  private operations(m: EntityManager, id: string) {
    return m.query(
      "SELECT * FROM amendment_operations WHERE amendment_id=? AND deleted_at IS NULL AND is_active=TRUE ORDER BY application_order FOR UPDATE",
      [id],
    );
  }
  private async audit(
    m: EntityManager,
    actor: AuthUser,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
    reason: string,
  ) {
    await m.query(
      "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,?,'AMENDMENT',?,?,?,?)",
      [
        randomUUID(),
        actor.id,
        action,
        id,
        before ? JSON.stringify(before) : null,
        JSON.stringify(after),
        reason.trim(),
      ],
    );
  }
}
