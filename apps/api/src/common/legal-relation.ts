import { createHash } from "node:crypto";

export const LEGAL_RELATION_TYPES = [
  { code: "AMENDS", labelAr: "يعدّل" },
  { code: "REPEALS", labelAr: "يلغي" },
  { code: "IMPLEMENTS", labelAr: "ينفّذ" },
  { code: "BASED_ON", labelAr: "يستند إلى" },
  { code: "REFERS_TO", labelAr: "يحيل إلى" },
  { code: "CORRECTS", labelAr: "يصحح" },
  { code: "TOPICALLY_RELATED", labelAr: "مرتبط موضوعيًا" },
] as const;

export const relationTypeLabel = (code: string) =>
  LEGAL_RELATION_TYPES.find((item) => item.code === code)?.labelAr ?? code;

export const relationSnapshot = (row: any) => ({
  relationType: row.relation_type,
  targetLegislationId: row.target_legislation_id,
  scopeText: row.scope_text ?? null,
  effectiveFrom: row.effective_from
    ? row.effective_from instanceof Date
      ? row.effective_from.toISOString().slice(0, 10)
      : String(row.effective_from).slice(0, 10)
    : null,
  sourceDocumentId: row.source_document_id ?? null,
  reviewStatus: row.review_status,
  workflowRevision: Number(row.workflow_revision ?? 1),
});

export const relationFingerprint = (row: any) =>
  createHash("sha256")
    .update(JSON.stringify(relationSnapshot(row)))
    .digest("hex");
