import type { MigrationInterface, QueryRunner } from "typeorm";

export class AdminWorkflow1700000000002 implements MigrationInterface {
  name = "AdminWorkflow1700000000002";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users
      ADD COLUMN failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN locked_until DATETIME(3) NULL,
      ADD COLUMN last_login_at DATETIME(3) NULL,
      ADD COLUMN password_changed_at DATETIME(3) NULL,
      ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`);
    await q.query(`ALTER TABLE legislations MODIFY status
      ENUM('INBOX','DRAFT','IN_REVIEW','APPROVED_FOR_PUBLISHING','PUBLISHED','AMENDED','REPEALED','SUSPENDED','ARCHIVED')
      NOT NULL DEFAULT 'DRAFT'`);
    await q.query(`ALTER TABLE source_documents ADD COLUMN created_by CHAR(36) NULL,
      ADD CONSTRAINT fk_source_created_by FOREIGN KEY (created_by) REFERENCES users(id)`);
    await q.query(`ALTER TABLE job_queue
      ADD COLUMN progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN completed_at DATETIME(3) NULL,
      ADD CONSTRAINT ck_job_progress CHECK (progress BETWEEN 0 AND 100)`);

    await q.query(`CREATE TABLE user_sessions (
      id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
      csrf_hash CHAR(64) NOT NULL, expires_at DATETIME(3) NOT NULL, last_seen_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL, ip_address VARCHAR(64) NULL, user_agent VARCHAR(500) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      KEY idx_session_expiry (expires_at, revoked_at), KEY idx_session_user (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE source_imports (
      id CHAR(36) PRIMARY KEY, source_document_id CHAR(36) NOT NULL UNIQUE, legislation_id CHAR(36) NULL,
      uploaded_by CHAR(36) NOT NULL, status ENUM('INBOX','QUEUED','EXTRACTING','OCR_REQUIRED','OCR_RUNNING','READY_FOR_REVIEW','REVIEWED','FAILED') NOT NULL DEFAULT 'INBOX',
      detected_format VARCHAR(80) NOT NULL, extracted_text LONGTEXT NULL, extraction_json JSON NULL,
      error_details TEXT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_import_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
      CONSTRAINT fk_import_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id),
      CONSTRAINT fk_import_user FOREIGN KEY (uploaded_by) REFERENCES users(id),
      KEY idx_import_status (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE workflow_events (
      id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NOT NULL, actor_id CHAR(36) NOT NULL,
      from_status VARCHAR(50) NOT NULL, to_status VARCHAR(50) NOT NULL, action VARCHAR(80) NOT NULL,
      reason VARCHAR(1000) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_workflow_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id),
      CONSTRAINT fk_workflow_actor FOREIGN KEY (actor_id) REFERENCES users(id),
      KEY idx_workflow_legislation (legislation_id, created_at), KEY idx_workflow_actor (actor_id, action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE content_responsibilities (
      legislation_id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL,
      duty ENUM('IMPORT','EDIT','REVIEW','APPROVE','PUBLISH') NOT NULL,
      assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (legislation_id, user_id, duty),
      CONSTRAINT fk_responsibility_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
      CONSTRAINT fk_responsibility_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE quality_issues (
      id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NULL, source_document_id CHAR(36) NULL,
      issue_code VARCHAR(80) NOT NULL, severity ENUM('INFO','WARNING','ERROR') NOT NULL,
      message_ar VARCHAR(1000) NOT NULL, status ENUM('OPEN','RESOLVED','IGNORED') NOT NULL DEFAULT 'OPEN',
      detected_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), resolved_at DATETIME(3) NULL,
      resolved_by CHAR(36) NULL, resolution_note VARCHAR(1000) NULL,
      CONSTRAINT fk_quality_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
      CONSTRAINT fk_quality_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
      CONSTRAINT fk_quality_resolver FOREIGN KEY (resolved_by) REFERENCES users(id),
      KEY idx_quality_status (status, severity, detected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    await q.query(`CREATE TABLE search_tokens (
      search_document_id CHAR(36) NOT NULL, term VARCHAR(190) NOT NULL, position_no INT UNSIGNED NOT NULL,
      PRIMARY KEY (search_document_id, position_no),
      CONSTRAINT fk_token_document FOREIGN KEY (search_document_id) REFERENCES search_documents(id) ON DELETE CASCADE,
      KEY idx_token_term_position (term, search_document_id, position_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const table of [
      "search_tokens",
      "quality_issues",
      "content_responsibilities",
      "workflow_events",
      "source_imports",
      "user_sessions",
    ]) {
      await q.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await q.query(
      "ALTER TABLE job_queue DROP CONSTRAINT ck_job_progress, DROP COLUMN completed_at, DROP COLUMN progress",
    );
    await q.query(
      "ALTER TABLE source_documents DROP FOREIGN KEY fk_source_created_by, DROP COLUMN created_by",
    );
    await q.query(
      "ALTER TABLE users DROP COLUMN updated_at, DROP COLUMN password_changed_at, DROP COLUMN last_login_at, DROP COLUMN locked_until, DROP COLUMN failed_login_count",
    );
    await q.query(`ALTER TABLE legislations MODIFY status
      ENUM('DRAFT','IN_REVIEW','APPROVED_FOR_PUBLISHING','PUBLISHED','AMENDED','REPEALED','SUSPENDED','ARCHIVED')
      NOT NULL DEFAULT 'DRAFT'`);
  }
}
