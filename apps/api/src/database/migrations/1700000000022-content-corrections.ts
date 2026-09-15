import type { MigrationInterface, QueryRunner } from "typeorm";
export class ContentCorrections1700000000022 implements MigrationInterface {
  name = "ContentCorrections1700000000022";
  async up(q: QueryRunner) {
    await q.query(`CREATE TABLE content_corrections (
   id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NOT NULL,
   target_kind ENUM('ARTICLE','LEGISLATION','ANNEX') NOT NULL, target_id CHAR(36) NOT NULL,
   base_version_id CHAR(36) NOT NULL, base_hash CHAR(64) NOT NULL,
   before_json JSON NOT NULL, payload_json JSON NOT NULL, effective_from DATE NOT NULL,
   source_document_id CHAR(36) NOT NULL,
   status ENUM('DRAFT','APPROVED','PUBLISHED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
   created_by CHAR(36) NOT NULL, approved_by CHAR(36) NULL, published_by CHAR(36) NULL,
   reason VARCHAR(1000) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
   published_at DATETIME(3) NULL, published_version_id CHAR(36) NULL,
   FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
   FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
   KEY idx_correction_target (target_kind,target_id,status), KEY idx_correction_law (legislation_id,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }
  async down(q: QueryRunner) {
    await q.query("DROP TABLE content_corrections");
  }
}
