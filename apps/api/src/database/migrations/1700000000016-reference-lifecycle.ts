import type { MigrationInterface, QueryRunner } from "typeorm";
// Frozen additions for gazette references and versioned synonym sets. No grants.
export class ReferenceLifecycle1700000000016 implements MigrationInterface {
  name = "ReferenceLifecycle1700000000016";
  async up(q: QueryRunner) {
    for (const table of ["gazette_issues", "search_synonym_sets"])
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL`,
      );
    for (const [action, label] of [
      ["create", "إنشاء مجموعة مرادفات"],
      ["delete", "حذف مجموعة مرادفات"],
      ["disable", "تعطيل مجموعة مرادفات"],
      ["enable", "إعادة تفعيل مجموعة مرادفات"],
    ])
      await q.query(
        "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,'SEARCH','search.synonym_set',?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
        ["search.synonym_set." + action, action, label, label],
      );
  }
  async down(q: QueryRunner) {
    for (const table of ["gazette_issues", "search_synonym_sets"])
      if (
        (
          await q.query(
            `SELECT 1 FROM ${table} WHERE deleted_at IS NOT NULL OR is_active=FALSE LIMIT 1`,
          )
        ).length
      )
        throw new Error("REFERENCE_LIFECYCLE_ROLLBACK_REQUIRES_SNAPSHOT");
    for (const action of ["create", "delete", "disable", "enable"]) {
      const code = "search.synonym_set." + action;
      await q.query(
        "DELETE FROM user_permission_overrides WHERE permission_code=?",
        [code],
      );
      await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
        code,
      ]);
      await q.query("DELETE FROM permission_definitions WHERE code=?", [code]);
    }
    for (const table of ["gazette_issues", "search_synonym_sets"])
      await q.query(
        `ALTER TABLE ${table} DROP COLUMN is_active, DROP COLUMN deleted_at`,
      );
  }
}
