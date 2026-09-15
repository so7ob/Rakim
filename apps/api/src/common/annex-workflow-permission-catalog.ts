import type { PermissionDefinition } from "./permission-catalog.js";

export const ANNEX_WORKFLOW_PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    code: "annex.review",
    domain: "CONTENT",
    resource: "annex",
    action: "review",
    labelAr: "مراجعة الملحق",
    descriptionAr: "اعتماد الملحق أو الجدول ليصبح جاهزًا للنشر.",
    sensitivity: "ELEVATED",
  },
  {
    code: "annex.return",
    domain: "CONTENT",
    resource: "annex",
    action: "return",
    labelAr: "إعادة الملحق إلى المسودة",
    descriptionAr: "إعادة ملحق مراجع إلى المسودة لإجراء تعديلات جديدة.",
    sensitivity: "ELEVATED",
  },
];

export const ANNEX_WORKFLOW_ROLE_PERMISSION_MAP: Readonly<
  Record<string, string[]>
> = {
  LEGAL_REVIEWER: ANNEX_WORKFLOW_PERMISSION_CATALOG.map((item) => item.code),
};
