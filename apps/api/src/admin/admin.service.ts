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

type WorkflowStatus =
  | "INBOX"
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED_FOR_PUBLISHING"
  | "PUBLISHED"
  | "ARCHIVED";

const transitions: Record<
  string,
  { from: string[]; roles: string[]; action: string; duty: string }
> = {
  DRAFT: {
    from: ["INBOX", "IN_REVIEW"],
    roles: ["DATA_ENTRY", "LEGAL_REVIEWER"],
    action: "RETURN_OR_PREPARE_DRAFT",
    duty: "EDIT",
  },
  IN_REVIEW: {
    from: ["DRAFT"],
    roles: ["DATA_ENTRY"],
    action: "SUBMIT_FOR_REVIEW",
    duty: "EDIT",
  },
  APPROVED_FOR_PUBLISHING: {
    from: ["IN_REVIEW"],
    roles: ["LEGAL_REVIEWER"],
    action: "APPROVE_FOR_PUBLISHING",
    duty: "APPROVE",
  },
  PUBLISHED: {
    from: ["APPROVED_FOR_PUBLISHING"],
    roles: ["CONTENT_MANAGER"],
    action: "PUBLISH",
    duty: "PUBLISH",
  },
  ARCHIVED: {
    from: ["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"],
    roles: ["CONTENT_MANAGER"],
    action: "ARCHIVE",
    duty: "PUBLISH",
  },
};

@Injectable()
export class AdminService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async dashboard() {
    const [workflow, imports, quality, jobs, recent] = await Promise.all([
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
      this.audit({ page: 1, pageSize: 8 }),
    ]);
    return { workflow, imports, quality, jobs, recentAudit: recent.items };
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

  async legislation(id: string) {
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
      articles,
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
        `SELECT DISTINCT sd.id,sd.original_name originalName,sd.media_type mediaType,sd.sha256,
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
        `SELECT a.id,a.current_label currentLabel,a.published_label publishedLabel,a.sort_key sortKey,av.id versionId,av.version_no versionNo,av.text_original textOriginal,av.status,DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom FROM articles a JOIN article_versions av ON av.article_id=a.id WHERE a.legislation_id=? AND av.version_no=(SELECT MAX(v.version_no) FROM article_versions v WHERE v.article_id=a.id) ORDER BY a.sort_key`,
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
      references: { types, authorities },
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

  async update(
    id: string,
    input: Record<string, unknown>,
    actor: AuthUser,
    reason: string,
  ) {
    const before = await this.legislation(id);
    if (!["INBOX", "DRAFT", "IN_REVIEW"].includes(String(before.status)))
      throw new ConflictException(
        "لا يعدّل المحتوى المنشور في مكانه؛ أنشئ إصدارًا جديدًا.",
      );
    const fields: Record<string, string> = {
      titleAr: "title_ar",
      summaryAr: "summary_ar",
      officialNumber: "official_number",
      year: "year",
      typeId: "type_id",
      authorityId: "authority_id",
      issueDate: "issue_date",
      publicationDate: "publication_date",
      effectiveFrom: "effective_from",
    };
    const entries = Object.entries(fields).filter(
      ([key]) => input[key] !== undefined,
    );
    const updatesPreamble = input.preambleText !== undefined;
    if (!entries.length && !updatesPreamble)
      throw new BadRequestException("لم ترسل حقولًا قابلة للتحديث.");
    await this.db.transaction(async (manager) => {
      if (entries.length)
        await manager.query(
          `UPDATE legislations SET ${entries.map(([, column]) => `${column}=?`).join(",")} WHERE id=?`,
          [...entries.map(([key]) => input[key] || null), id],
        );
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
    const rule = transitions[target];
    if (!rule || !actor.roles.some((role) => rule.roles.includes(role)))
      throw new ForbiddenException("لا يسمح دورك بهذا الانتقال.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM legislations WHERE id=? FOR UPDATE",
        [id],
      );
      const law = rows[0];
      if (!law) throw new NotFoundException("التشريع غير موجود.");
      if (!rule.from.includes(String(law.status)))
        throw new ConflictException(
          `لا يمكن الانتقال من ${law.status} إلى ${target}.`,
        );
      const duty =
        target === "DRAFT" && law.status === "IN_REVIEW" ? "REVIEW" : rule.duty;
      await this.assertSeparation(manager, id, actor.id, duty);
      if (
        target === "IN_REVIEW" ||
        target === "APPROVED_FOR_PUBLISHING" ||
        target === "PUBLISHED"
      )
        await this.assertPublishable(manager, id, target);
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
        { status: target },
        reason.trim(),
      );
      if (target === "PUBLISHED")
        await manager.query(
          `INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)`,
          [randomUUID(), JSON.stringify({ legislationId: id })],
        );
      return { id, from: law.status, to: target, action: rule.action };
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

  async users() {
    return this.db
      .query(`SELECT u.id,u.username,u.display_name displayName,u.is_active isActive,u.last_login_at lastLoginAt,
      u.failed_login_count failedLoginCount,GROUP_CONCAT(r.code ORDER BY r.code) roles
      FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id GROUP BY u.id ORDER BY u.username`);
  }

  async roles() {
    return this.db.query(
      "SELECT id,code,name_ar nameAr,permissions_json permissions FROM roles ORDER BY code",
    );
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
        const roles = await manager.query(
          `SELECT id,code FROM roles WHERE code IN (${input.roles.map(() => "?").join(",") || "''"})`,
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
            "INSERT INTO user_roles (user_id,role_id) VALUES (?,?)",
            [id, role.id],
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
      if (
        id === actor.id &&
        previous.some((r: { code: string }) => r.code === "SYSTEM_ADMIN") &&
        !roleCodes.includes("SYSTEM_ADMIN")
      )
        throw new ConflictException(
          "لا يمكنك إزالة دور مدير النظام من حسابك الحالي.",
        );
      const roles = await manager.query(
        `SELECT id,code FROM roles WHERE code IN (${roleCodes.map(() => "?").join(",") || "''"})`,
        roleCodes,
      );
      if (roles.length !== new Set(roleCodes).size)
        throw new BadRequestException("يتضمن الطلب دورًا غير معروف.");
      await manager.query("DELETE FROM user_roles WHERE user_id=?", [id]);
      for (const role of roles)
        await manager.query(
          "INSERT INTO user_roles (user_id,role_id) VALUES (?,?)",
          [id, role.id],
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
    if (id === actor.id && !active)
      throw new ConflictException("لا يمكنك تعطيل حسابك الحالي.");
    const rows = await this.db.query(
      "SELECT is_active isActive FROM users WHERE id=?",
      [id],
    );
    if (!rows[0]) throw new NotFoundException("المستخدم غير موجود.");
    await this.db.transaction(async (manager) => {
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

  private async assertSeparation(
    manager: EntityManager,
    id: string,
    userId: string,
    duty: string,
  ) {
    if (duty === "APPROVE") {
      const own = await manager.query(
        "SELECT 1 FROM content_responsibilities WHERE legislation_id=? AND user_id=? AND duty IN ('IMPORT','EDIT')",
        [id, userId],
      );
      if (own[0])
        throw new ForbiddenException(
          "لا يجوز لمن استورد أو حرر المحتوى أن يعتمد التشريع نفسه.",
        );
    }
    if (duty === "PUBLISH") {
      const own = await manager.query(
        "SELECT 1 FROM content_responsibilities WHERE legislation_id=? AND user_id=? AND duty IN ('IMPORT','EDIT','REVIEW','APPROVE')",
        [id, userId],
      );
      if (own[0])
        throw new ForbiddenException(
          "لا يجوز للمراجع أو المعتمد نشر التشريع نفسه.",
        );
    }
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
