import type { MigrationInterface, QueryRunner } from "typeorm";

const tables = [
  "legislation_types",
  "subjects",
  "authorities",
  "gazette_issues",
  "platform_settings",
  "navigation_items",
  "public_pages",
];
export class RecoveryEditRevisions1700000000017 implements MigrationInterface {
  name = "RecoveryEditRevisions1700000000017";
  async up(q: QueryRunner): Promise<void> {
    for (const table of tables) {
      await q.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS edit_revision BIGINT UNSIGNED NOT NULL DEFAULT 1`,
      );
      await q.query(
        `CREATE TRIGGER IF NOT EXISTS revision_${table} BEFORE UPDATE ON ${table} FOR EACH ROW SET NEW.edit_revision=OLD.edit_revision+1`,
      );
    }
    await q.query(`CREATE TABLE IF NOT EXISTS password_recovery_requests (
      id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL,
      status ENUM('PENDING','ISSUED','COMPLETED','REJECTED','EXPIRED') NOT NULL DEFAULT 'PENDING',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      handled_at DATETIME(3) NULL, handled_by CHAR(36) NULL, reason VARCHAR(1000) NULL,
      token_hash CHAR(64) NULL UNIQUE, password_fingerprint CHAR(64) NULL,
      expires_at DATETIME(3) NULL, completed_at DATETIME(3) NULL,
      open_user_id CHAR(36) NULL UNIQUE,
      FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(handled_by) REFERENCES users(id),
      INDEX recovery_created(created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    for (const operation of ["INSERT", "UPDATE"])
      await q.query(
        `CREATE TRIGGER IF NOT EXISTS recovery_open_${operation.toLowerCase()} BEFORE ${operation} ON password_recovery_requests FOR EACH ROW SET NEW.open_user_id=IF(NEW.status IN ('PENDING','ISSUED'),NEW.user_id,NULL)`,
      );
  }
  async down(q: QueryRunner): Promise<void> {
    const [row] = await q.query(
      "SELECT COUNT(*) total FROM password_recovery_requests",
    );
    if (Number(row.total))
      throw new Error(
        "لا يمكن حذف سجل طلبات الاستعادة؛ استعد نسخة احتياطية عند الحاجة.",
      );
    await q.query("DROP TABLE password_recovery_requests");
    for (const table of [...tables].reverse()) {
      await q.query(`DROP TRIGGER revision_${table}`);
      await q.query(`ALTER TABLE ${table} DROP COLUMN edit_revision`);
    }
  }
}
