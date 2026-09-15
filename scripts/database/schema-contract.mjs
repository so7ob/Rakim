export const expectedMigrations = [
  "InitialSchema1700000000000",
  "ImmutabilityHardening1700000000001",
  "AdminWorkflow1700000000002",
  "AmendmentWorkflow1700000000003",
  "Observability1700000000004",
  "Preamble1700000000005",
  "PlatformSettings1700000000006",
  "VisualSettings1700000000007",
  "WorkflowControls1700000000008",
  "WorkflowPolicyCatalog1700000000009",
  "GranularAccessControl1700000000010",
  "ReferenceThemeDefaults1700000000011",
  "CanonicalRbacSecurity1700000000012",
  "ArticleLabelOrdering1700000000013",
  "MultiSourceImports1700000000014",
  "AdministrativeLifecycle1700000000015",
  "ReferenceLifecycle1700000000016",
  "RecoveryEditRevisions1700000000017",
  "SourceDocHashUniqueness1700000000018",
  "SourceDocActiveHashConstraint1700000000019",
  "RelationalDeletionTrash1700000000020",
  "OperationPolicies1700000000021",
  "ContentCorrections1700000000022",
  "AdditionalOperationPolicies1700000000023",
  "AnnexContentFormats1700000000024",
  "AnnexReviewWorkflow1700000000025",
  "RelationReviewWorkflow1700000000026",
];
// Historical development migration (8496639), superseded by CanonicalRbacSecurity
// 0012. It only synchronized permission data; it is not a replacement for the
// separate ReferenceThemeDefaults 0011 migration or any required migration.
const supportedHistoricalMigrations = new Set([
  "PermissionCatalogSync1700000000011",
]);
export async function assertSchemaCompatible(query) {
  const tables = await query(
    "SELECT table_name name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations'",
  );
  const applied = tables.length
    ? await query("SELECT name FROM schema_migrations")
    : [];
  const names = new Set(applied.map((row) => row.name));
  const missing = expectedMigrations.filter((name) => !names.has(name));
  const unknown = [...names].filter(
    (name) =>
      !expectedMigrations.includes(name) &&
      !supportedHistoricalMigrations.has(name),
  );
  if (missing.length || unknown.length)
    throw new Error(
      `DATABASE_SCHEMA_INCOMPATIBLE: الترحيلات الناقصة: ${missing.join(", ") || "لا يوجد"}. ترحيلات غير معروفة لهذه النسخة: ${unknown.join(", ") || "لا يوجد"}. طبّق الترحيلات الناقصة عبر npm run db:migrate قبل التشغيل، أو استخدم إصدار التطبيق المطابق عند وجود ترحيلات غير معروفة. لم يُغيّر فحص التوافق قاعدة البيانات.`,
    );
  const columns = await query(
    "SELECT table_name tableName,column_name columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND (column_name IN ('deleted_at','edit_revision','cancel_requested_at') OR table_name IN ('password_recovery_requests','deletion_batches','deletion_batch_items','content_corrections','annex_versions') OR (table_name='source_documents' AND column_name='active_sha256') OR (table_name='annexes' AND column_name IN ('workflow_revision','reviewed_by','reviewed_at')) OR (table_name='legal_relations' AND column_name IN ('workflow_revision','reviewed_by','reviewed_at','published_by','published_at')))",
  );
  for (const [table, column] of [
    ["users", "deleted_at"],
    ["password_recovery_requests", "token_hash"],
    ["source_documents", "active_sha256"],
    ["source_imports", "deleted_at"],
    ["job_queue", "cancel_requested_at"],
    ["deletion_batches", "id"],
    ["deletion_batch_items", "batch_id"],
    ["deletion_batches", "policy_checks_json"],
    ["content_corrections", "base_hash"],
    ["annex_versions", "content_format"],
    ["annex_versions", "text_content"],
    ["annexes", "workflow_revision"],
    ["annexes", "reviewed_by"],
    ["annexes", "reviewed_at"],
    ["legal_relations", "workflow_revision"],
    ["legal_relations", "reviewed_by"],
    ["legal_relations", "reviewed_at"],
    ["legal_relations", "published_by"],
    ["legal_relations", "published_at"],
    ...[
      "legislation_types",
      "subjects",
      "authorities",
      "gazette_issues",
      "platform_settings",
      "navigation_items",
      "public_pages",
    ].map((table) => [table, "edit_revision"]),
  ])
    if (
      !columns.some(
        (row) => row.tableName === table && row.columnName === column,
      )
    )
      throw new Error(
        `DATABASE_SCHEMA_INCOMPATIBLE: الحقل ${table}.${column} مفقود رغم سجل الترحيلات؛ افحص سلامة المخطط قبل التشغيل.`,
      );
}
