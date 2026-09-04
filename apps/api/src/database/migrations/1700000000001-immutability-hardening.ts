import type { MigrationInterface, QueryRunner } from "typeorm";

export class ImmutabilityHardening1700000000001 implements MigrationInterface {
  name = "ImmutabilityHardening1700000000001";
  async up(q: QueryRunner): Promise<void> {
    await q.query("DROP TRIGGER IF EXISTS trg_audit_logs_immutable_update");
    await q.query("DROP TRIGGER IF EXISTS trg_audit_logs_immutable_delete");
    await q.query(`CREATE TRIGGER trg_article_versions_no_published_delete BEFORE DELETE ON article_versions FOR EACH ROW
      BEGIN IF OLD.status <> 'DRAFT' AND COALESCE(@ylp_maintenance,0) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLISHED_ARTICLE_VERSION_DELETE_FORBIDDEN'; END IF; END`);
    await q.query(`CREATE TRIGGER trg_audit_logs_immutable_update BEFORE UPDATE ON audit_logs FOR EACH ROW
      BEGIN IF COALESCE(@ylp_maintenance,0) <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_LOG_IMMUTABLE'; END IF; END`);
    await q.query(`CREATE TRIGGER trg_audit_logs_immutable_delete BEFORE DELETE ON audit_logs FOR EACH ROW
      BEGIN IF COALESCE(@ylp_maintenance,0) <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_LOG_IMMUTABLE'; END IF; END`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "DROP TRIGGER IF EXISTS trg_article_versions_no_published_delete",
    );
    await q.query("DROP TRIGGER IF EXISTS trg_audit_logs_immutable_update");
    await q.query("DROP TRIGGER IF EXISTS trg_audit_logs_immutable_delete");
    await q.query(
      `CREATE TRIGGER trg_audit_logs_immutable_update BEFORE UPDATE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_LOG_IMMUTABLE'`,
    );
    await q.query(
      `CREATE TRIGGER trg_audit_logs_immutable_delete BEFORE DELETE ON audit_logs FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_LOG_IMMUTABLE'`,
    );
  }
}
