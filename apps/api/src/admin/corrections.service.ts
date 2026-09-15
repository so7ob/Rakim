import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import type { AuthUser } from "../auth/auth.types.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";
import { requireExactPermission } from "./lifecycle.service.js";
import {
  enforceOperationPolicy,
  evaluateWorkflowPolicy,
  WORKFLOW_POLICIES,
} from "./workflow-policies.js";
import {
  annexTypeOption,
  assertAnnexContentFormat,
  parseStructuredTable,
} from "../annexes/annex-content.js";

export const correctionKinds = {
  ARTICLE: {
    table: "articles",
    versions: "article_versions",
    key: "article_id",
    permission: "article.update",
    policy: "EDIT_ARTICLE_HISTORY",
  },
  LEGISLATION: {
    table: "legislations",
    versions: "legislation_versions",
    key: "legislation_id",
    permission: "legislation.update",
    policy: "EDIT_LEGISLATION_HISTORY",
  },
  ANNEX: {
    table: "annexes",
    versions: "annex_versions",
    key: "annex_id",
    permission: "annex.update",
    policy: "EDIT_ANNEX_HISTORY",
  },
} as const;
export type CorrectionKind = keyof typeof correctionKinds;
const parse = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
const day = (value: any) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function spec(kind: string) {
  if (!Object.hasOwn(correctionKinds, kind))
    throw new BadRequestException("نوع التصحيح غير معروف.");
  return correctionKinds[kind as CorrectionKind];
}
async function target(m: EntityManager, kind: CorrectionKind, id: string) {
  const def = spec(kind);
  const [record] = await m.query(
    `SELECT * FROM ${def.table} WHERE id=? AND deleted_at IS NULL FOR UPDATE`,
    [id],
  );
  if (!record) throw new NotFoundException("السجل المراد تصحيحه غير موجود.");
  const lawId = kind === "LEGISLATION" ? id : record.legislation_id;
  const [law] = await m.query(
    "SELECT * FROM legislations WHERE id=? AND deleted_at IS NULL FOR UPDATE",
    [lawId],
  );
  if (
    !law ||
    !["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"].includes(law.status)
  )
    throw new ConflictException("التصحيح متاح لمحتوى تشريع منشور فقط.");
  const [version] = await m.query(
    `SELECT * FROM ${def.versions} WHERE ${def.key}=? ORDER BY version_no DESC LIMIT 1 FOR UPDATE`,
    [id],
  );
  if (
    !version ||
    (kind === "ARTICLE" && version.status !== "PUBLISHED") ||
    (kind === "LEGISLATION" && version.workflow_status !== "PUBLISHED") ||
    (kind === "ANNEX" && record.status !== "PUBLISHED")
  )
    throw new ConflictException("يلزم وجود نسخة منشورة حالية لإنشاء التصحيح.");
  const content =
    kind === "ARTICLE"
      ? {
          text: version.text_original,
          currentLabel: record.current_label,
          publishedLabel: record.published_label,
          sortKey: record.sort_key,
          structureNodeId: record.structure_node_id,
        }
      : kind === "LEGISLATION"
        ? { preambleText: version.preamble_text ?? "" }
        : {
            titleAr: record.title_ar,
            annexType: record.annex_type,
            contentFormat: version.content_format,
            textContent: version.text_content ?? null,
            structuredTable:
              version.structured_table_json == null
                ? null
                : parse(version.structured_table_json),
            sourceDocumentId: version.source_document_id,
          };
  return {
    record,
    law,
    version,
    lawId,
    content,
    hash: fingerprint({ version, content }),
  };
}
function validatePayload(
  kind: CorrectionKind,
  payload: Record<string, unknown>,
) {
  const allowed =
    kind === "ARTICLE"
      ? ["text", "currentLabel", "publishedLabel", "sortKey", "structureNodeId"]
      : kind === "LEGISLATION"
        ? ["preambleText"]
        : [
            "titleAr",
            "annexType",
            "contentFormat",
            "textContent",
            "structuredTable",
            "sourceDocumentId",
          ];
  if (
    !Object.keys(payload).length ||
    Object.keys(payload).some((key) => !allowed.includes(key))
  )
    throw new BadRequestException("حقول التصحيح غير صالحة.");
  if (kind === "ANNEX") {
    annexTypeOption(String(payload.annexType));
    const format = assertAnnexContentFormat(
      String(payload.annexType),
      String(payload.contentFormat),
    );
    if (
      typeof payload.titleAr !== "string" ||
      !payload.titleAr.trim() ||
      payload.titleAr.length > 1000 ||
      typeof payload.sourceDocumentId !== "string" ||
      !payload.sourceDocumentId
    )
      throw new BadRequestException("بيانات تصحيح الملحق غير صالحة.");
    if (
      format === "TEXT" &&
      (typeof payload.textContent !== "string" || !payload.textContent.trim())
    )
      throw new BadRequestException("نص الملحق مطلوب.");
    if (format === "STRUCTURED_TABLE")
      parseStructuredTable(payload.structuredTable);
    return;
  }
  for (const [key, value] of Object.entries(payload)) {
    if (key === "structureNodeId" && value === null) continue;
    if (typeof value !== "string" || (key !== "preambleText" && !value.trim()))
      throw new BadRequestException("قيمة حقل التصحيح غير صالحة.");
    if (
      ["currentLabel", "publishedLabel", "sortKey"].includes(key) &&
      value.length > 120
    )
      throw new BadRequestException("بيانات المادة تتجاوز الطول المسموح.");
    if (key === "titleAr" && value.length > 1000)
      throw new BadRequestException("عنوان الملحق طويل جداً.");
  }
}
export async function stageCorrection(
  m: EntityManager,
  kind: CorrectionKind,
  id: string,
  payload: Record<string, unknown>,
  effectiveFrom: string,
  actor: AuthUser,
  reason: string,
) {
  const def = spec(kind);
  requireExactPermission(actor, "legislation.view");
  requireExactPermission(actor, def.permission);
  if (reason.trim().length < 3)
    throw new BadRequestException("سبب التصحيح مطلوب.");
  const base = await target(m, kind, id);
  const normalizedPayload =
    kind === "ANNEX" ? { ...base.content, ...payload } : payload;
  validatePayload(kind, normalizedPayload);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
    !Number.isFinite(Date.parse(effectiveFrom)) ||
    day(new Date(effectiveFrom)) !== effectiveFrom ||
    effectiveFrom <= day(base.version.valid_from) ||
    effectiveFrom > day(new Date()) ||
    (base.version.valid_to && effectiveFrom >= day(base.version.valid_to))
  )
    throw new BadRequestException(
      "تاريخ التصحيح يجب أن يلي بداية النسخة ويقع ضمن مدتها وألا يتجاوز اليوم.",
    );
  const policyCheck = await enforceOperationPolicy(
    m,
    def.policy,
    actor,
    true,
    id,
    reason,
  );
  if (kind === "ANNEX") {
    const [source] = await m.query(
      `SELECT sd.media_type FROM source_documents sd
      WHERE sd.id=? AND sd.is_active=TRUE AND sd.deleted_at IS NULL AND (
        EXISTS(SELECT 1 FROM legislation_source_documents lsd WHERE lsd.source_document_id=sd.id AND lsd.legislation_id=?)
        OR (?=? AND EXISTS(
          SELECT 1 FROM annex_versions existing_av WHERE existing_av.id=? AND existing_av.source_document_id=sd.id
        ))
      )`,
      [
        normalizedPayload.sourceDocumentId,
        base.lawId,
        normalizedPayload.sourceDocumentId,
        base.version.source_document_id,
        base.version.id,
      ],
    );
    if (!source)
      throw new BadRequestException(
        "المصدر المحدد غير فعال أو غير مرتبط بهذا التشريع.",
      );
    if (
      normalizedPayload.contentFormat === "FILE" &&
      !["application/pdf", "image/png", "image/jpeg"].includes(
        source.media_type,
      )
    ) {
      const [existingFile] =
        normalizedPayload.sourceDocumentId === base.version.source_document_id
          ? await m.query(
              "SELECT id FROM annex_files WHERE annex_version_id=? AND media_type IN ('application/pdf','image/png','image/jpeg') LIMIT 1",
              [base.version.id],
            )
          : [];
      if (!existingFile)
        throw new BadRequestException(
          "محتوى الملف يجب أن يكون PDF أو PNG أو JPEG.",
        );
    }
  }
  if (
    (
      await m.query(
        "SELECT id FROM content_corrections WHERE target_kind=? AND target_id=? AND status IN ('DRAFT','APPROVED') FOR UPDATE",
        [kind, id],
      )
    ).length
  )
    throw new ConflictException(
      "توجد مسودة تصحيح مفتوحة لهذا السجل؛ عالجها أولاً.",
    );
  const correctionId = randomUUID();
  await m.query(
    `INSERT INTO content_corrections
    (id,legislation_id,target_kind,target_id,base_version_id,base_hash,before_json,payload_json,effective_from,source_document_id,created_by,reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      correctionId,
      base.lawId,
      kind,
      id,
      base.version.id,
      base.hash,
      JSON.stringify(base.content),
      JSON.stringify(normalizedPayload),
      effectiveFrom,
      kind === "ANNEX"
        ? normalizedPayload.sourceDocumentId
        : base.version.source_document_id,
      actor.id,
      reason.trim(),
    ],
  );
  await correctionAudit(
    m,
    actor,
    correctionId,
    "CREATE_CORRECTION",
    {
      targetKind: kind,
      targetId: id,
      policyChecks: [policyCheck],
      payload: normalizedPayload,
    },
    reason,
  );
  return { id, correctionId, status: "DRAFT", policyChecks: [policyCheck] };
}
async function correctionAudit(
  m: EntityManager,
  actor: AuthUser,
  id: string,
  action: string,
  after: unknown,
  reason: string,
) {
  await m.query(
    "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,?,'CONTENT_CORRECTION',?,?,?)",
    [randomUUID(), actor.id, action, id, JSON.stringify(after), reason],
  );
}
@Injectable()
export class CorrectionsService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}
  async decisions(actor: AuthUser) {
    return Promise.all(
      WORKFLOW_POLICIES.filter(
        (policy) =>
          actor.permissions.includes("workflow_policy.view") ||
          policy.requiredPermissions.some((permission) =>
            actor.permissions.includes(permission),
          ),
      ).map((policy) =>
        evaluateWorkflowPolicy(this.db.manager, policy.code, actor, true),
      ),
    );
  }
  async list(lawId: string, actor: AuthUser) {
    requireExactPermission(actor, "legislation.view");
    const rows = await this.db.query(
      "SELECT c.* FROM content_corrections c JOIN legislations l ON l.id=c.legislation_id WHERE c.legislation_id=? AND l.deleted_at IS NULL ORDER BY c.created_at DESC",
      [lawId],
    );
    return rows.map((row: any) => ({
      ...row,
      before: parse(row.before_json),
      payload: parse(row.payload_json),
      canApprove:
        row.status === "DRAFT" &&
        actor.permissions.includes("legislation.approve"),
      canPublish:
        row.status === "APPROVED" &&
        actor.permissions.includes("legislation.publish") &&
        (row.target_kind !== "ANNEX" ||
          actor.permissions.includes("annex.publish")),
      canCancel:
        ["DRAFT", "APPROVED"].includes(row.status) &&
        actor.permissions.includes(spec(row.target_kind).permission),
    }));
  }
  async available(lawId: string, actor: AuthUser) {
    requireExactPermission(actor, "legislation.view");
    const checks = await Promise.all(
      Object.entries(correctionKinds).map(async ([kind, def]) => ({
        kind,
        permission: def.permission,
        policyCheck: await evaluateWorkflowPolicy(
          this.db.manager,
          def.policy,
          actor,
          true,
        ),
        hasPermission: actor.permissions.includes(def.permission),
      })),
    );
    return checks.map((item) => ({
      ...item,
      allowed: item.hasPermission && item.policyCheck.allowed,
    }));
  }
  async create(
    kind: CorrectionKind,
    id: string,
    payload: Record<string, unknown>,
    date: string,
    actor: AuthUser,
    reason: string,
  ) {
    spec(kind);
    return this.db.transaction((m) =>
      stageCorrection(m, kind, id, payload, date, actor, reason),
    );
  }
  async transition(
    id: string,
    action: "approve" | "publish" | "cancel",
    actor: AuthUser,
    reason: string,
  ) {
    requireExactPermission(actor, "legislation.view");
    if (reason.trim().length < 3)
      throw new BadRequestException("سبب الإجراء مطلوب.");
    return this.db.transaction(async (m) => {
      const [draft] = await m.query(
        "SELECT * FROM content_corrections WHERE id=? FOR UPDATE",
        [id],
      );
      if (!draft) throw new NotFoundException("مسودة التصحيح غير موجودة.");
      const kind = draft.target_kind as CorrectionKind,
        def = spec(kind);
      requireExactPermission(
        actor,
        action === "cancel"
          ? def.permission
          : action === "approve"
            ? "legislation.approve"
            : "legislation.publish",
      );
      if (action === "cancel") {
        if (!["DRAFT", "APPROVED"].includes(draft.status))
          throw new ConflictException("التصحيح منتهٍ بالفعل.");
        await m.query(
          "UPDATE content_corrections SET status='CANCELLED' WHERE id=?",
          [id],
        );
        await correctionAudit(
          m,
          actor,
          id,
          "CANCEL_CORRECTION",
          { status: "CANCELLED" },
          reason,
        );
        return { id, status: "CANCELLED" };
      }
      if (
        (action === "approve" && draft.status !== "DRAFT") ||
        (action === "publish" && draft.status !== "APPROVED")
      )
        throw new ConflictException("حالة التصحيح لا تسمح بهذا الإجراء.");
      const base = await target(m, kind, draft.target_id);
      if (base.hash !== draft.base_hash)
        throw new ConflictException(
          "تغير الأصل منذ إعداد التصحيح؛ ألغِ المسودة وأنشئ تصحيحًا محدثًا.",
        );
      await enforceOperationPolicy(
        m,
        "ACTIVE_LEGISLATION_WORKFLOW",
        actor,
        !base.law.is_active,
        id,
        reason,
      );
      const contributors = await m.query(
        `SELECT 1 FROM content_responsibilities WHERE legislation_id=? AND user_id=? AND duty IN (${action === "approve" ? "'IMPORT','EDIT'" : "'IMPORT','EDIT','REVIEW','APPROVE'"}) LIMIT 1`,
        [base.lawId, actor.id],
      );
      const checks = [
        await enforceOperationPolicy(
          m,
          action === "approve"
            ? "LEGISLATION_SELF_APPROVAL"
            : "LEGISLATION_SELF_PUBLICATION",
          actor,
          contributors.length > 0 ||
            draft.created_by === actor.id ||
            (action === "publish" && draft.approved_by === actor.id),
          id,
          reason,
        ),
      ];
      if (action === "approve") {
        await m.query(
          "UPDATE content_corrections SET status='APPROVED',approved_by=? WHERE id=?",
          [actor.id, id],
        );
        await correctionAudit(
          m,
          actor,
          id,
          "APPROVE_CORRECTION",
          { status: "APPROVED", policyChecks: checks },
          reason,
        );
        return { id, status: "APPROVED" };
      }
      if (kind === "ANNEX") requireExactPermission(actor, "annex.publish");
      const [source] = await m.query(
        "SELECT extraction_status,reviewed_at FROM source_documents WHERE id=? AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE",
        [draft.source_document_id],
      );
      if (!source) throw new ConflictException("مصدر التصحيح غير متاح.");
      checks.push(
        await enforceOperationPolicy(
          m,
          kind === "ANNEX"
            ? "ANNEX_REVIEWED_SOURCE"
            : "LEGISLATION_REVIEWED_SOURCE",
          actor,
          source.extraction_status !== "REVIEWED" || !source.reviewed_at,
          id,
          reason,
        ),
      );
      const payload = { ...base.content, ...parse(draft.payload_json) };
      const date = day(draft.effective_from),
        versionId = randomUUID();
      await m.query(`UPDATE ${def.versions} SET valid_to=? WHERE id=?`, [
        date,
        base.version.id,
      ]);
      if (kind === "ARTICLE") {
        if (
          payload.structureNodeId &&
          !(
            await m.query(
              "SELECT id FROM structure_nodes WHERE id=? AND legislation_id=? AND deleted_at IS NULL",
              [payload.structureNodeId, base.lawId],
            )
          ).length
        )
          throw new BadRequestException("العقدة ليست ضمن التشريع.");
        if (
          (
            await m.query(
              "SELECT id FROM articles WHERE legislation_id=? AND sort_key=? AND id<>? AND deleted_at IS NULL",
              [base.lawId, payload.sortKey, draft.target_id],
            )
          ).length
        )
          throw new ConflictException("ترتيب المادة مستخدم.");
        await m.query(
          `INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,valid_to,status,source_document_id,previous_version_id,verified_at)
        VALUES (?,?,?,?,?,?,?,?,'PUBLISHED',?,?,NOW(3))`,
          [
            versionId,
            draft.target_id,
            Number(base.version.version_no) + 1,
            payload.text,
            payload.text,
            normalizeArabic(payload.text),
            date,
            base.version.valid_to,
            draft.source_document_id,
            base.version.id,
          ],
        );
        await m.query(
          "UPDATE articles SET current_label=?,published_label=?,sort_key=?,structure_node_id=? WHERE id=?",
          [
            payload.currentLabel,
            payload.publishedLabel,
            payload.sortKey,
            payload.structureNodeId,
            draft.target_id,
          ],
        );
      } else if (kind === "LEGISLATION") {
        await m.query(
          `INSERT INTO legislation_versions (id,legislation_id,version_no,workflow_status,content_kind,source_document_id,valid_from,valid_to,previous_version_id,published_at,preamble_text)
        VALUES (?,?,?,'PUBLISHED',?,?,?,?,?,NOW(3),?)`,
          [
            versionId,
            draft.target_id,
            Number(base.version.version_no) + 1,
            base.version.content_kind,
            draft.source_document_id,
            date,
            base.version.valid_to,
            base.version.id,
            payload.preambleText,
          ],
        );
      } else {
        await m.query(
          `INSERT INTO annex_versions (id,annex_id,version_no,valid_from,valid_to,source_document_id,previous_version_id,content_format,text_content,structured_table_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            versionId,
            draft.target_id,
            Number(base.version.version_no) + 1,
            date,
            base.version.valid_to,
            draft.source_document_id,
            base.version.id,
            payload.contentFormat,
            payload.contentFormat === "TEXT" ? payload.textContent : null,
            payload.contentFormat === "STRUCTURED_TABLE"
              ? JSON.stringify(payload.structuredTable)
              : null,
          ],
        );
        await m.query("UPDATE annexes SET title_ar=?,annex_type=? WHERE id=?", [
          payload.titleAr,
          payload.annexType,
          draft.target_id,
        ]);
      }
      await m.query(
        "UPDATE content_corrections SET status='PUBLISHED',published_by=?,published_at=NOW(3),published_version_id=? WHERE id=?",
        [actor.id, versionId, id],
      );
      await m.query(
        "INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'REINDEX_ENTITY',?,20)",
        [randomUUID(), JSON.stringify({ legislationId: base.lawId })],
      );
      await correctionAudit(
        m,
        actor,
        id,
        "PUBLISH_CORRECTION",
        {
          status: "PUBLISHED",
          versionId,
          policyChecks: checks,
          before: base.content,
          after: payload,
        },
        reason,
      );
      return { id, status: "PUBLISHED", versionId };
    });
  }
}
