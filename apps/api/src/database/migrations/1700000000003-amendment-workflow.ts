import type { MigrationInterface, QueryRunner } from "typeorm";

export class AmendmentWorkflow1700000000003 implements MigrationInterface {
  name = "AmendmentWorkflow1700000000003";
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE amendments ADD COLUMN created_by CHAR(36) NULL,ADD COLUMN reviewed_by CHAR(36) NULL,ADD COLUMN reviewed_at DATETIME(3) NULL,ADD COLUMN published_at DATETIME(3) NULL,ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),ADD CONSTRAINT fk_amendment_creator FOREIGN KEY (created_by) REFERENCES users(id),ADD CONSTRAINT fk_amendment_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id),ADD KEY idx_amendment_workflow (status,created_at)`,
    );
    await q.query(
      `ALTER TABLE amendment_operations ADD COLUMN target_locator VARCHAR(160) NULL,ADD COLUMN proposed_text LONGTEXT NULL,ADD COLUMN proposed_label VARCHAR(120) NULL,ADD COLUMN created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "ALTER TABLE amendment_operations DROP COLUMN created_at,DROP COLUMN proposed_label,DROP COLUMN proposed_text,DROP COLUMN target_locator",
    );
    await q.query(
      "ALTER TABLE amendments DROP INDEX idx_amendment_workflow,DROP FOREIGN KEY fk_amendment_reviewer,DROP FOREIGN KEY fk_amendment_creator,DROP COLUMN created_at,DROP COLUMN published_at,DROP COLUMN reviewed_at,DROP COLUMN reviewed_by,DROP COLUMN created_by",
    );
  }
}
