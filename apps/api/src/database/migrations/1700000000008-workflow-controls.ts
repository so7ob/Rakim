import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowControls1700000000008 implements MigrationInterface {
  name = "WorkflowControls1700000000008";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE user_permissions (
      user_id CHAR(36) NOT NULL,
      permission_code VARCHAR(120) NOT NULL,
      granted_by CHAR(36) NULL,
      grant_reason VARCHAR(1000) NOT NULL,
      granted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (user_id, permission_code),
      CONSTRAINT fk_user_permission_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_permission_grantor FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
      KEY idx_user_permission_code (permission_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(
      `INSERT INTO platform_settings
      (setting_key,group_code,label_ar,input_type,value_json,is_public)
      VALUES ('workflow.enforce_approval_separation','WORKFLOW',
      'لا يجوز لمن استورد أو حرر المحتوى أن يعتمد التشريع نفسه','BOOLEAN','true',FALSE)`,
    );
    await q.query(
      `UPDATE roles
       SET permissions_json=JSON_ARRAY_APPEND(permissions_json,'$','settings.workflow.manage')
       WHERE code='SYSTEM_ADMIN'
       AND JSON_CONTAINS(permissions_json,JSON_QUOTE('settings.workflow.manage'))=0`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE roles
       SET permissions_json=JSON_REMOVE(
         permissions_json,
         JSON_UNQUOTE(JSON_SEARCH(permissions_json,'one','settings.workflow.manage'))
       )
       WHERE code='SYSTEM_ADMIN'
       AND JSON_SEARCH(permissions_json,'one','settings.workflow.manage') IS NOT NULL`,
    );
    await q.query(
      "DELETE FROM platform_settings WHERE setting_key='workflow.enforce_approval_separation'",
    );
    await q.query("DROP TABLE user_permissions");
  }
}
