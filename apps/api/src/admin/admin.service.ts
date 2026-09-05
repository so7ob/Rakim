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
import { hashPassword } from "../auth/password.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";
import { DATABASE } from "../database/database.module.js";
import {
  assertWorkflowPolicy,
  parsePolicyBoolean,
  workflowPolicy,
  WORKFLOW_POLICIES,
} from "./workflow-policies.js";
import { AuthorizationPolicyService } from "./authorization-policy.service.js";

type WorkflowStatus =
  | "INBOX"
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED_FOR_PUBLISHING"
  | "PUBLISHED"
  | "ARCHIVED";

const transitions: Record<
  string,
  { permission: string; action: string; duty: string }
> = {
  "INBOX:DRAFT": {
    permission: "legislation.prepare",
    action: "PREPARE_DRAFT",
    duty: "EDIT",
  },
  "IN_REVIEW:DRAFT": {
    permission: "legislation.return",
    action: "RETURN_TO_DRAFT",
    duty: "REVIEW",
  },
  "DRAFT:IN_REVIEW": {
    permission: "legislation.submit",
    action: "SUBMIT_FOR_REVIEW",
    duty: "EDIT",
  },
  "IN_REVIEW:APPROVED_FOR_PUBLISHING": {
    permission: "legislation.approve",
    action: "APPROVE_FOR_PUBLISHING",
    duty: "APPROVE",
  },
  "APPROVED_FOR_PUBLISHING:PUBLISHED": {
    permission: "legislation.publish",
    action: "PUBLISH",
    duty: "PUBLISH",
  },
};
for (const status of ["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"])
  transitions[`${status}:ARCHIVED`] = {
    permission: "legislation.archive",
    action: "ARCHIVE",
    duty: "PUBLISH",
  };

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE) private readonly db: DataSource,
    @Inject(AuthorizationPolicyService)
    private readonly policy: AuthorizationPolicyService,
  ) {}

  async dashboard() {
    const [workflow, imports, quality, jobs] = await Promise.all([
      this.db.query(
        `SELECT status,COUNT(*) count FROM legislations GROUP BY status ORDER BY status`,
      ),
      this.db.query(
        `SELECT status,COUNT(*) count FROM source_imports GROUP BY status ORDER BY status`,
      ),
      this.db.query(
        `SELECT severity,COUNT(*) count FROM quality_issues WHERE status='OPEN' GROUP BY severity`,
      ),
      this.db.query(
        `SELECT status,COUNT(*) count FROM job_queue GROUP BY status`,
      ),
    ]);
    return { workflow, imports, quality, jobs };
  }

  async references() {
    const [types, authorities, subjects] = await Promise.all([
      this.db.query(
        "SELECT id,code,name_ar name FROM legislation_types WHERE is_active=1 ORDER BY name_ar",
      ),
      this.db.query(
        "SELECT id,code,name_ar name FROM authorities WHERE is_active=1 ORDER BY name_ar",
      ),
      this.db.query(
        "SELECT id,code,name_ar name FROM subjects WHERE is_active=1 ORDER BY name_ar",
      ),
    ]);
    return { types, authorities, subjects };
  }

  async referenceData() {
    const [types, authorities, subjects] = await Promise.all([
      this.db.query(
        "SELECT id,code,name_ar nameAr,is_active isActive FROM legislation_types ORDER BY name_ar",
      ),
      this.db.query(
        "SELECT id,code,name_ar nameAr,is_active isActive FROM authorities ORDER BY name_ar",
      ),
      this.db.query(
        "SELECT id,parent_id parentId,code,name_ar nameAr,is_active isActive,version_no versionNo FROM subjects ORDER BY name_ar",
      ),
    ]);
    return { types, authorities, subjects };
  }

  async createReference(
    kind: string,
    input: {
      code: string;
      nameAr: string;
      isActive: boolean;
      parentId?: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    const target = this.referenceTarget(kind);
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,60}$/.test(code))
      throw new BadRequestException(
        "الرمز يجب أن يتكون من أحرف لاتينية كبيرة وأرقام وشرطة سفلية.",
      );
    const id = randomUUID();
    try {
      await this.db.transaction(async (manager) => {
        if (target.table === "subjects")
          await manager.query(
            "INSERT INTO subjects (id,parent_id,code,name_ar,is_active) VALUES (?,?,?,?,?)",
            [
              id,
              input.parentId || null,
              code,
              input.nameAr.trim(),
              input.isActive,
            ],
          );
        else
          await manager.query(
            `INSERT INTO ${target.table} (id,code,name_ar,is_active) VALUES (?,?,?,?)`,
            [id, code, input.nameAr.trim(), input.isActive],
          );
        await this.auditWith(
          manager,
          actor.id,
          "CREATE_REFERENCE_DATA",
          target.entity,
          id,
          null,
          { ...input, code },
          reason,
        );
      });
    } catch (error) {
      if (String(error).includes("Duplicate entry"))
        throw new ConflictException("رمز القائمة مستخدم بالفعل.");
      throw error;
    }
    return { id };
  }

  async updateReference(
    kind: string,
    id: string,
    input: {
      code: string;
      nameAr: string;
      isActive: boolean;
      parentId?: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    const target = this.referenceTarget(kind);
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,60}$/.test(code))
      throw new BadRequestException("الرمز غير صالح.");
    if (input.parentId === id)
      throw new BadRequestException("لا يمكن أن يكون الموضوع أبًا لنفسه.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM ${target.table} WHERE id=? FOR UPDATE`,
        [id],
      );
      if (!rows[0])
        throw new NotFoundException("عنصر القائمة المرجعية غير موجود.");
      if (target.table === "subjects")
        await manager.query(
          "UPDATE subjects SET parent_id=?,code=?,name_ar=?,is_active=?,version_no=version_no+1 WHERE id=?",
          [
            input.parentId || null,
            code,
            input.nameAr.trim(),
            input.isActive,
            id,
          ],
        );
      else
        await manager.query(
          `UPDATE ${target.table} SET code=?,name_ar=?,is_active=? WHERE id=?`,
          [code, input.nameAr.trim(), input.isActive, id],
        );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_REFERENCE_DATA",
        target.entity,
        id,
        rows[0],
        { ...input, code },
        reason,
      );
      return { id };
    });
  }

  private referenceTarget(kind: string) {
    const targets: Record<
      string,
      {
        table: "legislation_types" | "authorities" | "subjects";
        entity: string;
      }
    > = {
      types: { table: "legislation_types", entity: "LEGISLATION_TYPE" },
      authorities: { table: "authorities", entity: "AUTHORITY" },
      subjects: { table: "subjects", entity: "SUBJECT" },
    };
    const target = targets[kind];
    if (!target)
      throw new BadRequestException("نوع القائمة المرجعية غير معروف.");
    return target;
  }

  async legislations(query: {
    status?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 20)));
    const where = ["1=1"];
    const values: Array<string | number> = [];
    if (query.status) {
      where.push("l.status=?");
      values.push(query.status);
    }
    if (query.q) {
      where.push("(l.title_ar LIKE ? OR l.official_number LIKE ?)");
      values.push(`%${query.q}%`, `%${query.q}%`);
    }
    const count = await this.db.query(
      `SELECT COUNT(*) total FROM legislations l WHERE ${where.join(" AND ")}`,
      values,
    );
    const items = await this.db.query(
      `SELECT l.id,l.display_code displayCode,l.title_ar titleAr,l.official_number officialNumber,
      l.year,l.status,l.legal_status legalStatus,l.verification_level verificationLevel,l.updated_at updatedAt,
      lt.name_ar typeName,au.name_ar authorityName,
      (SELECT COUNT(*) FROM legislation_versions lv WHERE lv.legislation_id=l.id) versionCount
      FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id
      WHERE ${where.join(" AND ")} ORDER BY l.updated_at DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items,
      meta: { page, pageSize, total: Number(count[0]?.total ?? 0) },
    };
  }

  async legislation(id: string, includeArticleText = false) {
    const rows = await this.db.query(
      `SELECT l.*,lt.name_ar typeName,au.name_ar authorityName
      FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id WHERE l.id=?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("التشريع غير موجود.");
    const [
      versions,
      events,
      sources,
      responsibilities,
      types,
      authorities,
      subjects,
      selectedSubjects,
      articles,
      gazette,
      structures,
      annexes,
      relations,
      legislationOptions,
    ] = await Promise.all([
      this.db.query(
        `SELECT lv.id,lv.version_no versionNo,lv.workflow_status workflowStatus,lv.content_kind contentKind,
        DATE_FORMAT(lv.valid_from,'%Y-%m-%d') validFrom,DATE_FORMAT(lv.valid_to,'%Y-%m-%d') validTo,lv.published_at publishedAt,lv.preamble_text preambleText,
        sd.id sourceId,sd.original_name sourceName,sd.extraction_status extractionStatus,sd.ocr_confidence ocrConfidence
        FROM legislation_versions lv JOIN source_documents sd ON sd.id=lv.source_document_id WHERE lv.legislation_id=? ORDER BY lv.version_no DESC`,
        [id],
      ),
      this.db.query(
        `SELECT we.*,u.display_name actorName FROM workflow_events we JOIN users u ON u.id=we.actor_id
        WHERE we.legislation_id=? ORDER BY we.created_at DESC`,
        [id],
      ),
      this.db.query(
        `SELECT DISTINCT sd.id,sd.original_name originalName,sd.media_type mediaType,sd.sha256,sd.byte_size byteSize,
        sd.received_at receivedAt,sd.obtained_from obtainedFrom,sd.page_count pageCount,
        sd.extraction_status extractionStatus,sd.ocr_confidence ocrConfidence,sd.reviewed_at reviewedAt
        FROM source_documents sd JOIN legislation_versions lv ON lv.source_document_id=sd.id WHERE lv.legislation_id=?`,
        [id],
      ),
      this.db.query(
        `SELECT cr.duty,cr.assigned_at assignedAt,u.id userId,u.display_name userName
        FROM content_responsibilities cr JOIN users u ON u.id=cr.user_id WHERE cr.legislation_id=?`,
        [id],
      ),
      this.db.query(
        "SELECT id,code,name_ar name FROM legislation_types WHERE is_active=1 ORDER BY name_ar",
      ),
      this.db.query(
        "SELECT id,code,name_ar name FROM authorities WHERE is_active=1 ORDER BY name_ar",
      ),
      this.db.query(
        "SELECT id,code,name_ar name FROM subjects WHERE is_active=1 ORDER BY name_ar",
      ),
      this.db.query(
        `SELECT s.id,s.code,s.name_ar name FROM legislation_subjects ls JOIN subjects s ON s.id=ls.subject_id WHERE ls.legislation_id=? ORDER BY s.name_ar`,
        [id],
      ),
      this.db.query(
        `SELECT a.id,a.current_label currentLabel,a.published_label publishedLabel,a.sort_key sortKey,a.structure_node_id structureNodeId,
        av.id versionId,av.version_no versionNo,${
          includeArticleText
            ? "av.text_original textOriginal"
            : "LEFT(REPLACE(REPLACE(av.text_original,'\\r',' '),'\\n',' '),180) textPreview"
        },av.status,DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom,
        DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo,av.ending_reason endingReason,av.source_document_id sourceDocumentId
        FROM articles a JOIN article_versions av ON av.article_id=a.id WHERE a.legislation_id=? AND av.version_no=(SELECT MAX(v.version_no) FROM article_versions v WHERE v.article_id=a.id) ORDER BY a.sort_key`,
        [id],
      ),
      this.db.query(
        `SELECT gi.id,gi.issue_number issueNumber,DATE_FORMAT(gi.publication_date,'%Y-%m-%d') publicationDate,gi.publisher,gi.notes
         FROM legislations l LEFT JOIN gazette_issues gi ON gi.id=l.gazette_issue_id WHERE l.id=?`,
        [id],
      ),
      this.db.query(
        `SELECT sn.id,sn.parent_id parentId,sn.node_type nodeType,sn.label_ar labelAr,
         sn.title_ar titleAr,sn.sort_key sortKey,
         (SELECT COUNT(*) FROM articles a WHERE a.structure_node_id=sn.id) directArticleCount
         FROM structure_nodes sn WHERE sn.legislation_id=? ORDER BY sn.sort_key`,
        [id],
      ),
      this.db.query(
        `SELECT ax.id,ax.annex_type annexType,ax.title_ar titleAr,ax.status,COUNT(av.id) versionCount FROM annexes ax LEFT JOIN annex_versions av ON av.annex_id=ax.id WHERE ax.legislation_id=? GROUP BY ax.id ORDER BY ax.title_ar`,
        [id],
      ),
      this.db.query(
        `SELECT lr.id,lr.relation_type relationType,lr.scope_text scopeText,DATE_FORMAT(lr.effective_from,'%Y-%m-%d') effectiveFrom,
        lr.review_status reviewStatus,lr.source_document_id sourceDocumentId,
        lr.target_legislation_id targetLegislationId,target.title_ar targetTitle
        FROM legal_relations lr JOIN legislations target ON target.id=lr.target_legislation_id WHERE lr.source_legislation_id=? ORDER BY lr.effective_from DESC`,
        [id],
      ),
      this.db.query(
        `SELECT id,title_ar name FROM legislations WHERE id<>? ORDER BY title_ar`,
        [id],
      ),
    ]);
    return {
      ...rows[0],
      versions,
      events,
      sources,
      responsibilities,
      articles,
      gazette: gazette[0] ?? null,
      structures,
      annexes,
      relations,
      selectedSubjectIds: selectedSubjects.map(
        (subject: { id: string }) => subject.id,
      ),
      references: { types, authorities, subjects, legislationOptions },
    };
  }

  async updateDraftArticle(
    id: string,
    text: string,
    actor: AuthUser,
    reason: string,
  ) {
    if (!text.trim()) throw new BadRequestException("نص المادة مطلوب.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT a.id,a.current_label currentLabel,l.id legislationId,l.status lawStatus,av.id versionId,av.status versionStatus,av.text_original oldText FROM articles a JOIN legislations l ON l.id=a.legislation_id JOIN article_versions av ON av.article_id=a.id WHERE a.id=? ORDER BY av.version_no DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException("المادة غير موجودة.");
      if (
        !["DRAFT", "IN_REVIEW"].includes(item.lawStatus) ||
        item.versionStatus !== "DRAFT"
      )
        throw new ConflictException(
          "لا يعدّل نص منشور أو تاريخي في مكانه؛ أنشئ إصدار تعديل جديدًا.",
        );
      await manager.query(
        "UPDATE article_versions SET text_original=?,text_structured=?,text_normalized=? WHERE id=?",
        [text.trim(), text.trim(), normalizeArabic(text), item.versionId],
      );
      await this.ensureResponsibility(
        manager,
        item.legislationId,
        actor.id,
        "EDIT",
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_DRAFT_ARTICLE",
        "ARTICLE",
        id,
        { textOriginal: item.oldText },
        { textOriginal: text.trim() },
        reason.trim(),
      );
      return { id, versionId: item.versionId };
    });
  }

  async updateDraftArticleMetadata(
    id: string,
    input: {
      currentLabel: string;
      publishedLabel: string;
      sortKey: string;
      structureNodeId?: string;
      validFrom: string;
      text: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    if (!input.text.trim()) throw new BadRequestException("نص المادة مطلوب.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT a.*,l.status lawStatus,av.id versionId,av.status versionStatus,
         av.valid_from validFrom,av.text_original oldText
         FROM articles a JOIN legislations l ON l.id=a.legislation_id JOIN article_versions av ON av.article_id=a.id
         WHERE a.id=? ORDER BY av.version_no DESC LIMIT 1 FOR UPDATE`,
        [id],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException("المادة غير موجودة.");
      if (
        !["INBOX", "DRAFT", "IN_REVIEW"].includes(item.lawStatus) ||
        item.versionStatus !== "DRAFT"
      )
        throw new ConflictException(
          "بيانات نسخة مادة منشورة لا تعدل في مكانها.",
        );
      if (input.structureNodeId) {
        const nodes = await manager.query(
          "SELECT id FROM structure_nodes WHERE id=? AND legislation_id=?",
          [input.structureNodeId, item.legislation_id],
        );
        if (!nodes.length)
          throw new BadRequestException(
            "العقدة البنيوية ليست تابعة لهذا التشريع.",
          );
      }
      await manager.query(
        `UPDATE articles SET current_label=?,published_label=?,sort_key=?,structure_node_id=? WHERE id=?`,
        [
          input.currentLabel.trim(),
          input.publishedLabel.trim(),
          input.sortKey.trim(),
          input.structureNodeId || null,
          id,
        ],
      );
      await manager.query(
        `UPDATE article_versions
         SET valid_from=?,text_original=?,text_structured=?,text_normalized=?
         WHERE id=?`,
        [
          input.validFrom,
          input.text.trim(),
          input.text.trim(),
          normalizeArabic(input.text),
          item.versionId,
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_DRAFT_ARTICLE_METADATA",
        "ARTICLE",
        id,
        item,
        input,
        reason,
      );
      return { id, versionId: item.versionId };
    });
  }

  async structureArticles(
    nodeId: string,
    query: {
      q?: string;
      state?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const nodes = await this.db.query(
      `SELECT sn.id,sn.legislation_id legislationId,sn.label_ar labelAr,
       sn.title_ar titleAr,l.status legislationStatus
       FROM structure_nodes sn JOIN legislations l ON l.id=sn.legislation_id
       WHERE sn.id=?`,
      [nodeId],
    );
    const node = nodes[0];
    if (!node) throw new NotFoundException("عنصر الهيكل غير موجود.");

    const state = ["all", "unassigned", "current", "elsewhere"].includes(
      query.state ?? "all",
    )
      ? (query.state ?? "all")
      : "all";
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(query.pageSize) || 100));
    const where = ["a.legislation_id=?"];
    const values: Array<string | number> = [node.legislationId];
    if (state === "unassigned") where.push("a.structure_node_id IS NULL");
    if (state === "current") {
      where.push("a.structure_node_id=?");
      values.push(nodeId);
    }
    if (state === "elsewhere") {
      where.push("a.structure_node_id IS NOT NULL AND a.structure_node_id<>?");
      values.push(nodeId);
    }
    const needle = String(query.q ?? "")
      .trim()
      .slice(0, 120);
    if (needle) {
      where.push(
        `(a.current_label LIKE ? OR a.published_label LIKE ?
          OR LEFT(av.text_original,500) LIKE ?)`,
      );
      const like = `%${needle}%`;
      values.push(like, like, like);
    }
    const from = `FROM articles a
      JOIN article_versions av ON av.article_id=a.id
       AND av.version_no=(SELECT MAX(latest.version_no) FROM article_versions latest WHERE latest.article_id=a.id)
      LEFT JOIN structure_nodes assigned ON assigned.id=a.structure_node_id
      WHERE ${where.join(" AND ")}`;
    const [countRows, items] = await Promise.all([
      this.db.query(`SELECT COUNT(*) total ${from}`, values),
      this.db.query(
        `SELECT a.id,a.current_label currentLabel,a.published_label publishedLabel,
         a.sort_key sortKey,a.structure_node_id structureNodeId,
         assigned.label_ar structureLabel,assigned.title_ar structureTitle,
         LEFT(REPLACE(REPLACE(av.text_original,'\\r',' '),'\\n',' '),180) textPreview,
         LEFT(SUBSTRING_INDEX(REPLACE(av.text_original,'\\r',''),'\\n',1),180) articleTitle,
         av.status versionStatus
         ${from} ORDER BY a.sort_key,a.id LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize],
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      node,
      items,
      meta: {
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
    };
  }

  async updateArticleAssignments(
    nodeId: string,
    input: { legislationId: string; assign: string[]; unassign: string[] },
    actor: AuthUser,
    reason: string,
  ) {
    const assign = input.assign ?? [];
    const unassign = input.unassign ?? [];
    if (reason.trim().length < 3)
      throw new BadRequestException("سبب تغيير الربط مطلوب.");
    if (!assign.length && !unassign.length)
      throw new BadRequestException("حدد مادة واحدة على الأقل لتغيير ربطها.");
    if (assign.length + unassign.length > 1000)
      throw new BadRequestException("الحد الأقصى للعملية الواحدة 1000 مادة.");
    if (
      new Set(assign).size !== assign.length ||
      new Set(unassign).size !== unassign.length
    )
      throw new BadRequestException("لا تقبل العملية معرفات مواد مكررة.");
    const overlap = assign.find((id) => unassign.includes(id));
    if (overlap)
      throw new BadRequestException(
        "لا يمكن ربط المادة وفك ربطها في العملية نفسها.",
      );
    const ids = [...assign, ...unassign];

    return this.db.transaction(async (manager) => {
      const nodeRows = await manager.query(
        `SELECT sn.id,sn.legislation_id legislationId,sn.label_ar labelAr,
         sn.title_ar titleAr,l.status legislationStatus
         FROM structure_nodes sn JOIN legislations l ON l.id=sn.legislation_id
         WHERE sn.id=? FOR UPDATE`,
        [nodeId],
      );
      const node = nodeRows[0];
      if (!node) throw new NotFoundException("عنصر الهيكل غير موجود.");
      if (node.legislationId !== input.legislationId)
        throw new BadRequestException(
          "العقدة الهدف ليست تابعة للتشريع المحدد.",
        );
      if (!["INBOX", "DRAFT", "IN_REVIEW"].includes(node.legislationStatus))
        throw new ConflictException(
          "لا يمكن تغيير مواقع مواد تشريع منشور في مكانها؛ أنشئ مسار تصحيح معتمدًا.",
        );

      const placeholders = ids.map(() => "?").join(",");
      const articles = (await manager.query(
        `SELECT a.id,a.legislation_id legislationId,
         a.structure_node_id structureNodeId,a.current_label currentLabel,
         av.status versionStatus
         FROM articles a JOIN article_versions av ON av.article_id=a.id
          AND av.version_no=(SELECT MAX(latest.version_no) FROM article_versions latest WHERE latest.article_id=a.id)
         WHERE a.id IN (${placeholders}) FOR UPDATE`,
        ids,
      )) as Array<{
        id: string;
        legislationId: string;
        structureNodeId: string | null;
        currentLabel: string;
        versionStatus: string;
      }>;
      if (articles.length !== ids.length)
        throw new NotFoundException(
          "تحتوي العملية مادة غير موجودة أو بلا نسخة حالية.",
        );
      if (
        articles.some(
          (article) => article.legislationId !== input.legislationId,
        )
      )
        throw new BadRequestException(
          "لا يمكن ربط مواد من تشريع آخر بهذه العقدة.",
        );
      if (articles.some((article) => article.versionStatus !== "DRAFT"))
        throw new ConflictException(
          "تحتوي العملية مادة منشورة أو تاريخية لا يجوز تغيير موقعها مباشرة.",
        );

      const byId = new Map(articles.map((article) => [article.id, article]));
      const assignedCount = assign.filter(
        (id) => byId.get(id)?.structureNodeId === null,
      ).length;
      const movedCount = assign.filter((id) => {
        const current = byId.get(id)?.structureNodeId;
        return Boolean(current && current !== nodeId);
      }).length;
      const unchangedAssignmentCount = assign.filter(
        (id) => byId.get(id)?.structureNodeId === nodeId,
      ).length;
      const unassignedCount = unassign.filter(
        (id) => byId.get(id)?.structureNodeId === nodeId,
      ).length;
      const changedCount = assignedCount + movedCount + unassignedCount;

      if (unassign.length)
        await manager.query(
          `UPDATE articles SET structure_node_id=NULL
           WHERE structure_node_id=? AND id IN (${unassign.map(() => "?").join(",")})`,
          [nodeId, ...unassign],
        );
      if (assign.length)
        await manager.query(
          `UPDATE articles SET structure_node_id=?
           WHERE id IN (${assign.map(() => "?").join(",")})
             AND NOT (structure_node_id <=> ?)`,
          [nodeId, ...assign, nodeId],
        );

      if (changedCount) {
        const sourceCounts = new Map<string, number>();
        for (const id of assign) {
          const source = byId.get(id)?.structureNodeId;
          if (source && source !== nodeId)
            sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
        }
        const action = movedCount
          ? assignedCount || unassignedCount
            ? "BULK_UPDATE_ARTICLE_ASSIGNMENTS"
            : "BULK_MOVE_ARTICLES"
          : unassignedCount && !assignedCount
            ? "BULK_UNASSIGN_ARTICLES"
            : "BULK_ASSIGN_ARTICLES";
        const summarizeIds = (values: string[]) => ({
          count: values.length,
          ids: values.slice(0, 50),
          omitted: Math.max(0, values.length - 50),
        });
        await this.ensureResponsibility(
          manager,
          input.legislationId,
          actor.id,
          "EDIT",
        );
        await this.auditWith(
          manager,
          actor.id,
          action,
          "STRUCTURE_NODE",
          nodeId,
          {
            sourceNodes: [...sourceCounts].map(([sourceNodeId, count]) => ({
              sourceNodeId,
              count,
            })),
            unassign: summarizeIds(unassign),
          },
          {
            legislationId: input.legislationId,
            targetNodeId: nodeId,
            assign: summarizeIds(assign),
            assignedCount,
            movedCount,
            unassignedCount,
          },
          reason.trim(),
        );
      }

      const updated = await manager.query(
        `SELECT id,structure_node_id structureNodeId FROM articles
         WHERE id IN (${placeholders}) ORDER BY sort_key,id`,
        ids,
      );
      const directCountRows = await manager.query(
        "SELECT COUNT(*) total FROM articles WHERE structure_node_id=?",
        [nodeId],
      );
      return {
        node: { id: nodeId, labelAr: node.labelAr, titleAr: node.titleAr },
        assignments: updated,
        summary: {
          requestedCount: ids.length,
          changedCount,
          assignedCount,
          movedCount,
          unassignedCount,
          unchangedCount:
            unchangedAssignmentCount + (unassign.length - unassignedCount),
          directArticleCount: Number(directCountRows[0]?.total ?? 0),
        },
      };
    });
  }

  async updateSource(
    id: string,
    input: {
      obtainedFrom: string;
      pageCount?: number;
      extractionStatus: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    if (
      input.extractionStatus === "REVIEWED" &&
      !actor.permissions.includes("source.review")
    )
      throw new ForbiddenException(
        "اعتماد المصدر المستخرج من صلاحية المراجع القانوني.",
      );
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM source_documents WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("المصدر غير موجود.");
      await manager.query(
        `UPDATE source_documents SET obtained_from=?,page_count=?,extraction_status=?,reviewed_at=IF(?='REVIEWED',NOW(3),NULL) WHERE id=?`,
        [
          input.obtainedFrom.trim(),
          input.pageCount ?? null,
          input.extractionStatus,
          input.extractionStatus,
          id,
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_SOURCE_METADATA",
        "SOURCE_DOCUMENT",
        id,
        rows[0],
        input,
        reason,
      );
      return { id };
    });
  }

  async updateStructure(
    id: string,
    input: {
      nodeType: string;
      parentId?: string;
      labelAr?: string;
      titleAr: string;
      sortKey: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT sn.*,l.status lawStatus FROM structure_nodes sn JOIN legislations l ON l.id=sn.legislation_id WHERE sn.id=? FOR UPDATE`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException("عنصر الهيكل غير موجود.");
      if (
        !["INBOX", "DRAFT", "IN_REVIEW"].includes(rows[0].lawStatus) &&
        !actor.permissions.includes("legislation.published_metadata.update")
      )
        throw new ConflictException("يتطلب تصحيح هيكل منشور مدير محتوى.");
      if (input.parentId === id)
        throw new BadRequestException("لا يمكن أن يكون العنصر أبًا لنفسه.");
      if (input.parentId) {
        const parents = await manager.query(
          "SELECT id FROM structure_nodes WHERE id=? AND legislation_id=?",
          [input.parentId, rows[0].legislation_id],
        );
        if (!parents.length)
          throw new BadRequestException("العنصر الأب ليس تابعًا لهذا التشريع.");
      }
      await manager.query(
        `UPDATE structure_nodes SET node_type=?,parent_id=?,label_ar=?,title_ar=?,sort_key=? WHERE id=?`,
        [
          input.nodeType,
          input.parentId || null,
          input.labelAr?.trim() || null,
          input.titleAr.trim(),
          input.sortKey.trim(),
          id,
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_STRUCTURE_NODE",
        "STRUCTURE_NODE",
        id,
        rows[0],
        input,
        reason,
      );
      return { id };
    });
  }

  async createStructure(
    legislationId: string,
    input: {
      nodeType: string;
      parentId?: string;
      labelAr?: string;
      titleAr: string;
      sortKey: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    const id = randomUUID();
    await this.db.transaction(async (manager) => {
      const law = await manager.query(
        "SELECT id,status FROM legislations WHERE id=? FOR UPDATE",
        [legislationId],
      );
      if (!law[0]) throw new NotFoundException("التشريع غير موجود.");
      if (
        !["INBOX", "DRAFT", "IN_REVIEW"].includes(law[0].status) &&
        !actor.permissions.includes("legislation.published_metadata.update")
      )
        throw new ConflictException("يتطلب إضافة هيكل إلى منشور مدير محتوى.");
      if (input.parentId) {
        const parents = await manager.query(
          "SELECT id FROM structure_nodes WHERE id=? AND legislation_id=?",
          [input.parentId, legislationId],
        );
        if (!parents.length)
          throw new BadRequestException("العنصر الأب ليس تابعًا لهذا التشريع.");
      }
      await manager.query(
        `INSERT INTO structure_nodes (id,legislation_id,parent_id,node_type,label_ar,title_ar,sort_key) VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          legislationId,
          input.parentId || null,
          input.nodeType,
          input.labelAr?.trim() || null,
          input.titleAr.trim(),
          input.sortKey.trim(),
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "CREATE_STRUCTURE_NODE",
        "STRUCTURE_NODE",
        id,
        null,
        input,
        reason,
      );
    });
    return { id };
  }

  async updateAnnex(
    id: string,
    input: { annexType: string; titleAr: string; status: string },
    actor: AuthUser,
    reason: string,
  ) {
    this.requirePermission(actor, "annex.update");
    this.requireAnnexStatusPermission(actor, input.status);
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM annexes WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("الملحق غير موجود.");
      if (rows[0].status !== "DRAFT" && input.status === "DRAFT")
        throw new BadRequestException(
          "لا يدعم نموذج الصلاحيات الحالي سحب نشر الملحق إلى مسودة.",
        );
      await manager.query(
        "UPDATE annexes SET annex_type=?,title_ar=?,status=? WHERE id=?",
        [input.annexType, input.titleAr.trim(), input.status, id],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_ANNEX",
        "ANNEX",
        id,
        rows[0],
        input,
        reason,
      );
      return { id };
    });
  }

  async createAnnex(
    legislationId: string,
    input: {
      annexType: string;
      titleAr: string;
      status: string;
      sourceDocumentId: string;
      validFrom: string;
      structuredTableJson?: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    this.requirePermission(actor, "annex.create");
    this.requireAnnexStatusPermission(actor, input.status);
    let structured: unknown = null;
    if (input.structuredTableJson?.trim()) {
      try {
        structured = JSON.parse(input.structuredTableJson);
      } catch {
        throw new BadRequestException("JSON الجدول المنظم غير صالح.");
      }
    }
    const id = randomUUID();
    const versionId = randomUUID();
    await this.db.transaction(async (manager) => {
      const source = await manager.query(
        "SELECT id FROM source_documents WHERE id=?",
        [input.sourceDocumentId],
      );
      if (!source[0]) throw new BadRequestException("المصدر المحدد غير موجود.");
      await manager.query(
        `INSERT INTO annexes (id,legislation_id,annex_type,title_ar,status) VALUES (?,?,?,?,?)`,
        [
          id,
          legislationId,
          input.annexType,
          input.titleAr.trim(),
          input.status,
        ],
      );
      await manager.query(
        `INSERT INTO annex_versions (id,annex_id,version_no,valid_from,source_document_id,structured_table_json) VALUES (?,?,1,?,?,?)`,
        [
          versionId,
          id,
          input.validFrom,
          input.sourceDocumentId,
          structured == null ? null : JSON.stringify(structured),
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "CREATE_ANNEX",
        "ANNEX",
        id,
        null,
        input,
        reason,
      );
    });
    return { id, versionId };
  }

  async updateRelation(
    id: string,
    input: {
      relationType: string;
      targetLegislationId: string;
      scopeText?: string;
      effectiveFrom?: string;
      sourceDocumentId?: string;
      reviewStatus: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    this.requirePermission(actor, "relation.update");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM legal_relations WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows[0])
        throw new NotFoundException("العلاقة القانونية غير موجودة.");
      if (rows[0].source_legislation_id === input.targetLegislationId)
        throw new BadRequestException("لا يمكن ربط التشريع بنفسه.");
      const targets = await manager.query(
        "SELECT id FROM legislations WHERE id=?",
        [input.targetLegislationId],
      );
      if (!targets.length)
        throw new BadRequestException("التشريع المقابل غير موجود.");
      if (input.sourceDocumentId) {
        const sources = await manager.query(
          "SELECT id FROM source_documents WHERE id=?",
          [input.sourceDocumentId],
        );
        if (!sources.length)
          throw new BadRequestException("مصدر الإثبات غير موجود.");
      }
      if (input.reviewStatus !== "UNREVIEWED")
        this.requirePermission(actor, "relation.review");
      if (
        input.reviewStatus === "REVIEWED" &&
        input.relationType !== "TOPICALLY_RELATED" &&
        !input.sourceDocumentId
      )
        throw new BadRequestException(
          "العلاقة القانونية المراجعة تحتاج مصدر إثبات.",
        );
      await manager.query(
        `UPDATE legal_relations SET relation_type=?,target_legislation_id=?,scope_text=?,effective_from=?,source_document_id=?,review_status=? WHERE id=?`,
        [
          input.relationType,
          input.targetLegislationId,
          input.scopeText?.trim() || null,
          input.effectiveFrom || null,
          input.sourceDocumentId || null,
          input.reviewStatus,
          id,
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_LEGAL_RELATION",
        "LEGAL_RELATION",
        id,
        rows[0],
        input,
        reason,
      );
      return { id };
    });
  }

  async createRelation(
    legislationId: string,
    input: {
      relationType: string;
      targetLegislationId: string;
      scopeText?: string;
      effectiveFrom?: string;
      sourceDocumentId?: string;
      reviewStatus: string;
    },
    actor: AuthUser,
    reason: string,
  ) {
    this.requirePermission(actor, "relation.create");
    if (legislationId === input.targetLegislationId)
      throw new BadRequestException("لا يمكن ربط التشريع بنفسه.");
    if (input.reviewStatus !== "UNREVIEWED")
      this.requirePermission(actor, "relation.review");
    if (
      input.reviewStatus === "REVIEWED" &&
      input.relationType !== "TOPICALLY_RELATED" &&
      !input.sourceDocumentId
    )
      throw new BadRequestException(
        "العلاقة القانونية المراجعة تحتاج مصدر إثبات.",
      );
    const id = randomUUID();
    await this.db.transaction(async (manager) => {
      const targets = await manager.query(
        "SELECT id FROM legislations WHERE id IN (?,?)",
        [legislationId, input.targetLegislationId],
      );
      if (targets.length !== 2)
        throw new BadRequestException("أحد التشريعين غير موجود.");
      if (input.sourceDocumentId) {
        const sources = await manager.query(
          "SELECT id FROM source_documents WHERE id=?",
          [input.sourceDocumentId],
        );
        if (!sources.length)
          throw new BadRequestException("مصدر الإثبات غير موجود.");
      }
      await manager.query(
        `INSERT INTO legal_relations (id,source_legislation_id,target_legislation_id,relation_type,scope_text,effective_from,source_document_id,review_status) VALUES (?,?,?,?,?,?,?,?)`,
        [
          id,
          legislationId,
          input.targetLegislationId,
          input.relationType,
          input.scopeText?.trim() || null,
          input.effectiveFrom || null,
          input.sourceDocumentId || null,
          input.reviewStatus,
        ],
      );
      await this.auditWith(
        manager,
        actor.id,
        "CREATE_LEGAL_RELATION",
        "LEGAL_RELATION",
        id,
        null,
        input,
        reason,
      );
    });
    return { id };
  }

  async update(
    id: string,
    input: Record<string, unknown>,
    actor: AuthUser,
    reason: string,
  ) {
    const before = await this.legislation(id);
    const isDraft = ["INBOX", "DRAFT", "IN_REVIEW"].includes(
      String(before.status),
    );
    if (isDraft && !actor.permissions.includes("legislation.update"))
      throw new ForbiddenException("تعديل المسودة يتطلب صلاحية تعديل التشريع.");
    if (
      !isDraft &&
      !actor.permissions.includes("legislation.published_metadata.update")
    )
      throw new ConflictException(
        "لا يملك دورك صلاحية تصحيح بيانات وصفية منشورة.",
      );
    if (!isDraft && input.preambleText !== undefined)
      throw new ConflictException(
        "لا تعدّل ديباجة منشورة في مكانها؛ أنشئ إصدارًا تشريعيًا جديدًا.",
      );
    const fields: Record<string, string> = {
      displayCode: "display_code",
      titleAr: "title_ar",
      summaryAr: "summary_ar",
      officialNumber: "official_number",
      year: "year",
      typeId: "type_id",
      authorityId: "authority_id",
      issueDate: "issue_date",
      publicationDate: "publication_date",
      effectiveFrom: "effective_from",
      repealDate: "repeal_date",
      legalStatus: "legal_status",
      verificationLevel: "verification_level",
    };
    const entries = Object.entries(fields).filter(
      ([key]) => input[key] !== undefined,
    );
    const updatesPreamble = input.preambleText !== undefined;
    const updatesGazette = input.gazetteIssueNumber !== undefined;
    const updatesSubjects = Array.isArray(input.subjectIds);
    if (
      !entries.length &&
      !updatesPreamble &&
      !updatesGazette &&
      !updatesSubjects
    )
      throw new BadRequestException("لم ترسل حقولًا قابلة للتحديث.");
    await this.db.transaction(async (manager) => {
      let gazetteIssueId: string | null | undefined;
      if (updatesGazette) {
        const issueNumber = String(input.gazetteIssueNumber ?? "").trim();
        if (issueNumber) {
          const publicationDate =
            String(input.gazettePublicationDate ?? "").trim() || null;
          const existing = await manager.query(
            `SELECT id FROM gazette_issues WHERE issue_number=? AND publication_date <=> ? LIMIT 1`,
            [issueNumber, publicationDate],
          );
          gazetteIssueId = existing[0]?.id ?? randomUUID();
          if (!existing[0])
            await manager.query(
              `INSERT INTO gazette_issues (id,issue_number,publication_date,publisher,notes) VALUES (?,?,?,?,?)`,
              [
                gazetteIssueId,
                issueNumber,
                publicationDate,
                String(input.gazettePublisher ?? "").trim() || null,
                String(input.gazetteNotes ?? "").trim() || null,
              ],
            );
          else
            await manager.query(
              `UPDATE gazette_issues SET publisher=?,notes=? WHERE id=?`,
              [
                String(input.gazettePublisher ?? "").trim() || null,
                String(input.gazetteNotes ?? "").trim() || null,
                gazetteIssueId,
              ],
            );
        } else gazetteIssueId = null;
      }
      if (entries.length)
        await manager.query(
          `UPDATE legislations SET ${entries.map(([, column]) => `${column}=?`).join(",")} WHERE id=?`,
          [...entries.map(([key]) => input[key] || null), id],
        );
      if (gazetteIssueId !== undefined)
        await manager.query(
          "UPDATE legislations SET gazette_issue_id=? WHERE id=?",
          [gazetteIssueId, id],
        );
      if (updatesSubjects) {
        const subjectIds = input.subjectIds as string[];
        if (subjectIds.length) {
          const valid = await manager.query(
            `SELECT id FROM subjects WHERE is_active=1 AND id IN (${subjectIds.map(() => "?").join(",")})`,
            subjectIds,
          );
          if (valid.length !== new Set(subjectIds).size)
            throw new BadRequestException("يتضمن الطلب موضوعًا غير معروف.");
        }
        await manager.query(
          "DELETE FROM legislation_subjects WHERE legislation_id=?",
          [id],
        );
        for (const subjectId of subjectIds)
          await manager.query(
            "INSERT INTO legislation_subjects (legislation_id,subject_id) VALUES (?,?)",
            [id, subjectId],
          );
      }
      if (updatesPreamble)
        await manager.query(
          "UPDATE legislation_versions SET preamble_text=? WHERE legislation_id=? ORDER BY version_no DESC LIMIT 1",
          [String(input.preambleText || "") || null, id],
        );
      await this.ensureResponsibility(manager, id, actor.id, "EDIT");
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_DRAFT",
        "LEGISLATION",
        id,
        before,
        input,
        reason,
      );
      await manager.query(
        `INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)`,
        [randomUUID(), JSON.stringify({ legislationId: id })],
      );
    });
    return this.legislation(id);
  }

  async transition(
    id: string,
    target: WorkflowStatus,
    actor: AuthUser,
    reason: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException("سبب الإجراء إلزامي.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM legislations WHERE id=? FOR UPDATE",
        [id],
      );
      const law = rows[0];
      if (!law) throw new NotFoundException("التشريع غير موجود.");
      const rule = transitions[`${String(law.status)}:${target}`];
      if (!rule)
        throw new ConflictException(
          `لا يمكن الانتقال من ${law.status} إلى ${target}.`,
        );
      this.requirePermission(actor, rule.permission);
      const duty = rule.duty;
      const separationControl = await this.assertSeparation(
        manager,
        id,
        actor,
        duty,
      );
      if (
        target === "IN_REVIEW" ||
        target === "APPROVED_FOR_PUBLISHING" ||
        target === "PUBLISHED"
      )
        await this.assertPublishable(manager, id, target);
      const publishedArticleCount =
        target === "PUBLISHED"
          ? await this.publishCurrentDraftArticles(manager, id)
          : 0;
      await manager.query("UPDATE legislations SET status=? WHERE id=?", [
        target,
        id,
      ]);
      await manager.query(
        `UPDATE legislation_versions SET workflow_status=?,published_at=IF(?='PUBLISHED',NOW(3),published_at)
        WHERE legislation_id=? ORDER BY version_no DESC LIMIT 1`,
        [target, target, id],
      );
      await manager.query(
        `INSERT INTO workflow_events (id,legislation_id,actor_id,from_status,to_status,action,reason)
        VALUES (?,?,?,?,?,?,?)`,
        [
          randomUUID(),
          id,
          actor.id,
          law.status,
          target,
          rule.action,
          reason.trim(),
        ],
      );
      await this.ensureResponsibility(manager, id, actor.id, duty);
      await this.auditWith(
        manager,
        actor.id,
        rule.action,
        "LEGISLATION",
        id,
        { status: law.status },
        { status: target, separationControl, publishedArticleCount },
        reason.trim(),
      );
      if (target === "PUBLISHED")
        await manager.query(
          `INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)`,
          [randomUUID(), JSON.stringify({ legislationId: id })],
        );
      return {
        id,
        from: law.status,
        to: target,
        action: rule.action,
        separationControl,
        publishedArticleCount,
      };
    });
  }

  async audit(query: { page?: number; pageSize?: number; action?: string }) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where = query.action ? "WHERE al.action=?" : "";
    const values = query.action ? [query.action] : [];
    const total = await this.db.query(
      `SELECT COUNT(*) total FROM audit_logs al ${where}`,
      values,
    );
    const items = await this.db.query(
      `SELECT al.id,al.action,al.entity_type entityType,al.entity_id entityId,
      al.before_json beforeValue,al.after_json afterValue,al.reason,al.occurred_at occurredAt,u.display_name actorName,u.username
      FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_id ${where} ORDER BY al.occurred_at DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    return {
      items,
      meta: { page, pageSize, total: Number(total[0]?.total ?? 0) },
    };
  }

  async users(actor: AuthUser) {
    const rows = await this.db
      .query(`SELECT u.id,u.username,u.display_name displayName,u.is_active isActive,u.created_at createdAt,u.last_login_at lastLoginAt,
      u.failed_login_count failedLoginCount,GROUP_CONCAT(r.code ORDER BY r.code) roles
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id GROUP BY u.id ORDER BY u.username`);
    const canViewRoles = actor.permissions.includes("role.view");
    return rows.map((user: Record<string, unknown>) => ({
      ...user,
      roles: canViewRoles ? user.roles : null,
    }));
  }

  async roles(actor: AuthUser) {
    return this.policy.assignableRoles(actor);
  }

  async workflowPolicies(actor?: AuthUser) {
    const canManageOverrides = Boolean(
      actor?.permissions.includes("workflow_policy.overrides.manage"),
    );
    const settingKeys = WORKFLOW_POLICIES.map((policy) => policy.settingKey);
    const permissionCodes = WORKFLOW_POLICIES.map(
      (policy) => policy.permissionCode,
    );
    const [settings, users, grants] = await Promise.all([
      this.db.query(
        `SELECT setting_key settingKey,value_json valueJson
        FROM platform_settings WHERE setting_key IN (${settingKeys.map(() => "?").join(",")})`,
        settingKeys,
      ),
      this.db.query(
        `SELECT u.id,u.username,u.display_name displayName,
        GROUP_CONCAT(r.code ORDER BY r.code) roles
        FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id
        LEFT JOIN roles r ON r.id=ur.role_id
        WHERE u.is_active=1 GROUP BY u.id ORDER BY u.display_name,u.username`,
      ),
      this.db.query(
        `SELECT user_id userId,permission_code permissionCode
        FROM user_permissions WHERE permission_code IN (${permissionCodes.map(() => "?").join(",")})
        ORDER BY permission_code,user_id`,
        permissionCodes,
      ),
    ]);
    const values = new Map(
      settings.map((item: Record<string, unknown>) => [
        String(item.settingKey),
        item.valueJson,
      ]),
    );
    return {
      policies: WORKFLOW_POLICIES.map((policy) => ({
        ...policy,
        enabled: parsePolicyBoolean(values.get(policy.settingKey), true),
        userIds: canManageOverrides
          ? grants
              .filter(
                (grant: Record<string, unknown>) =>
                  grant.permissionCode === policy.permissionCode,
              )
              .map((grant: Record<string, unknown>) => String(grant.userId))
          : [],
      })),
      users: canManageOverrides
        ? users.map((user: Record<string, unknown>) => ({
            ...user,
            roles: String(user.roles ?? "")
              .split(",")
              .filter(Boolean),
          }))
        : [],
    };
  }

  async updateWorkflowPolicy(
    code: string,
    enabled: boolean,
    actor: AuthUser,
    reason: string,
  ) {
    if (!reason.trim())
      throw new BadRequestException("سبب تعديل السياسة إلزامي.");
    const policy = workflowPolicy(code);
    if (!policy) throw new NotFoundException("سياسة سير العمل غير موجودة.");
    await this.db.transaction(async (manager) => {
      const settings = await manager.query(
        `SELECT value_json valueJson FROM platform_settings
        WHERE setting_key=? FOR UPDATE`,
        [policy.settingKey],
      );
      if (!settings[0])
        throw new NotFoundException("إعداد سياسة سير العمل غير موجود.");
      const before = parsePolicyBoolean(settings[0].valueJson, true);

      await manager.query(
        "UPDATE platform_settings SET value_json=?,updated_by=? WHERE setting_key=?",
        [JSON.stringify(enabled), actor.id, policy.settingKey],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_WORKFLOW_POLICY",
        "WORKFLOW_POLICY",
        policy.code,
        { enabled: before },
        { enabled },
        reason.trim(),
      );
    });
    return this.workflowPolicies(actor);
  }

  async updateWorkflowPolicyOverrides(
    code: string,
    userIds: string[],
    actor: AuthUser,
    reason: string,
  ) {
    if (!reason.trim())
      throw new BadRequestException("سبب تعديل الاستثناءات إلزامي.");
    const policy = workflowPolicy(code);
    if (!policy) throw new NotFoundException("سياسة سير العمل غير موجودة.");
    if (new Set(userIds).size !== userIds.length)
      throw new BadRequestException("لا يجوز تكرار المستخدم في الاستثناءات.");
    await this.db.transaction(async (manager) => {
      const selectedUsers = userIds.length
        ? await manager.query(
            `SELECT id FROM users WHERE is_active=1
             AND id IN (${userIds.map(() => "?").join(",")}) FOR UPDATE`,
            userIds,
          )
        : [];
      if (selectedUsers.length !== userIds.length)
        throw new BadRequestException(
          "تتضمن الاستثناءات مستخدمًا غير موجود أو معطلًا.",
        );
      const previousGrants = await manager.query(
        `SELECT user_id userId FROM user_permissions
         WHERE permission_code=? ORDER BY user_id FOR UPDATE`,
        [policy.permissionCode],
      );
      const previousUserIds = previousGrants.map(
        (grant: Record<string, unknown>) => String(grant.userId),
      );
      await manager.query(
        "DELETE FROM user_permissions WHERE permission_code=?",
        [policy.permissionCode],
      );
      for (const userId of userIds)
        await manager.query(
          `INSERT INTO user_permissions
           (user_id,permission_code,granted_by,grant_reason) VALUES (?,?,?,?)`,
          [userId, policy.permissionCode, actor.id, reason.trim()],
        );
      const affectedUsers = [...new Set([...previousUserIds, ...userIds])];
      if (affectedUsers.length)
        await manager.query(
          `UPDATE user_sessions SET revoked_at=NOW(3)
           WHERE user_id IN (${affectedUsers.map(() => "?").join(",")})
           AND revoked_at IS NULL`,
          affectedUsers,
        );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_WORKFLOW_POLICY_OVERRIDES",
        "WORKFLOW_POLICY",
        policy.code,
        { userIds: previousUserIds },
        { userIds },
        reason.trim(),
      );
    });
    return this.workflowPolicies(actor);
  }

  async createUser(
    input: {
      username: string;
      displayName: string;
      password: string;
      roles: string[];
    },
    actor: AuthUser,
  ) {
    const username = input.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,120}$/.test(username))
      throw new BadRequestException(
        "اسم المستخدم يجب أن يكون لاتينيًا ومن 3 أحرف على الأقل.",
      );
    if (input.password.length < 12)
      throw new BadRequestException("كلمة المرور يجب ألا تقل عن 12 محرفًا.");
    const id = randomUUID();
    const passwordHash = await hashPassword(input.password);
    try {
      await this.db.transaction(async (manager) => {
        await this.policy.assertCanCreateWithRoles(manager, actor, input.roles);
        const roles = await manager.query(
          `SELECT id,code FROM roles WHERE is_active=1 AND code IN (${input.roles.map(() => "?").join(",") || "''"})`,
          input.roles,
        );
        if (roles.length !== new Set(input.roles).size)
          throw new BadRequestException("يتضمن الطلب دورًا غير معروف.");
        await manager.query(
          "INSERT INTO users (id,username,display_name,password_hash,password_changed_at) VALUES (?,?,?,?,NOW(3))",
          [id, username, input.displayName.trim(), passwordHash],
        );
        for (const role of roles)
          await manager.query(
            "INSERT INTO user_roles (user_id,role_id,assigned_by) VALUES (?,?,?)",
            [id, role.id, actor.id],
          );
        await this.auditWith(
          manager,
          actor.id,
          "CREATE_USER",
          "USER",
          id,
          null,
          { username, displayName: input.displayName, roles: input.roles },
          "إنشاء حساب إداري",
        );
      });
    } catch (error) {
      if (String(error).includes("Duplicate entry"))
        throw new ConflictException("اسم المستخدم مستخدم بالفعل.");
      throw error;
    }
    return { id, username };
  }

  async setUserRoles(
    id: string,
    roleCodes: string[],
    actor: AuthUser,
    reason: string,
  ) {
    if (!reason.trim())
      throw new BadRequestException("سبب تعديل الصلاحيات إلزامي.");
    return this.db.transaction(async (manager) => {
      const users = await manager.query(
        "SELECT username FROM users WHERE id=? FOR UPDATE",
        [id],
      );
      if (!users[0]) throw new NotFoundException("المستخدم غير موجود.");
      const previous = await manager.query(
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?",
        [id],
      );
      await this.policy.assertCanChangeUserRoles(manager, actor, id, roleCodes);
      const roles = await manager.query(
        `SELECT id,code FROM roles WHERE is_active=1 AND code IN (${roleCodes.map(() => "?").join(",") || "''"})`,
        roleCodes,
      );
      if (roles.length !== new Set(roleCodes).size)
        throw new BadRequestException("يتضمن الطلب دورًا غير معروف.");
      await manager.query("DELETE FROM user_roles WHERE user_id=?", [id]);
      for (const role of roles)
        await manager.query(
          "INSERT INTO user_roles (user_id,role_id,assigned_by) VALUES (?,?,?)",
          [id, role.id, actor.id],
        );
      await manager.query(
        "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL",
        [id],
      );
      await this.auditWith(
        manager,
        actor.id,
        "UPDATE_USER_ROLES",
        "USER",
        id,
        { roles: previous.map((r: { code: string }) => r.code) },
        { roles: roleCodes },
        reason.trim(),
      );
      return { id, roles: roleCodes };
    });
  }

  async resetPassword(
    id: string,
    password: string,
    actor: AuthUser,
    reason: string,
  ) {
    if (password.length < 12)
      throw new BadRequestException("كلمة المرور يجب ألا تقل عن 12 محرفًا.");
    const hash = await hashPassword(password);
    return this.db.transaction(async (manager) => {
      await this.policy.assertCanManageUser(manager, actor, id);
      const result = await manager.query(
        "UPDATE users SET password_hash=?,password_changed_at=NOW(3),failed_login_count=0,locked_until=NULL WHERE id=?",
        [hash, id],
      );
      if (!result.affectedRows)
        throw new NotFoundException("المستخدم غير موجود.");
      await manager.query(
        "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL",
        [id],
      );
      await this.auditWith(
        manager,
        actor.id,
        "RESET_USER_PASSWORD",
        "USER",
        id,
        null,
        null,
        reason.trim() || "إعادة تعيين كلمة المرور",
      );
      return { id };
    });
  }

  async setUserActive(
    id: string,
    active: boolean,
    actor: AuthUser,
    reason: string,
  ) {
    this.requirePermission(actor, active ? "user.enable" : "user.disable");
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT u.is_active isActive FROM users u WHERE u.id=? FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("المستخدم غير موجود.");
      await this.policy.assertCanChangeUserState(manager, actor, id, active);
      await manager.query("UPDATE users SET is_active=? WHERE id=?", [
        active,
        id,
      ]);
      if (!active)
        await manager.query(
          "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL",
          [id],
        );
      await this.auditWith(
        manager,
        actor.id,
        active ? "ENABLE_USER" : "DISABLE_USER",
        "USER",
        id,
        rows[0],
        { isActive: active },
        reason || "إدارة حالة الحساب",
      );
    });
    return { id, isActive: active };
  }

  async synonyms() {
    return this.db
      .query(`SELECT ss.id setId,ss.version_no versionNo,ss.status,ss.published_at publishedAt,
      sy.id,sy.term_ar termAr,sy.synonym_ar synonymAr FROM search_synonym_sets ss
      LEFT JOIN search_synonyms sy ON sy.set_id=ss.id ORDER BY ss.version_no DESC,sy.term_ar`);
  }

  private requirePermission(actor: AuthUser, permission: string) {
    if (!actor.permissions.includes(permission))
      throw new ForbiddenException(
        "ليست لديك الصلاحية الدقيقة المطلوبة لتنفيذ هذه العملية.",
      );
  }

  private requireAnnexStatusPermission(actor: AuthUser, status: string) {
    const permission: Record<string, string | undefined> = {
      DRAFT: undefined,
      PUBLISHED: "annex.publish",
      REPLACED: "annex.replace",
      REPEALED: "annex.repeal",
    };
    if (!(status in permission))
      throw new BadRequestException("حالة الملحق غير معروفة.");
    if (permission[status]) this.requirePermission(actor, permission[status]!);
  }

  async addSynonym(term: string, synonym: string, actor: AuthUser) {
    return this.db.transaction(async (manager) => {
      let sets = await manager.query(
        "SELECT id FROM search_synonym_sets WHERE status='DRAFT' ORDER BY version_no DESC LIMIT 1",
      );
      if (!sets[0]) {
        const id = randomUUID();
        await manager.query(
          `INSERT INTO search_synonym_sets (id,version_no,status)
          SELECT ?,COALESCE(MAX(version_no),0)+1,'DRAFT' FROM search_synonym_sets`,
          [id],
        );
        sets = [{ id }];
      }
      const id = randomUUID();
      await manager.query(
        "INSERT INTO search_synonyms (id,set_id,term_ar,synonym_ar) VALUES (?,?,?,?)",
        [id, sets[0].id, term.trim(), synonym.trim()],
      );
      await this.auditWith(
        manager,
        actor.id,
        "ADD_SYNONYM",
        "SEARCH_SYNONYM",
        id,
        null,
        { term, synonym },
        "إضافة مرادف قانوني لمسودة القاموس",
      );
      return { id, setId: sets[0].id };
    });
  }

  async activateSynonymSet(setId: string, actor: AuthUser, reason: string) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT id,version_no versionNo,status FROM search_synonym_sets WHERE id=? FOR UPDATE",
        [setId],
      );
      if (!rows[0]) throw new NotFoundException("نسخة القاموس غير موجودة.");
      if (rows[0].status !== "DRAFT")
        throw new ConflictException("لا يمكن نشر إلا نسخة مسودة.");
      const count = await manager.query(
        "SELECT COUNT(*) total FROM search_synonyms WHERE set_id=?",
        [setId],
      );
      if (!Number(count[0].total))
        throw new ConflictException("لا يمكن نشر قاموس فارغ.");
      await manager.query(
        "UPDATE search_synonym_sets SET status='ARCHIVED' WHERE status='ACTIVE'",
      );
      await manager.query(
        "UPDATE search_synonym_sets SET status='ACTIVE',published_at=NOW(3) WHERE id=?",
        [setId],
      );
      await this.auditWith(
        manager,
        actor.id,
        "ACTIVATE_SYNONYM_SET",
        "SEARCH_SYNONYM_SET",
        setId,
        { status: "DRAFT" },
        { status: "ACTIVE", versionNo: rows[0].versionNo },
        reason.trim() || "نشر نسخة قاموس البحث",
      );
      return { setId, status: "ACTIVE" };
    });
  }

  async deleteSynonym(id: string, actor: AuthUser) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT sy.*,ss.status FROM search_synonyms sy JOIN search_synonym_sets ss ON ss.id=sy.set_id WHERE sy.id=? FOR UPDATE`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException("المرادف غير موجود.");
      if (rows[0].status !== "DRAFT")
        throw new ConflictException("لا تعدّل نسخة قاموس منشورة.");
      await manager.query("DELETE FROM search_synonyms WHERE id=?", [id]);
      await this.auditWith(
        manager,
        actor.id,
        "DELETE_SYNONYM",
        "SEARCH_SYNONYM",
        id,
        rows[0],
        null,
        "حذف مرادف من نسخة مسودة",
      );
      return { id, deleted: true };
    });
  }

  async quality() {
    const stored = await this.db
      .query(`SELECT qi.*,l.title_ar legislationTitle,sd.original_name sourceName
      FROM quality_issues qi LEFT JOIN legislations l ON l.id=qi.legislation_id LEFT JOIN source_documents sd ON sd.id=qi.source_document_id
      WHERE qi.status='OPEN' ORDER BY FIELD(qi.severity,'ERROR','WARNING','INFO'),qi.detected_at DESC`);
    const live = await this.db
      .query(`SELECT l.id legislationId,l.title_ar legislationTitle,'MISSING_EFFECTIVE_DATE' issueCode,
      'ERROR' severity,'تاريخ النفاذ مفقود' messageAr FROM legislations l
      WHERE l.status NOT IN ('ARCHIVED','INBOX') AND l.effective_from IS NULL
      UNION ALL
      SELECT l.id,l.title_ar,'MISSING_SOURCE','ERROR','لا يوجد إصدار مرتبط بمصدر' FROM legislations l
      WHERE l.status NOT IN ('ARCHIVED','INBOX') AND NOT EXISTS
      (SELECT 1 FROM legislation_versions lv WHERE lv.legislation_id=l.id)
      UNION ALL
      SELECT am.amended_legislation_id,l.title_ar,'UNLINKED_AMENDMENT','ERROR','عملية تعديل بلا أثر مادة مربوط'
      FROM amendment_operations ao JOIN amendments am ON am.id=ao.amendment_id
      JOIN legislations l ON l.id=am.amended_legislation_id
      WHERE NOT EXISTS (SELECT 1 FROM article_modifications amod WHERE amod.operation_id=ao.id)
      UNION ALL
      SELECT a.legislation_id,l.title_ar,'TEMPORAL_OVERLAP','ERROR','تداخل فترات نفاذ نسخ مادة'
      FROM article_versions first_version JOIN article_versions second_version
      ON second_version.article_id=first_version.article_id AND second_version.id>first_version.id
      JOIN articles a ON a.id=first_version.article_id JOIN legislations l ON l.id=a.legislation_id
      WHERE first_version.valid_from<COALESCE(second_version.valid_to,'9999-12-31')
      AND second_version.valid_from<COALESCE(first_version.valid_to,'9999-12-31')
      GROUP BY a.legislation_id,l.title_ar
      UNION ALL
      SELECT lv.legislation_id,l.title_ar,'MISSING_STORAGE_KEY','ERROR','المصدر بلا مفتاح تخزين صالح'
      FROM legislation_versions lv JOIN source_documents sd ON sd.id=lv.source_document_id
      JOIN legislations l ON l.id=lv.legislation_id WHERE sd.storage_key IS NULL OR sd.storage_key=''`);
    return { stored, live };
  }

  async resolveQuality(
    id: string,
    status: "RESOLVED" | "IGNORED",
    note: string,
    actor: AuthUser,
  ) {
    const result = await this.db.query(
      "UPDATE quality_issues SET status=?,resolved_at=NOW(3),resolved_by=?,resolution_note=? WHERE id=? AND status='OPEN'",
      [status, actor.id, note.trim(), id],
    );
    if (!result.affectedRows)
      throw new NotFoundException("مشكلة الجودة غير موجودة أو مغلقة.");
    await this.db.query(
      `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,'RESOLVE_QUALITY_ISSUE','QUALITY_ISSUE',?,?,?)`,
      [randomUUID(), actor.id, id, JSON.stringify({ status }), note.trim()],
    );
    return { id, status };
  }

  async reports() {
    return this.db.query(
      `SELECT rp.id,rp.entity_type entityType,rp.entity_id entityId,rp.category,rp.details,rp.status,rp.created_at createdAt,u.display_name reporterName FROM reports rp LEFT JOIN users u ON u.id=rp.reporter_id ORDER BY FIELD(rp.status,'OPEN','TRIAGED','RESOLVED','REJECTED'),rp.created_at DESC`,
    );
  }
  async updateReport(
    id: string,
    status: "TRIAGED" | "RESOLVED" | "REJECTED",
    reason: string,
    actor: AuthUser,
  ) {
    const rows = await this.db.query("SELECT status FROM reports WHERE id=?", [
      id,
    ]);
    if (!rows[0]) throw new NotFoundException("البلاغ غير موجود.");
    await this.db.query("UPDATE reports SET status=? WHERE id=?", [status, id]);
    await this.db.query(
      `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,'UPDATE_REPORT','REPORT',?,?,?,?)`,
      [
        randomUUID(),
        actor.id,
        id,
        JSON.stringify(rows[0]),
        JSON.stringify({ status }),
        reason.trim(),
      ],
    );
    return { id, status };
  }

  private async assertPublishable(
    manager: EntityManager,
    id: string,
    target: string,
  ) {
    const rows = await manager.query(
      `SELECT l.title_ar,l.type_id,l.authority_id,l.year,l.effective_from,
      lv.id versionId,sd.extraction_status extractionStatus,sd.reviewed_at reviewedAt
      FROM legislations l LEFT JOIN legislation_versions lv ON lv.legislation_id=l.id
      LEFT JOIN source_documents sd ON sd.id=lv.source_document_id WHERE l.id=? ORDER BY lv.version_no DESC LIMIT 1`,
      [id],
    );
    const item = rows[0];
    if (
      !item?.title_ar ||
      !item.type_id ||
      !item.authority_id ||
      !item.year ||
      !item.versionId
    )
      throw new ConflictException(
        "البيانات الأساسية والمصدر مطلوبة قبل المتابعة.",
      );
    if (
      target === "PUBLISHED" &&
      (!item.effective_from ||
        item.extractionStatus !== "REVIEWED" ||
        !item.reviewedAt)
    )
      throw new ConflictException(
        "لا ينشر التشريع قبل تحديد النفاذ ومراجعة المصدر والنص المستخرج أو OCR.",
      );
  }

  private async publishCurrentDraftArticles(
    manager: EntityManager,
    legislationId: string,
  ) {
    const currentVersions = (await manager.query(
      `SELECT a.id articleId,av.id versionId,av.status
       FROM articles a LEFT JOIN article_versions av ON av.article_id=a.id
        AND av.version_no=(SELECT MAX(latest.version_no)
          FROM article_versions latest WHERE latest.article_id=a.id)
       WHERE a.legislation_id=? ORDER BY a.sort_key,a.id FOR UPDATE`,
      [legislationId],
    )) as Array<{
      articleId: string;
      versionId: string | null;
      status: string | null;
    }>;
    if (currentVersions.some((version) => !version.versionId))
      throw new ConflictException(
        "لا يمكن نشر التشريع لأن إحدى مواده بلا نسخة نصية حالية.",
      );
    const draftVersionIds = currentVersions
      .filter((version) => version.status === "DRAFT")
      .map((version) => version.versionId!);
    let publishedArticleCount = 0;
    for (let offset = 0; offset < draftVersionIds.length; offset += 500) {
      const chunk = draftVersionIds.slice(offset, offset + 500);
      const result = await manager.query(
        `UPDATE article_versions SET status='PUBLISHED',verified_at=COALESCE(verified_at,NOW(3))
         WHERE status='DRAFT' AND id IN (${chunk.map(() => "?").join(",")})`,
        chunk,
      );
      publishedArticleCount += Number(result.affectedRows ?? 0);
    }
    if (publishedArticleCount !== draftVersionIds.length)
      throw new ConflictException(
        "تعارضت حالة مواد التشريع أثناء النشر؛ لم تحفظ أي تغييرات.",
      );
    return publishedArticleCount;
  }

  private async assertSeparation(
    manager: EntityManager,
    id: string,
    actor: AuthUser,
    duty: string,
  ) {
    if (duty === "APPROVE") {
      const own = await manager.query(
        "SELECT 1 FROM content_responsibilities WHERE legislation_id=? AND user_id=? AND duty IN ('IMPORT','EDIT')",
        [id, actor.id],
      );
      return assertWorkflowPolicy(
        manager,
        "LEGISLATION_SELF_APPROVAL",
        actor,
        Boolean(own[0]),
      );
    }
    if (duty === "PUBLISH") {
      const own = await manager.query(
        "SELECT 1 FROM content_responsibilities WHERE legislation_id=? AND user_id=? AND duty IN ('IMPORT','EDIT','REVIEW','APPROVE')",
        [id, actor.id],
      );
      return assertWorkflowPolicy(
        manager,
        "LEGISLATION_SELF_PUBLICATION",
        actor,
        Boolean(own[0]),
      );
    }
    return "POLICY_ENFORCED";
  }

  private async ensureResponsibility(
    manager: EntityManager,
    id: string,
    userId: string,
    duty: string,
  ) {
    await manager.query(
      `INSERT IGNORE INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,?)`,
      [id, userId, duty],
    );
  }

  private async auditWith(
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
      `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason)
      VALUES (?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        actorId,
        action,
        entityType,
        entityId,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        reason,
      ],
    );
  }
}
