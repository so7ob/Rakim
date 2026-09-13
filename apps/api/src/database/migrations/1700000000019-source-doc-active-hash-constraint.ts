import type { MigrationInterface, QueryRunner } from "typeorm";

export class SourceDocActiveHashConstraint1700000000019 implements MigrationInterface {
  name = "SourceDocActiveHashConstraint1700000000019";

  async up(q: QueryRunner): Promise<void> {
    const indexExists = async (name: string) =>
      Number(
        (
          await q.query(
            "SELECT COUNT(*) count FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='source_documents' AND INDEX_NAME=?",
            [name],
          )
        )[0]?.count ?? 0,
      ) > 0;
    const columnExists = async (name: string) =>
      Number(
        (
          await q.query(
            "SELECT COUNT(*) count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='source_documents' AND COLUMN_NAME=?",
            [name],
          )
        )[0]?.count ?? 0,
      ) > 0;

    if (await indexExists("uq_source_sha256_active"))
      await q.query("DROP INDEX uq_source_sha256_active ON source_documents");
    if (!(await columnExists("active_sha256")))
      await q.query(
        "ALTER TABLE source_documents ADD COLUMN active_sha256 CHAR(64) NULL",
      );
    await q.query(
      "UPDATE source_documents SET active_sha256 = CASE WHEN is_active=TRUE THEN sha256 ELSE NULL END",
    );
    await q.query(
      "DROP TRIGGER IF EXISTS trg_source_documents_set_active_hash_before_insert",
    );
    await q.query(
      "DROP TRIGGER IF EXISTS trg_source_documents_set_active_hash_before_update",
    );
    await q.query(
      "CREATE TRIGGER trg_source_documents_set_active_hash_before_insert BEFORE INSERT ON source_documents FOR EACH ROW SET NEW.active_sha256 = IF(NEW.is_active, NEW.sha256, NULL)",
    );
    await q.query(
      "CREATE TRIGGER trg_source_documents_set_active_hash_before_update BEFORE UPDATE ON source_documents FOR EACH ROW SET NEW.active_sha256 = IF(NEW.is_active, NEW.sha256, NULL)",
    );
    if (!(await indexExists("uq_source_active_sha256")))
      await q.query(
        "ALTER TABLE source_documents ADD UNIQUE KEY uq_source_active_sha256 (active_sha256)",
      );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "DROP TRIGGER IF EXISTS trg_source_documents_set_active_hash_before_update",
    );
    await q.query(
      "DROP TRIGGER IF EXISTS trg_source_documents_set_active_hash_before_insert",
    );
    await q.query("DROP INDEX uq_source_active_sha256 ON source_documents");
    await q.query("DROP COLUMN active_sha256 ON source_documents");
    await q.query(
      "ALTER TABLE source_documents ADD UNIQUE KEY uq_source_sha256_active (sha256, is_active)",
    );
  }
}
