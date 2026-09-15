import { randomUUID } from "node:crypto";
import { ForbiddenException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";

const SEPARATION_POLICIES = [
  {
    code: "SOURCE_IMPORT_SELF_REVIEW",
    settingKey: "workflow.enforce_import_review_separation",
    permissionCode: "workflow.source_import.self_review.override",
    labelAr: "لا يجوز للمستورد مراجعة المصدر الذي رفعه",
    descriptionAr:
      "يفصل بين رفع المصدر واعتماد النص المستخرج منه قبل إنشاء المسودة.",
    requiredRole: "LEGAL_REVIEWER",
  },
  {
    code: "LEGISLATION_SELF_APPROVAL",
    settingKey: "workflow.enforce_approval_separation",
    permissionCode: "workflow.legislation.self_approval.override",
    labelAr: "لا يجوز لمن استورد أو حرر المحتوى أن يعتمد التشريع نفسه",
    descriptionAr: "يفصل بين إعداد محتوى التشريع ونقله إلى حالة معتمد للنشر.",
    requiredRole: "LEGAL_REVIEWER",
  },
  {
    code: "LEGISLATION_SELF_PUBLICATION",
    settingKey: "workflow.enforce_publication_separation",
    permissionCode: "workflow.legislation.self_publication.override",
    labelAr: "لا يجوز لمن شارك في إعداد التشريع أو مراجعته أن ينشره",
    descriptionAr:
      "يفصل النشر النهائي عن الاستيراد والتحرير والمراجعة والاعتماد.",
    requiredRole: "CONTENT_MANAGER",
  },
  {
    code: "AMENDMENT_SELF_REVIEW",
    settingKey: "workflow.enforce_amendment_review_separation",
    permissionCode: "workflow.amendment.self_review.override",
    labelAr: "لا يجوز لمن أنشأ التعديل أن يراجعه",
    descriptionAr: "يفصل بين إنشاء مشروع التعديل ومراجعته القانونية.",
    requiredRole: "LEGAL_REVIEWER",
  },
  {
    code: "AMENDMENT_SELF_PUBLICATION",
    settingKey: "workflow.enforce_amendment_publication_separation",
    permissionCode: "workflow.amendment.self_publication.override",
    labelAr: "لا يجوز لمن أنشأ أو راجع التعديل أن ينشره",
    descriptionAr: "يفصل تطبيق التعديل زمنيًا عن إنشائه ومراجعته.",
    requiredRole: "CONTENT_MANAGER",
  },
] as const;

export const OPERATION_POLICIES = [
  {
    code: "ACTIVE_SYNONYM_HISTORY",
    category: "ACTIVATION",
    settingKey: "workflow.enforce_active_synonym_history",
    permissionCode: "workflow.active_synonym_history.override",
    labelAr: "حماية تفعيل وتعطيل مرادفات القاموس المنشور",
    descriptionAr:
      "حماية تفعيل وتعطيل مرادفات القاموس المنشور؛ يبقى السجل وتاريخه محفوظين وتطبق صلاحية الإجراء.",
    requiredPermissions: ["search.synonym.enable", "search.synonym.disable"],
    requiredRole: "",
  },
  {
    code: "ACTIVE_AMENDMENT_OPERATIONS",
    category: "ACTIVATION",
    settingKey: "workflow.enforce_active_amendment_operations",
    permissionCode: "workflow.active_amendment_operations.override",
    labelAr: "حماية تفعيل وتعطيل عناصر التعديل المنشور",
    descriptionAr:
      "حماية تفعيل وتعطيل عناصر التعديل المنشور؛ يبقى السجل وتاريخه محفوظين وتطبق صلاحية الإجراء.",
    requiredPermissions: ["amendment.enable", "amendment.disable"],
    requiredRole: "",
  },
  {
    code: "CREATE_ARTICLE_REVIEWED",
    category: "EDITING",
    settingKey: "workflow.enforce_create_article_reviewed",
    permissionCode: "workflow.create_article_reviewed.override",
    labelAr: "اشتراط المسودة لإضافة مادة قبل النشر",
    descriptionAr:
      "اشتراط المسودة لإضافة مادة قبل النشر؛ يبقى السجل وتاريخه محفوظين وتطبق صلاحية الإجراء.",
    requiredPermissions: ["article.create"],
    requiredRole: "",
  },

  {
    code: "DELETE_LEGISLATION_HISTORY",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_legislation_history",
    permissionCode: "workflow.delete_legislation_history.override",
    labelAr: "حماية التشريع خارج المسودة من الحذف",
    descriptionAr:
      "حماية التشريع خارج المسودة من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: [
      "legislation.delete",
      "article.delete",
      "structure.delete",
      "source.delete",
    ],
    requiredRole: "",
  },
  {
    code: "DELETE_LEGISLATION_VERSIONS",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_legislation_versions",
    permissionCode: "workflow.delete_legislation_versions.override",
    labelAr: "حماية نسخ التشريع المعتمدة والمنشورة من الحذف",
    descriptionAr:
      "حماية نسخ التشريع المعتمدة والمنشورة من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["legislation.delete"],
    requiredRole: "",
  },
  {
    code: "DELETE_ARTICLE_HISTORY",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_article_history",
    permissionCode: "workflow.delete_article_history.override",
    labelAr: "حماية نسخ المواد المنشورة والتاريخية من الحذف",
    descriptionAr:
      "حماية نسخ المواد المنشورة والتاريخية من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["article.delete"],
    requiredRole: "",
  },
  {
    code: "DELETE_ANNEX_HISTORY",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_annex_history",
    permissionCode: "workflow.delete_annex_history.override",
    labelAr: "حماية الملاحق المنشورة والتاريخية من الحذف",
    descriptionAr:
      "حماية الملاحق المنشورة والتاريخية من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["annex.delete"],
    requiredRole: "",
  },
  {
    code: "DELETE_AMENDMENT_HISTORY",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_amendment_history",
    permissionCode: "workflow.delete_amendment_history.override",
    labelAr: "حماية وثائق التعديل المراجعة والمنشورة من الحذف",
    descriptionAr:
      "حماية وثائق التعديل المراجعة والمنشورة من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["amendment.delete"],
    requiredRole: "",
  },
  {
    code: "DELETE_REVIEWED_RELATION",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_reviewed_relation",
    permissionCode: "workflow.delete_reviewed_relation.override",
    labelAr: "حماية العلاقات القانونية المعتمدة من الحذف",
    descriptionAr:
      "حماية العلاقات القانونية المعتمدة من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["relation.delete"],
    requiredRole: "",
  },
  {
    code: "DELETE_PUBLISHED_PAGE",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_published_page",
    permissionCode: "workflow.delete_published_page.override",
    labelAr: "حماية الصفحات المنشورة والمؤرشفة من الحذف",
    descriptionAr:
      "حماية الصفحات المنشورة والمؤرشفة من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["public_page.delete"],
    requiredRole: "",
  },
  {
    code: "DELETE_SYNONYM_HISTORY",
    category: "DELETION",
    settingKey: "workflow.enforce_delete_synonym_history",
    permissionCode: "workflow.delete_synonym_history.override",
    labelAr: "حماية قواميس المرادفات المنشورة والمؤرشفة من الحذف",
    descriptionAr:
      "حماية قواميس المرادفات المنشورة والمؤرشفة من الحذف؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["search.synonym_set.delete", "search.synonym.delete"],
    requiredRole: "",
  },
  {
    code: "EDIT_LEGISLATION_HISTORY",
    category: "EDITING",
    settingKey: "workflow.enforce_edit_legislation_history",
    permissionCode: "workflow.edit_legislation_history.override",
    labelAr: "حماية نص التشريع المنشور؛ الاستثناء ينشئ مسودة تصحيح",
    descriptionAr:
      "حماية نص التشريع المنشور؛ الاستثناء ينشئ مسودة تصحيح؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["legislation.update"],
    requiredRole: "",
  },
  {
    code: "EDIT_ARTICLE_HISTORY",
    category: "EDITING",
    settingKey: "workflow.enforce_edit_article_history",
    permissionCode: "workflow.edit_article_history.override",
    labelAr: "حماية نص المادة المنشور؛ الاستثناء ينشئ مسودة تصحيح",
    descriptionAr:
      "حماية نص المادة المنشور؛ الاستثناء ينشئ مسودة تصحيح؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["article.update"],
    requiredRole: "",
  },
  {
    code: "EDIT_ANNEX_HISTORY",
    category: "EDITING",
    settingKey: "workflow.enforce_edit_annex_history",
    permissionCode: "workflow.edit_annex_history.override",
    labelAr: "حماية بيانات الملحق المنشور؛ الاستثناء ينشئ مسودة تصحيح",
    descriptionAr:
      "حماية بيانات الملحق المنشور؛ الاستثناء ينشئ مسودة تصحيح؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["annex.update"],
    requiredRole: "",
  },
  {
    code: "EDIT_AMENDMENT_REVIEWED",
    category: "EDITING",
    settingKey: "workflow.enforce_edit_amendment_reviewed",
    permissionCode: "workflow.edit_amendment_reviewed.override",
    labelAr: "حماية وثيقة التعديل بعد مراجعتها؛ الاستثناء يعيدها للمراجعة",
    descriptionAr:
      "حماية وثيقة التعديل بعد مراجعتها؛ الاستثناء يعيدها للمراجعة؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: [
      "amendment.update",
      "amendment.enable",
      "amendment.disable",
      "amendment.delete",
    ],
    requiredRole: "",
  },
  {
    code: "EDIT_SYNONYM_HISTORY",
    category: "EDITING",
    settingKey: "workflow.enforce_edit_synonym_history",
    permissionCode: "workflow.edit_synonym_history.override",
    labelAr: "حماية القاموس المنشور؛ الاستثناء ينشئ نسخة مسودة",
    descriptionAr:
      "حماية القاموس المنشور؛ الاستثناء ينشئ نسخة مسودة؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["search.synonym.update"],
    requiredRole: "",
  },
  {
    code: "EDIT_LEGISLATION_SOURCES",
    category: "EDITING",
    settingKey: "workflow.enforce_edit_legislation_sources",
    permissionCode: "workflow.edit_legislation_sources.override",
    labelAr: "حماية ارتباطات مصادر التشريع بعد مرحلة المسودة",
    descriptionAr:
      "حماية ارتباطات مصادر التشريع بعد مرحلة المسودة؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["source.update"],
    requiredRole: "",
  },
  {
    code: "LEGISLATION_REVIEWED_SOURCE",
    category: "PUBLICATION",
    settingKey: "workflow.enforce_legislation_reviewed_source",
    permissionCode: "workflow.legislation_reviewed_source.override",
    labelAr: "اشتراط مراجعة المصدر قبل نشر التشريع",
    descriptionAr:
      "اشتراط مراجعة المصدر قبل نشر التشريع؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["legislation.publish"],
    requiredRole: "",
  },
  {
    code: "ANNEX_REVIEWED_SOURCE",
    category: "PUBLICATION",
    settingKey: "workflow.enforce_annex_reviewed_source",
    permissionCode: "workflow.annex_reviewed_source.override",
    labelAr: "اشتراط مراجعة المصدر قبل نشر الملحق",
    descriptionAr:
      "اشتراط مراجعة المصدر قبل نشر الملحق؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["annex.publish"],
    requiredRole: "",
  },
  {
    code: "ANNEX_WORKFLOW_ORDER",
    category: "PUBLICATION",
    settingKey: "workflow.enforce_annex_workflow_order",
    permissionCode: "workflow.annex_workflow_order.override",
    labelAr: "اشتراط مراجعة الملحق قبل النشر",
    descriptionAr:
      "اشتراط اعتماد مراجعة الملحق أو الجدول قبل نشره؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحية النشر إلزامية.",
    requiredPermissions: ["annex.publish"],
    requiredRole: "",
  },
  {
    code: "AMENDMENT_REVIEWED_SOURCE",
    category: "PUBLICATION",
    settingKey: "workflow.enforce_amendment_reviewed_source",
    permissionCode: "workflow.amendment_reviewed_source.override",
    labelAr: "اشتراط مراجعة المصدر لوثيقة التعديل",
    descriptionAr:
      "اشتراط مراجعة المصدر لوثيقة التعديل؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: [
      "amendment.create",
      "amendment.update",
      "amendment.review",
      "amendment.publish",
    ],
    requiredRole: "",
  },
  {
    code: "LEGISLATION_WORKFLOW_ORDER",
    category: "PUBLICATION",
    settingKey: "workflow.enforce_legislation_workflow_order",
    permissionCode: "workflow.legislation_workflow_order.override",
    labelAr: "الالتزام بترتيب مراحل اعتماد التشريع ونشره",
    descriptionAr:
      "الالتزام بترتيب مراحل اعتماد التشريع ونشره؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: [
      "legislation.submit",
      "legislation.approve",
      "legislation.publish",
    ],
    requiredRole: "",
  },
  {
    code: "AMENDMENT_WORKFLOW_ORDER",
    category: "PUBLICATION",
    settingKey: "workflow.enforce_amendment_workflow_order",
    permissionCode: "workflow.amendment_workflow_order.override",
    labelAr: "اشتراط مراجعة وثيقة التعديل قبل النشر",
    descriptionAr:
      "اشتراط مراجعة وثيقة التعديل قبل النشر؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: ["amendment.publish"],
    requiredRole: "",
  },
  {
    code: "ACTIVE_LEGISLATION_WORKFLOW",
    category: "ACTIVATION",
    settingKey: "workflow.enforce_active_legislation_workflow",
    permissionCode: "workflow.active_legislation_workflow.override",
    labelAr: "اشتراط تفعيل التشريع لمتابعة سير العمل",
    descriptionAr:
      "اشتراط تفعيل التشريع لمتابعة سير العمل؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: [
      "legislation.submit",
      "legislation.approve",
      "legislation.publish",
    ],
    requiredRole: "",
  },
  {
    code: "ACTIVE_PARENT",
    category: "ACTIVATION",
    settingKey: "workflow.enforce_active_parent",
    permissionCode: "workflow.active_parent.override",
    labelAr: "اشتراط تفعيل العنصر الأب قبل تفعيل السجل التابع",
    descriptionAr:
      "اشتراط تفعيل العنصر الأب قبل تفعيل السجل التابع؛ يمكن تعطيل السياسة أو منح استثناء لمستخدم محدد مع بقاء صلاحيات الإجراء وسلامة البيانات إلزامية.",
    requiredPermissions: [
      "article.enable",
      "structure.enable",
      "annex.enable",
      "relation.enable",
      "amendment.enable",
      "reference.enable",
    ],
    requiredRole: "",
  },
] as const;

export const WORKFLOW_POLICIES = [
  ...SEPARATION_POLICIES.map((policy) => ({
    ...policy,
    category: "PUBLICATION" as const,
    requiredPermissions: [
      {
        SOURCE_IMPORT_SELF_REVIEW: "source.review",
        LEGISLATION_SELF_APPROVAL: "legislation.approve",
        LEGISLATION_SELF_PUBLICATION: "legislation.publish",
        AMENDMENT_SELF_REVIEW: "amendment.review",
        AMENDMENT_SELF_PUBLICATION: "amendment.publish",
      }[policy.code],
    ],
  })),
  ...OPERATION_POLICIES,
] as const;

export type WorkflowPolicyCode = (typeof WORKFLOW_POLICIES)[number]["code"];
export type WorkflowPolicyDecision =
  "POLICY_ENFORCED" | "POLICY_DISABLED" | "USER_PERMISSION_OVERRIDE";

export function workflowPolicy(code: string) {
  return WORKFLOW_POLICIES.find((policy) => policy.code === code);
}

export async function assertWorkflowPolicy(
  manager: EntityManager,
  code: WorkflowPolicyCode,
  actor: AuthUser,
  violatesPolicy: boolean,
): Promise<WorkflowPolicyDecision> {
  const check = await evaluateWorkflowPolicy(
    manager,
    code,
    actor,
    violatesPolicy,
  );
  if (!check.allowed)
    throw new ForbiddenException({
      code: "WORKFLOW_POLICY_BLOCKED",
      message: check.message,
      policyChecks: [check],
    });
  return check.result as WorkflowPolicyDecision;
}

export interface PolicyCheck {
  code: WorkflowPolicyCode;
  message: string;
  enabled: boolean;
  applies: boolean;
  allowed: boolean;
  result: WorkflowPolicyDecision | "POLICY_BLOCKED";
}

export async function evaluateWorkflowPolicy(
  manager: EntityManager,
  code: WorkflowPolicyCode,
  actor: AuthUser,
  applies: boolean,
  message?: string,
): Promise<PolicyCheck> {
  const policy = workflowPolicy(code)!;
  const rows = await manager.query(
    `SELECT value_json valueJson FROM platform_settings WHERE setting_key=?${manager.queryRunner?.isTransactionActive ? " FOR UPDATE" : ""}`,
    [policy.settingKey],
  );
  const enabled = rows[0] ? parsePolicyBoolean(rows[0].valueJson, true) : true;
  let override =
    actor.policyCapabilities?.includes(policy.permissionCode) ?? false;
  if (applies && enabled && manager.queryRunner?.isTransactionActive) {
    const grants = await manager.query(
      "SELECT permission_code FROM user_permissions WHERE user_id=? AND permission_code=? FOR UPDATE",
      [actor.id, policy.permissionCode],
    );
    override = grants.length > 0;
  }
  const result = !enabled
    ? "POLICY_DISABLED"
    : !applies
      ? "POLICY_ENFORCED"
      : override
        ? "USER_PERMISSION_OVERRIDE"
        : "POLICY_BLOCKED";
  return {
    code,
    message: message ?? policy.labelAr,
    enabled,
    applies,
    allowed: result !== "POLICY_BLOCKED",
    result,
  };
}

export async function enforceOperationPolicy(
  manager: EntityManager,
  code: WorkflowPolicyCode,
  actor: AuthUser,
  applies: boolean,
  entityId: string,
  reason: string,
) {
  const check = await evaluateWorkflowPolicy(manager, code, actor, applies);
  if (!check.allowed)
    throw new ForbiddenException({
      code: "WORKFLOW_POLICY_BLOCKED",
      message: check.message,
      policyChecks: [check],
    });
  if (check.applies) {
    if (reason.trim().length < 3)
      throw new ForbiddenException("سبب تجاوز السياسة مطلوب.");
    await manager.query(
      `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason)
       VALUES (?,?,'OPERATION_POLICY_OVERRIDE','WORKFLOW_POLICY',?,?,?)`,
      [
        randomUUID(),
        actor.id,
        entityId,
        JSON.stringify({ policyChecks: [check] }),
        reason.trim(),
      ],
    );
  }
  return check;
}

export function parsePolicyBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = Buffer.isBuffer(value)
    ? value.toString()
    : String(value).trim();
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (typeof parsed === "boolean") return parsed;
    if (typeof parsed === "number") return parsed !== 0;
    if (typeof parsed === "string")
      return parsed.toLowerCase() === "true" || parsed === "1";
  } catch {
    if (normalized.toLowerCase() === "true" || normalized === "1") return true;
    if (normalized.toLowerCase() === "false" || normalized === "0")
      return false;
  }
  return fallback;
}
