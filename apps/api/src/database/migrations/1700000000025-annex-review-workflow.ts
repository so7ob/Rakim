import type { MigrationInterface, QueryRunner } from "typeorm";

export class AnnexReviewWorkflow1700000000025 implements MigrationInterface {
  name = "AnnexReviewWorkflow1700000000025";

  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE annexes
       MODIFY COLUMN status ENUM('DRAFT','REVIEWED','PUBLISHED','REPLACED','REPEALED') NOT NULL,
       ADD COLUMN reviewed_by CHAR(36) NULL AFTER status,
       ADD COLUMN reviewed_at DATETIME(3) NULL AFTER reviewed_by,
       ADD COLUMN workflow_revision INT UNSIGNED NOT NULL DEFAULT 1 AFTER reviewed_at,
       ADD KEY idx_annex_reviewed_by (reviewed_by),
       ADD CONSTRAINT fk_annex_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)`,
    );
    for (const permission of [
      [
        "annex.review",
        "review",
        "مراجعة الملحق",
        "اعتماد الملحق أو الجدول ليصبح جاهزًا للنشر.",
      ],
      [
        "annex.return",
        "return",
        "إعادة الملحق إلى المسودة",
        "إعادة ملحق مراجع إلى المسودة لإجراء تعديلات جديدة.",
      ],
    ])
      await q.query(
        `INSERT INTO permission_definitions
         (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy)
         VALUES (?,'CONTENT','annex',?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)`,
        permission,
      );
    const [reviewer] = await q.query(
      "SELECT id FROM roles WHERE code='LEGAL_REVIEWER' AND is_system=TRUE",
    );
    if (reviewer)
      for (const code of ["annex.review", "annex.return"])
        await q.query(
          "INSERT IGNORE INTO role_permissions (role_id,permission_code,scope_code) VALUES (?,?,'ALL')",
          [reviewer.id, code],
        );
    await q.query(
      `INSERT INTO platform_settings
       (setting_key,group_code,label_ar,input_type,value_json,is_public)
       VALUES ('workflow.enforce_annex_workflow_order','WORKFLOW','اشتراط مراجعة الملحق قبل النشر','BOOLEAN','true',FALSE)`,
    );
  }

  async down(q: QueryRunner) {
    await q.query(
      "DELETE FROM user_permissions WHERE permission_code='workflow.annex_workflow_order.override'",
    );
    await q.query(
      "DELETE FROM platform_settings WHERE setting_key='workflow.enforce_annex_workflow_order'",
    );
    await q.query(
      "DELETE FROM role_permissions WHERE permission_code IN ('annex.review','annex.return')",
    );
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code IN ('annex.review','annex.return')",
    );
    await q.query(
      "DELETE FROM permission_definitions WHERE code IN ('annex.review','annex.return')",
    );
    await q.query("UPDATE annexes SET status='DRAFT' WHERE status='REVIEWED'");
    await q.query(
      `ALTER TABLE annexes
       DROP FOREIGN KEY fk_annex_reviewer,
       DROP KEY idx_annex_reviewed_by,
       DROP COLUMN workflow_revision,
       DROP COLUMN reviewed_at,
       DROP COLUMN reviewed_by,
       MODIFY COLUMN status ENUM('DRAFT','PUBLISHED','REPLACED','REPEALED') NOT NULL`,
    );
  }
}
