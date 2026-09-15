import { enforceOperationPolicy } from "./workflow-policies.js";
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
import { AuthorizationPolicyService } from "./authorization-policy.service.js";

type Target = {
  table: string;
  resource: string;
  view: string;
  active?: string;
  law?: string;
};
// Identifiers are exclusively from this whitelist, never from request input.
const targets: Record<string, Target> = {
  legislations: {
    table: "legislations",
    resource: "legislation",
    view: "legislation.view",
  },
  articles: {
    table: "articles",
    resource: "article",
    view: "legislation.view",
    law: "legislation_id",
  },
  structure: {
    table: "structure_nodes",
    resource: "structure",
    view: "legislation.view",
    law: "legislation_id",
  },
  annexes: {
    table: "annexes",
    resource: "annex",
    view: "legislation.view",
    law: "legislation_id",
  },
  relations: {
    table: "legal_relations",
    resource: "relation",
    view: "legislation.view",
    law: "source_legislation_id",
  },
  sources: {
    table: "source_documents",
    resource: "source",
    view: "source.view",
  },
  imports: {
    table: "source_imports",
    resource: "source",
    view: "source.view",
  },
  amendments: {
    table: "amendments",
    resource: "amendment",
    view: "amendment.view",
    law: "amended_legislation_id",
  },
  "amendment-operations": {
    table: "amendment_operations",
    resource: "amendment",
    view: "amendment.view",
  },
  gazettes: {
    table: "gazette_issues",
    resource: "reference",
    view: "reference.view",
  },
  "synonym-sets": {
    table: "search_synonym_sets",
    resource: "search.synonym_set",
    view: "search.synonym.view",
  },
  types: {
    table: "legislation_types",
    resource: "reference",
    view: "reference.view",
  },
  authorities: {
    table: "authorities",
    resource: "reference",
    view: "reference.view",
  },
  subjects: {
    table: "subjects",
    resource: "reference",
    view: "reference.view",
  },
  navigation: {
    table: "navigation_items",
    resource: "navigation",
    view: "settings.view",
    active: "is_visible",
  },
  pages: {
    table: "public_pages",
    resource: "public_page",
    view: "settings.view",
  },
  users: { table: "users", resource: "user", view: "user.view" },
  synonyms: {
    table: "search_synonyms",
    resource: "search.synonym",
    view: "search.synonym.view",
  },
};

export function requireExactPermission(actor: AuthUser, permission: string) {
  if (!actor.permissions.includes(permission))
    throw new ForbiddenException(
      "ليست لديك الصلاحية الدقيقة المطلوبة لتنفيذ هذه العملية.",
    );
  const detail = actor.permissionDetails?.find(
    (item) => item.code === permission,
  );
  if (detail && (!detail.allowed || detail.scope !== "ALL"))
    throw new ForbiddenException(
      "نطاق الصلاحية لا يسمح بالعملية على هذا السجل.",
    );
}

@Injectable()
export class LifecycleService {
  constructor(
    @Inject(DATABASE) private readonly db: DataSource,
    @Inject(AuthorizationPolicyService)
    private readonly policy: AuthorizationPolicyService,
  ) {}
  private target(kind: string) {
    const target = Object.hasOwn(targets, kind) ? targets[kind] : undefined;
    if (!target) throw new BadRequestException("نوع السجل غير معروف.");
    return target;
  }
  async state(kind: string, id: string, actor: AuthUser) {
    const t = this.target(kind);
    requireExactPermission(actor, t.view);
    const [row] = await this.db.query(
      `SELECT ${t.active ?? "is_active"} isActive,deleted_at deletedAt FROM ${t.table} WHERE id=?`,
      [id],
    );
    if (!row || row.deletedAt)
      throw new NotFoundException("السجل غير موجود أو محذوف.");
    return { id, isActive: Boolean(row.isActive), resource: t.resource };
  }
  async change(
    kind: string,
    id: string,
    action: "delete" | "enable" | "disable",
    actor: AuthUser,
    reason: string,
  ) {
    const t = this.target(kind);
    requireExactPermission(actor, `${t.resource}.${action}`);
    if (reason.trim().length < 3)
      throw new BadRequestException("سبب الإجراء مطلوب.");
    return this.db.transaction(async (m) => {
      const [row] = await m.query(
        `SELECT * FROM ${t.table} WHERE id=? FOR UPDATE`,
        [id],
      );
      if (!row || row.deleted_at)
        throw new NotFoundException("السجل غير موجود أو محذوف.");
      let lawId: string | undefined =
        kind === "legislations" ? id : t.law ? row[t.law] : undefined;
      if (kind === "users") {
        await this.policy.assertCanChangeUserState(
          m,
          actor,
          id,
          action === "enable",
        );
      }
      if (kind === "amendment-operations") {
        const [parent] = await m.query(
          "SELECT * FROM amendments WHERE id=? FOR UPDATE",
          [row.amendment_id],
        );
        if (!parent || parent.deleted_at)
          throw new ConflictException(
            "تعدل عناصر وثيقة التعديل في المسودة فقط؛ أعد المراجعة بعد استكمالها.",
          );
        if (parent.status === "PUBLISHED") {
          await enforceOperationPolicy(
            m,
            action === "delete"
              ? "DELETE_AMENDMENT_HISTORY"
              : "ACTIVE_AMENDMENT_OPERATIONS",
            actor,
            true,
            id,
            reason,
          );
        } else if (parent.status !== "DRAFT") {
          await enforceOperationPolicy(
            m,
            "EDIT_AMENDMENT_REVIEWED",
            actor,
            true,
            id,
            reason,
          );
          await m.query(
            "UPDATE amendments SET status='DRAFT',reviewed_by=NULL,reviewed_at=NULL WHERE id=?",
            [parent.id],
          );
        }
        lawId = parent.amended_legislation_id;
      }
      if (kind === "synonyms" && action !== "delete") {
        const [set] = await m.query(
          "SELECT status FROM search_synonym_sets WHERE id=? FOR UPDATE",
          [row.set_id],
        );
        if (!set) throw new NotFoundException("القاموس غير موجود.");
        await enforceOperationPolicy(
          m,
          "ACTIVE_SYNONYM_HISTORY",
          actor,
          set.status !== "DRAFT",
          id,
          reason,
        );
      }
      if (action === "delete")
        await this.assertDeletable(m, kind, id, row, actor, reason, lawId);
      if (action === "enable") {
        if (lawId && kind !== "legislations") {
          const [law] = await m.query(
            "SELECT deleted_at,is_active FROM legislations WHERE id=? FOR UPDATE",
            [lawId],
          );
          if (!law || law.deleted_at)
            throw new ConflictException("التشريع الأصلي محذوف أو غير موجود.");
          await enforceOperationPolicy(
            m,
            "ACTIVE_PARENT",
            actor,
            !law.is_active,
            id,
            reason,
          );
        }
        if ((kind === "subjects" || kind === "structure") && row.parent_id) {
          const [parent] = await m.query(
            `SELECT is_active,deleted_at FROM ${t.table} WHERE id=? FOR UPDATE`,
            [row.parent_id],
          );
          if (!parent || parent.deleted_at)
            throw new ConflictException("العنصر الأب محذوف أو غير موجود.");
          await enforceOperationPolicy(
            m,
            "ACTIVE_PARENT",
            actor,
            !parent.is_active,
            id,
            reason,
          );
        }
      }
      // A disabled hierarchy node cannot conceal or orphan active children.
      if (
        action === "disable" &&
        (kind === "subjects" || kind === "structure")
      ) {
        await this.blockIf(
          m,
          `SELECT id FROM ${t.table} WHERE parent_id=? AND deleted_at IS NULL AND is_active=TRUE LIMIT 1`,
          id,
          "عطّل العناصر التابعة أولاً مع الحفاظ على العلاقات.",
        );
        if (kind === "structure")
          await this.blockIf(
            m,
            "SELECT id FROM articles WHERE structure_node_id=? AND deleted_at IS NULL AND is_active=TRUE LIMIT 1",
            id,
            "انقل المواد المرتبطة أو عطّلها قبل تعطيل العقدة.",
          );
      }
      const active = action === "enable";
      await m.query(
        `UPDATE ${t.table} SET ${t.active ?? "is_active"}=?${action === "delete" ? ",deleted_at=NOW(3)" : ""} WHERE id=?`,
        [active, id],
      );
      if (kind === "amendment-operations")
        await m.query("UPDATE amendments SET revision=revision+1 WHERE id=?", [
          row.amendment_id,
        ]);
      if (kind === "users")
        await m.query(
          "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL",
          [id],
        );
      if (lawId)
        await m.query(
          "INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)",
          [randomUUID(), JSON.stringify({ legislationId: lawId })],
        );
      // Do not copy credentials or source storage paths into lifecycle audit records.
      const before = {
        isActive: Boolean(row[t.active ?? "is_active"]),
        deletedAt: row.deleted_at,
        status: row.status,
      };
      const after = {
        isActive: active,
        deleted: action === "delete",
        status: row.status,
      };
      await m.query(
        "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?)",
        [
          randomUUID(),
          actor.id,
          `${action.toUpperCase()}_RECORD`,
          t.resource.toUpperCase(),
          id,
          JSON.stringify(before),
          JSON.stringify(after),
          reason.trim(),
        ],
      );
      return { id, ...after };
    });
  }
  private async blockIf(
    m: EntityManager,
    sql: string,
    id: string,
    message: string,
  ) {
    if ((await m.query(sql, [id])).length) throw new ConflictException(message);
  }
  private async assertDeletable(
    m: EntityManager,
    kind: string,
    id: string,
    row: Record<string, any>,
    actor: AuthUser,
    reason: string,
    lawId?: string,
  ) {
    if (kind === "legislations" || ["articles", "structure"].includes(kind)) {
      const [law] = await m.query(
        "SELECT status FROM legislations WHERE id=? FOR UPDATE",
        [lawId],
      );
      if (!law) throw new NotFoundException("التشريع الأصلي غير موجود.");
      await enforceOperationPolicy(
        m,
        "DELETE_LEGISLATION_HISTORY",
        actor,
        !["INBOX", "DRAFT"].includes(law.status),
        id,
        reason,
      );
    }
    if (kind === "legislations") {
      for (const [table, field] of [
        ["articles", "legislation_id"],
        ["structure_nodes", "legislation_id"],
        ["annexes", "legislation_id"],
        ["amendments", "amended_legislation_id"],
        ["amendments", "instrument_legislation_id"],
        ["legal_relations", "source_legislation_id"],
        ["legal_relations", "target_legislation_id"],
      ])
        await this.blockIf(
          m,
          `SELECT id FROM ${table} WHERE ${field}=? AND deleted_at IS NULL LIMIT 1`,
          id,
          "التشريع مرتبط بسجلات أخرى؛ عالج الارتباطات المسموح بها قبل الحذف أو استخدم التعطيل.",
        );
      await enforceOperationPolicy(
        m,
        "DELETE_LEGISLATION_VERSIONS",
        actor,
        Boolean(
          (
            await m.query(
              "SELECT id FROM legislation_versions WHERE legislation_id=? AND (published_at IS NOT NULL OR workflow_status NOT IN ('INBOX','DRAFT')) LIMIT 1",
              [id],
            )
          ).length,
        ),
        id,
        reason,
      );
    }
    if (kind === "articles") {
      await enforceOperationPolicy(
        m,
        "DELETE_ARTICLE_HISTORY",
        actor,
        Boolean(
          (
            await m.query(
              "SELECT id FROM article_versions WHERE article_id=? AND (status<>'DRAFT' OR previous_version_id IS NOT NULL) LIMIT 1",
              [id],
            )
          ).length,
        ),
        id,
        reason,
      );
      await this.blockIf(
        m,
        "SELECT id FROM amendment_operations WHERE target_id=? AND deleted_at IS NULL LIMIT 1",
        id,
        "المادة مرتبطة بوثيقة تعديل.",
      );
    }
    if (kind === "structure") {
      await this.blockIf(
        m,
        "SELECT id FROM structure_nodes WHERE parent_id=? AND deleted_at IS NULL LIMIT 1",
        id,
        "العقدة مرتبطة بعقد فرعية.",
      );
      await this.blockIf(
        m,
        "SELECT id FROM articles WHERE structure_node_id=? AND deleted_at IS NULL LIMIT 1",
        id,
        "انقل المواد المرتبطة أولاً.",
      );
    }
    for (const [target, code, applies] of [
      ["annexes", "DELETE_ANNEX_HISTORY", row.status !== "DRAFT"],
      ["amendments", "DELETE_AMENDMENT_HISTORY", row.status !== "DRAFT"],
      [
        "relations",
        "DELETE_REVIEWED_RELATION",
        ["REVIEWED", "PUBLISHED"].includes(row.review_status),
      ],
      ["synonym-sets", "DELETE_SYNONYM_HISTORY", row.status !== "DRAFT"],
      ["pages", "DELETE_PUBLISHED_PAGE", row.status !== "DRAFT"],
    ] as const)
      if (kind === target)
        await enforceOperationPolicy(m, code, actor, applies, id, reason);
    if (kind === "synonyms") {
      const [set] = await m.query(
        "SELECT status FROM search_synonym_sets WHERE id=?",
        [row.set_id],
      );
      if (!set) throw new NotFoundException("القاموس غير موجود.");
      await enforceOperationPolicy(
        m,
        "DELETE_SYNONYM_HISTORY",
        actor,
        set.status !== "DRAFT",
        id,
        reason,
      );
    }
    const refs: Record<string, [string, string][]> = {
      gazettes: [["legislations", "gazette_issue_id"]],
      "synonym-sets": [["search_synonyms", "set_id"]],
      types: [["legislations", "type_id"]],
      authorities: [["legislations", "authority_id"]],
      subjects: [
        ["legislation_subjects", "subject_id"],
        ["subjects", "parent_id"],
      ],
      sources: [
        ["source_import_attachments", "source_document_id"],
        ["legislation_versions", "source_document_id"],
        ["article_versions", "source_document_id"],
        ["annex_versions", "source_document_id"],
        ["amendments", "source_document_id"],
        ["legal_relations", "source_document_id"],
        ["legislation_source_documents", "source_document_id"],
      ],
    };
    for (const [table, field] of refs[kind] ?? [])
      await this.blockIf(
        m,
        `SELECT ${field} FROM ${table} WHERE ${field}=? LIMIT 1`,
        id,
        "السجل مستخدم في علاقات محفوظة ولا يمكن حذفه؛ يمكنك تعطيله.",
      );
    if (kind === "sources")
      await this.blockIf(
        m,
        "SELECT id FROM source_imports WHERE source_document_id=? AND status IN ('QUEUED','EXTRACTING','OCR_RUNNING') LIMIT 1",
        id,
        "انتظر انتهاء استخراج المصدر قبل حذفه.",
      );
  }
}
