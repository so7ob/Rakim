import type { PermissionDefinition } from "./permission-catalog.js";

export const RELATION_WORKFLOW_PERMISSION_CATALOG: PermissionDefinition[] = [
  {
    code: "relation.publish",
    domain: "CONTENT",
    resource: "relation",
    action: "publish",
    labelAr: "نشر علاقة قانونية",
    descriptionAr: "إتاحة العلاقة القانونية المراجعة للعامة.",
    sensitivity: "CRITICAL",
  },
  {
    code: "relation.reject",
    domain: "CONTENT",
    resource: "relation",
    action: "reject",
    labelAr: "رفض علاقة قانونية",
    descriptionAr: "رفض مسودة علاقة قانونية أو علاقة مكتملة المراجعة.",
    sensitivity: "ELEVATED",
  },
  {
    code: "relation.return",
    domain: "CONTENT",
    resource: "relation",
    action: "return",
    labelAr: "إعادة علاقة إلى المسودة",
    descriptionAr: "إعادة العلاقة للتعديل قبل مراجعتها ونشرها مجددًا.",
    sensitivity: "ELEVATED",
  },
];

export const RELATION_WORKFLOW_ROLE_PERMISSION_MAP: Readonly<
  Record<string, string[]>
> = {
  LEGAL_REVIEWER: ["relation.reject", "relation.return"],
  CONTENT_MANAGER: ["relation.publish", "relation.return"],
};
