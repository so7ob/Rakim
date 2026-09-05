import type { MigrationInterface, QueryRunner } from "typeorm";

export class MultiSourceImports1700000000014 implements MigrationInterface {
  name = "MultiSourceImports1700000000014";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE source_import_attachments (
      source_import_id CHAR(36) NOT NULL,
      source_document_id CHAR(36) NOT NULL,
      attachment_role ENUM('OFFICIAL_PDF') NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (source_import_id, source_document_id),
      UNIQUE KEY uq_import_attachment_source (source_document_id),
      CONSTRAINT fk_import_attachment_import FOREIGN KEY (source_import_id)
        REFERENCES source_imports(id) ON DELETE CASCADE,
      CONSTRAINT fk_import_attachment_source FOREIGN KEY (source_document_id)
        REFERENCES source_documents(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE legislation_source_documents (
      legislation_id CHAR(36) NOT NULL,
      source_document_id CHAR(36) NOT NULL,
      source_role ENUM('EXTRACTION','OFFICIAL_PDF','SUPPORTING') NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (legislation_id, source_document_id),
      KEY idx_legislation_source_document (source_document_id),
      KEY idx_legislation_source_role (legislation_id, source_role),
      CONSTRAINT fk_legislation_source_legislation FOREIGN KEY (legislation_id)
        REFERENCES legislations(id) ON DELETE CASCADE,
      CONSTRAINT fk_legislation_source_document FOREIGN KEY (source_document_id)
        REFERENCES source_documents(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`INSERT IGNORE INTO legislation_source_documents
      (legislation_id,source_document_id,source_role)
      SELECT legislation_id,source_document_id,'EXTRACTION'
      FROM legislation_versions`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE legislation_source_documents");
    await q.query("DROP TABLE source_import_attachments");
  }
}
