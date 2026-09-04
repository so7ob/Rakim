import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { DATABASE } from "../database/database.module.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";

interface AmendmentInput {
  articleId: string;
  sourceDocumentId: string;
  instrumentLegislationId?: string;
  titleAr: string;
  issueDate?: string;
  effectiveFrom: string;
  operationType:
    "ADD" | "REPLACE" | "DELETE" | "REPEAL" | "RENUMBER" | "CORRECT";
  paragraphLocator?: string;
  citationText: string;
  newText?: string;
  newLabel?: string;
}
const isoDate = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

@Injectable()
export class AmendmentsService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}
  async candidates() {
    const [articles, sources] = await Promise.all([
      this.db.query(
        `SELECT a.id,a.current_label currentLabel,l.title_ar legislationTitle,av.text_original currentText FROM articles a JOIN legislations l ON l.id=a.legislation_id JOIN article_versions av ON av.article_id=a.id WHERE l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED') AND av.valid_from<=CURRENT_DATE() AND (av.valid_to IS NULL OR av.valid_to>CURRENT_DATE()) ORDER BY l.title_ar,a.sort_key`,
      ),
      this.db.query(
        "SELECT DISTINCT sd.id,sd.original_name originalName FROM source_documents sd WHERE sd.extraction_status='REVIEWED' ORDER BY sd.received_at DESC",
      ),
    ]);
    return { articles, sources };
  }
  list() {
    return this.db.query(
      `SELECT am.id,am.title_ar titleAr,am.status,DATE_FORMAT(am.issue_date,'%Y-%m-%d') issueDate,DATE_FORMAT(am.effective_from,'%Y-%m-%d') effectiveFrom,am.created_at createdAt,l.title_ar legislationTitle,creator.display_name createdBy,reviewer.display_name reviewedBy,ao.operation_type operationType,ao.target_id articleId,ao.target_locator paragraphLocator,ao.proposed_text proposedText,ao.proposed_label proposedLabel,ao.citation_text citationText,a.current_label articleLabel,sd.original_name sourceName FROM amendments am JOIN legislations l ON l.id=am.amended_legislation_id JOIN amendment_operations ao ON ao.amendment_id=am.id JOIN articles a ON a.id=ao.target_id JOIN source_documents sd ON sd.id=am.source_document_id LEFT JOIN users creator ON creator.id=am.created_by LEFT JOIN users reviewer ON reviewer.id=am.reviewed_by ORDER BY FIELD(am.status,'DRAFT','REVIEWED','PUBLISHED'),am.created_at DESC`,
    );
  }
  async create(input: AmendmentInput, actor: AuthUser) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))
      throw new BadRequestException("تاريخ بدء الأثر غير صالح.");
    if (
      ["ADD", "REPLACE", "CORRECT"].includes(input.operationType) &&
      !input.newText?.trim()
    )
      throw new BadRequestException("النص الموحد الجديد مطلوب لهذه العملية.");
    if (input.operationType === "RENUMBER" && !input.newLabel?.trim())
      throw new BadRequestException("الرقم الجديد مطلوب لعملية إعادة الترقيم.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT a.id,a.legislation_id legislationId,l.status FROM articles a JOIN legislations l ON l.id=a.legislation_id WHERE a.id=? FOR UPDATE`,
        [input.articleId],
      );
      if (!rows[0]) throw new NotFoundException("المادة المستهدفة غير موجودة.");
      const sources = await manager.query(
        "SELECT id FROM source_documents WHERE id=? AND extraction_status='REVIEWED'",
        [input.sourceDocumentId],
      );
      if (!sources[0])
        throw new ConflictException("يلزم مصدر مدقق قبل تسجيل التعديل.");
      const amendmentId = randomUUID(),
        operationId = randomUUID();
      await manager.query(
        `INSERT INTO amendments (id,amended_legislation_id,instrument_legislation_id,title_ar,issue_date,effective_from,source_document_id,status,created_by) VALUES (?,?,?,?,?,?,?,'DRAFT',?)`,
        [
          amendmentId,
          rows[0].legislationId,
          input.instrumentLegislationId || null,
          input.titleAr.trim(),
          input.issueDate || null,
          input.effectiveFrom,
          input.sourceDocumentId,
          actor.id,
        ],
      );
      await manager.query(
        `INSERT INTO amendment_operations (id,amendment_id,operation_type,target_kind,target_id,effective_from,application_order,citation_text,source_document_id,target_locator,proposed_text,proposed_label) VALUES (?,?,?,'ARTICLE',?,?,1,?,?,?,?,?)`,
        [
          operationId,
          amendmentId,
          input.operationType,
          input.articleId,
          input.effectiveFrom,
          input.citationText.trim(),
          input.sourceDocumentId,
          input.paragraphLocator || null,
          input.newText?.trim() || null,
          input.newLabel?.trim() || null,
        ],
      );
      await manager.query(
        "INSERT IGNORE INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'EDIT')",
        [rows[0].legislationId, actor.id],
      );
      await this.audit(
        manager,
        actor.id,
        "CREATE_AMENDMENT_DRAFT",
        "AMENDMENT",
        amendmentId,
        null,
        input,
        "إنشاء مسودة تعديل مرتبطة بمصدر صريح",
      );
      return { id: amendmentId, status: "DRAFT" };
    });
  }
  async review(id: string, actor: AuthUser, reason: string) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT status,created_by createdBy FROM amendments WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("التعديل غير موجود.");
      if (rows[0].status !== "DRAFT")
        throw new ConflictException("لا تراجع إلا مسودة تعديل.");
      if (rows[0].createdBy === actor.id)
        throw new ForbiddenException("لا يجوز لمن أنشأ التعديل أن يراجعه.");
      await manager.query(
        "UPDATE amendments SET status='REVIEWED',reviewed_by=?,reviewed_at=NOW(3) WHERE id=?",
        [actor.id, id],
      );
      await this.audit(
        manager,
        actor.id,
        "REVIEW_AMENDMENT",
        "AMENDMENT",
        id,
        { status: "DRAFT" },
        { status: "REVIEWED" },
        reason,
      );
      return { id, status: "REVIEWED" };
    });
  }
  async publish(id: string, actor: AuthUser, reason: string) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT am.*,ao.id operationId,ao.operation_type operationType,ao.target_id articleId,ao.target_locator paragraphLocator,ao.proposed_text proposedText,ao.proposed_label proposedLabel FROM amendments am JOIN amendment_operations ao ON ao.amendment_id=am.id WHERE am.id=? FOR UPDATE`,
        [id],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException("التعديل غير موجود.");
      if (item.status !== "REVIEWED")
        throw new ConflictException("يجب مراجعة التعديل قبل تطبيقه.");
      if (item.created_by === actor.id || item.reviewed_by === actor.id)
        throw new ForbiddenException(
          "لا يجوز لمن أنشأ أو راجع التعديل أن ينشره.",
        );
      const effectiveDate = isoDate(item.effective_from);
      const article = (
        await manager.query(
          "SELECT current_label currentLabel FROM articles WHERE id=? FOR UPDATE",
          [item.articleId],
        )
      )[0];
      if (!article) throw new NotFoundException("المادة المستهدفة غير موجودة.");
      const before = (
        await manager.query(
          `SELECT * FROM article_versions WHERE article_id=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>?) ORDER BY valid_from DESC LIMIT 1 FOR UPDATE`,
          [item.articleId, effectiveDate, effectiveDate],
        )
      )[0];
      if (!before)
        throw new ConflictException("لا توجد نسخة نافذة عند تاريخ بدء الأثر.");
      if (isoDate(before.valid_from) === effectiveDate)
        throw new ConflictException(
          "يوجد إصدار يبدأ في تاريخ الأثر نفسه؛ غيّر ترتيب التعديلات أو التاريخ.",
        );
      if (item.operationType === "RENUMBER") {
        const duplicate = await manager.query(
          "SELECT id FROM articles WHERE legislation_id=? AND current_label=? AND id<>?",
          [item.amended_legislation_id, item.proposedLabel, item.articleId],
        );
        if (duplicate[0])
          throw new ConflictException("رقم المادة الجديد مستخدم بالفعل.");
        await manager.query("UPDATE articles SET current_label=? WHERE id=?", [
          item.proposedLabel,
          item.articleId,
        ]);
      }
      const afterId = randomUUID();
      const next = (
        await manager.query(
          "SELECT COALESCE(MAX(version_no),0)+1 nextVersion FROM article_versions WHERE article_id=?",
          [item.articleId],
        )
      )[0].nextVersion;
      const newText = ["DELETE", "REPEAL"].includes(item.operationType)
        ? ""
        : String(item.proposedText ?? before.text_original);
      const today = new Date().toISOString().slice(0, 10);
      const afterStatus = ["DELETE", "REPEAL"].includes(item.operationType)
        ? "REPEALED"
        : effectiveDate > today
          ? "FUTURE"
          : "PUBLISHED";
      const oldValidTo = before.valid_to;
      await manager.query(
        "UPDATE article_versions SET valid_to=?,ending_reason=? WHERE id=?",
        [effectiveDate, `${item.operationType}: ${item.title_ar}`, before.id],
      );
      await manager.query(
        `INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,valid_to,status,ending_reason,source_document_id,previous_version_id,verified_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,NOW(3))`,
        [
          afterId,
          item.articleId,
          next,
          newText,
          newText,
          normalizeArabic(newText),
          effectiveDate,
          oldValidTo,
          afterStatus,
          item.source_document_id,
          before.id,
        ],
      );
      const modificationId = randomUUID();
      await manager.query(
        `INSERT INTO article_modifications (id,operation_id,article_id,paragraph_locator,before_version_id,after_version_id,previous_text,new_text,effective_from) VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          modificationId,
          item.operationId,
          item.articleId,
          item.paragraphLocator,
          before.id,
          afterId,
          before.text_original,
          newText,
          effectiveDate,
        ],
      );
      await manager.query(
        `INSERT INTO previous_text_snapshots (id,article_version_id,modification_id,article_label,full_text,valid_from,valid_to,ending_reason,source_document_id) VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          randomUUID(),
          before.id,
          modificationId,
          article.currentLabel,
          before.text_original,
          before.valid_from,
          effectiveDate,
          `${item.operationType}: ${item.title_ar}`,
          item.source_document_id,
        ],
      );
      await manager.query(
        "UPDATE amendments SET status='PUBLISHED',published_at=NOW(3) WHERE id=?",
        [id],
      );
      await manager.query(
        "UPDATE legislations SET status='AMENDED',legal_status='AMENDED' WHERE id=?",
        [item.amended_legislation_id],
      );
      await manager.query(
        `INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)`,
        [
          randomUUID(),
          JSON.stringify({ legislationId: item.amended_legislation_id }),
        ],
      );
      await manager.query(
        "INSERT IGNORE INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'PUBLISH')",
        [item.amended_legislation_id, actor.id],
      );
      await this.audit(
        manager,
        actor.id,
        "PUBLISH_AMENDMENT",
        "AMENDMENT",
        id,
        { status: "REVIEWED", beforeVersionId: before.id },
        { status: "PUBLISHED", afterVersionId: afterId },
        reason,
      );
      return {
        id,
        status: "PUBLISHED",
        beforeVersionId: before.id,
        afterVersionId: afterId,
      };
    });
  }
  private async audit(
    manager: EntityManager,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    reason: string,
  ) {
    await manager.query(
      "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?)",
      [
        randomUUID(),
        actorId,
        action,
        entityType,
        entityId,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        reason.trim(),
      ],
    );
  }
}
