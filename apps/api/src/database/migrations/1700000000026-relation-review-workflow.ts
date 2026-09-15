import type { MigrationInterface, QueryRunner } from "typeorm";

export class RelationReviewWorkflow1700000000026 implements MigrationInterface {
  name = "RelationReviewWorkflow1700000000026";

  async up(q: QueryRunner) {
    await q.query(
      `ALTER TABLE legal_relations
       MODIFY COLUMN review_status ENUM('UNREVIEWED','REVIEWED','REJECTED','PUBLISHED') NOT NULL DEFAULT 'UNREVIEWED',
       ADD COLUMN reviewed_by CHAR(36) NULL AFTER review_status,
       ADD COLUMN reviewed_at DATETIME(3) NULL AFTER reviewed_by,
       ADD COLUMN published_by CHAR(36) NULL AFTER reviewed_at,
       ADD COLUMN published_at DATETIME(3) NULL AFTER published_by,
       ADD COLUMN workflow_revision INT UNSIGNED NOT NULL DEFAULT 1 AFTER published_at,
       ADD KEY idx_relation_reviewed_by (reviewed_by),
       ADD KEY idx_relation_published_by (published_by),
       ADD CONSTRAINT fk_relation_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),
       ADD CONSTRAINT fk_relation_publisher FOREIGN KEY (published_by) REFERENCES users(id)`,
    );
    await q.query(
      "UPDATE legal_relations SET review_status='PUBLISHED' WHERE review_status='REVIEWED'",
    );
    for (const permission of [
      [
        "relation.publish",
        "publish",
        "نشر علاقة قانونية",
        "إتاحة العلاقة القانونية المراجعة للعامة.",
        "CRITICAL",
      ],
      [
        "relation.reject",
        "reject",
        "رفض علاقة قانونية",
        "رفض مسودة علاقة قانونية أو علاقة مكتملة المراجعة.",
        "ELEVATED",
      ],
      [
        "relation.return",
        "return",
        "إعادة علاقة إلى المسودة",
        "إعادة العلاقة للتعديل قبل مراجعتها ونشرها مجددًا.",
        "ELEVATED",
      ],
    ])
      await q.query(
        `INSERT INTO permission_definitions
         (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy)
         VALUES (?,'CONTENT','relation',?,?,?,?,JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)`,
        permission,
      );
    for (const [role, codes] of [
      ["LEGAL_REVIEWER", ["relation.reject", "relation.return"]],
      ["CONTENT_MANAGER", ["relation.publish", "relation.return"]],
    ] as const) {
      const [record] = await q.query(
        "SELECT id FROM roles WHERE code=? AND is_system=TRUE",
        [role],
      );
      if (record)
        for (const code of codes)
          await q.query(
            "INSERT IGNORE INTO role_permissions (role_id,permission_code,scope_code) VALUES (?,?,'ALL')",
            [record.id, code],
          );
    }
  }

  async down(q: QueryRunner) {
    await q.query(
      "DELETE FROM role_permissions WHERE permission_code IN ('relation.publish','relation.reject','relation.return')",
    );
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code IN ('relation.publish','relation.reject','relation.return')",
    );
    await q.query(
      "DELETE FROM user_permissions WHERE permission_code IN ('relation.publish','relation.reject','relation.return')",
    );
    await q.query(
      "DELETE FROM permission_definitions WHERE code IN ('relation.publish','relation.reject','relation.return')",
    );
    await q.query(
      "UPDATE legal_relations SET review_status='UNREVIEWED' WHERE review_status='REVIEWED'",
    );
    await q.query(
      "UPDATE legal_relations SET review_status='REVIEWED' WHERE review_status='PUBLISHED'",
    );
    await q.query(
      `ALTER TABLE legal_relations
       DROP FOREIGN KEY fk_relation_publisher,
       DROP FOREIGN KEY fk_relation_reviewer,
       DROP KEY idx_relation_published_by,
       DROP KEY idx_relation_reviewed_by,
       DROP COLUMN workflow_revision,
       DROP COLUMN published_at,
       DROP COLUMN published_by,
       DROP COLUMN reviewed_at,
       DROP COLUMN reviewed_by,
       MODIFY COLUMN review_status ENUM('UNREVIEWED','REVIEWED','REJECTED') NOT NULL DEFAULT 'UNREVIEWED'`,
    );
  }
}
