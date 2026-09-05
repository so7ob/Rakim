import { ForbiddenException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";

export const WORKFLOW_POLICIES = [
  {
    code: "SOURCE_IMPORT_SELF_REVIEW",
    settingKey: "workflow.enforce_import_review_separation",
    permissionCode: "workflow:import-review-separation:override",
    labelAr: "لا يجوز للمستورد مراجعة المصدر الذي رفعه",
    descriptionAr:
      "يفصل بين رفع المصدر واعتماد النص المستخرج منه قبل إنشاء المسودة.",
    requiredRole: "LEGAL_REVIEWER",
  },
  {
    code: "LEGISLATION_SELF_APPROVAL",
    settingKey: "workflow.enforce_approval_separation",
    permissionCode: "workflow:approval-separation:override",
    labelAr: "لا يجوز لمن استورد أو حرر المحتوى أن يعتمد التشريع نفسه",
    descriptionAr: "يفصل بين إعداد محتوى التشريع ونقله إلى حالة معتمد للنشر.",
    requiredRole: "LEGAL_REVIEWER",
  },
  {
    code: "LEGISLATION_SELF_PUBLICATION",
    settingKey: "workflow.enforce_publication_separation",
    permissionCode: "workflow:publication-separation:override",
    labelAr: "لا يجوز لمن شارك في إعداد التشريع أو مراجعته أن ينشره",
    descriptionAr:
      "يفصل النشر النهائي عن الاستيراد والتحرير والمراجعة والاعتماد.",
    requiredRole: "CONTENT_MANAGER",
  },
  {
    code: "AMENDMENT_SELF_REVIEW",
    settingKey: "workflow.enforce_amendment_review_separation",
    permissionCode: "workflow:amendment-review-separation:override",
    labelAr: "لا يجوز لمن أنشأ التعديل أن يراجعه",
    descriptionAr: "يفصل بين إنشاء مشروع التعديل ومراجعته القانونية.",
    requiredRole: "LEGAL_REVIEWER",
  },
  {
    code: "AMENDMENT_SELF_PUBLICATION",
    settingKey: "workflow.enforce_amendment_publication_separation",
    permissionCode: "workflow:amendment-publication-separation:override",
    labelAr: "لا يجوز لمن أنشأ أو راجع التعديل أن ينشره",
    descriptionAr: "يفصل تطبيق التعديل زمنيًا عن إنشائه ومراجعته.",
    requiredRole: "CONTENT_MANAGER",
  },
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
  const policy = workflowPolicy(code)!;
  const rows = await manager.query(
    "SELECT value_json valueJson FROM platform_settings WHERE setting_key=?",
    [policy.settingKey],
  );
  const enabled = rows[0]
    ? parsePolicyBoolean(rows[0].valueJson as unknown, true)
    : true;
  if (!enabled) return "POLICY_DISABLED";
  if (!violatesPolicy) return "POLICY_ENFORCED";
  if (actor.permissions.includes(policy.permissionCode))
    return "USER_PERMISSION_OVERRIDE";
  throw new ForbiddenException(policy.labelAr);
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
