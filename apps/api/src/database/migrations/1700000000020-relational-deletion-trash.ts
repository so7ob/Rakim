import type { MigrationInterface, QueryRunner } from "typeorm";

export class RelationalDeletionTrash1700000000020 implements MigrationInterface {
  name = "RelationalDeletionTrash1700000000020";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE deletion_batches (
      id CHAR(36) PRIMARY KEY,
      root_kind ENUM('legislations','imports') NOT NULL,
      root_id CHAR(36) NOT NULL,
      root_label VARCHAR(1000) NOT NULL,
      status ENUM('CANCELLING','TRASHED','RESTORED','PURGING','PURGED','PURGE_FAILED') NOT NULL,
      actor_id CHAR(36) NULL,
      restored_by CHAR(36) NULL,
      reason VARCHAR(1000) NOT NULL,
      impact_token CHAR(64) NOT NULL,
      selected_optional_json JSON NOT NULL,
      summary_json JSON NOT NULL,
      restore_until DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      restored_at DATETIME(3) NULL,
      purged_at DATETIME(3) NULL,
      last_error TEXT NULL,
      CONSTRAINT fk_deletion_actor FOREIGN KEY (actor_id) REFERENCES users(id),
      CONSTRAINT fk_deletion_restorer FOREIGN KEY (restored_by) REFERENCES users(id),
      KEY idx_deletion_status (status, restore_until, created_at),
      KEY idx_deletion_root (root_kind, root_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE deletion_batch_items (
      batch_id CHAR(36) NOT NULL,
      item_kind VARCHAR(80) NOT NULL,
      item_id CHAR(36) NOT NULL,
      relation_key VARCHAR(120) NOT NULL,
      label_ar VARCHAR(1000) NOT NULL,
      is_required BOOLEAN NOT NULL DEFAULT TRUE,
      snapshot_json JSON NOT NULL,
      PRIMARY KEY (batch_id, item_kind, item_id),
      CONSTRAINT fk_deletion_item_batch FOREIGN KEY (batch_id)
        REFERENCES deletion_batches(id) ON DELETE CASCADE,
      KEY idx_deletion_item_lookup (item_kind, item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`ALTER TABLE source_imports
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN deleted_at DATETIME(3) NULL,
      ADD KEY idx_source_import_deleted (deleted_at, status, created_at)`);

    await q.query(`ALTER TABLE job_queue
      MODIFY status ENUM('READY','RUNNING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'READY',
      ADD COLUMN cancel_requested_at DATETIME(3) NULL,
      ADD COLUMN cancelled_at DATETIME(3) NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      "UPDATE job_queue SET status='FAILED',last_error=COALESCE(last_error,'Cancelled before relational trash migration rollback') WHERE status='CANCELLED'",
    );
    await q.query(
      "ALTER TABLE job_queue DROP COLUMN cancelled_at, DROP COLUMN cancel_requested_at, MODIFY status ENUM('READY','RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'READY'",
    );
    await q.query(
      "ALTER TABLE source_imports DROP KEY idx_source_import_deleted, DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query("DROP TABLE deletion_batch_items");
    await q.query("DROP TABLE deletion_batches");
  }
}
