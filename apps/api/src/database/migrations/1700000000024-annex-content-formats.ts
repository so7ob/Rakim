import type { MigrationInterface, QueryRunner } from "typeorm";

export class AnnexContentFormats1700000000024 implements MigrationInterface {
  name = "AnnexContentFormats1700000000024";

  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE annex_versions ADD COLUMN content_format ENUM('TEXT','STRUCTURED_TABLE','FILE') NOT NULL DEFAULT 'FILE' AFTER previous_version_id, ADD COLUMN text_content LONGTEXT NULL AFTER content_format",
    );
    await q.query(
      "UPDATE annex_versions SET content_format='STRUCTURED_TABLE' WHERE structured_table_json IS NOT NULL",
    );
  }

  async down(q: QueryRunner) {
    await q.query(
      "ALTER TABLE annex_versions DROP COLUMN text_content, DROP COLUMN content_format",
    );
  }
}
