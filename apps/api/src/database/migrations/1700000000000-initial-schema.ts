import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1700000000000 implements MigrationInterface {
  name = "InitialSchema1700000000000";

  async up(q: QueryRunner): Promise<void> {
    const statements = [
      `CREATE TABLE legislation_types (
        id CHAR(36) PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE, name_ar VARCHAR(120) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE authorities (
        id CHAR(36) PRIMARY KEY, code VARCHAR(50) NOT NULL UNIQUE, name_ar VARCHAR(200) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE subjects (
        id CHAR(36) PRIMARY KEY, parent_id CHAR(36) NULL, code VARCHAR(60) NOT NULL UNIQUE, name_ar VARCHAR(160) NOT NULL,
        version_no INT NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT fk_subject_parent FOREIGN KEY (parent_id) REFERENCES subjects(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE gazette_issues (
        id CHAR(36) PRIMARY KEY, issue_number VARCHAR(80) NOT NULL, publication_date DATE NULL,
        publisher VARCHAR(200) NULL, notes TEXT NULL, UNIQUE KEY uq_gazette_issue (issue_number, publication_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE source_documents (
        id CHAR(36) PRIMARY KEY, original_name VARCHAR(255) NOT NULL, storage_key VARCHAR(500) NOT NULL UNIQUE,
        media_type VARCHAR(120) NOT NULL, byte_size BIGINT UNSIGNED NOT NULL, sha256 CHAR(64) NOT NULL UNIQUE,
        received_at DATETIME(3) NOT NULL, obtained_from VARCHAR(255) NOT NULL, page_count INT UNSIGNED NULL,
        extraction_status ENUM('PENDING','EXTRACTED','OCR_REQUIRED','OCR_UNREVIEWED','REVIEWED','FAILED') NOT NULL DEFAULT 'PENDING',
        ocr_confidence DECIMAL(5,2) NULL, reviewed_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE legislations (
        id CHAR(36) PRIMARY KEY, display_code VARCHAR(80) NULL UNIQUE, type_id CHAR(36) NOT NULL,
        authority_id CHAR(36) NOT NULL, gazette_issue_id CHAR(36) NULL, official_number VARCHAR(80) NULL,
        year SMALLINT UNSIGNED NOT NULL, title_ar VARCHAR(1000) NOT NULL, summary_ar TEXT NULL,
        status ENUM('DRAFT','IN_REVIEW','APPROVED_FOR_PUBLISHING','PUBLISHED','AMENDED','REPEALED','SUSPENDED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
        legal_status ENUM('IN_FORCE','AMENDED','PARTIALLY_REPEALED','REPEALED','SUSPENDED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
        verification_level ENUM('A','B','C','D') NOT NULL DEFAULT 'D', issue_date DATE NULL,
        publication_date DATE NULL, effective_from DATE NULL, repeal_date DATE NULL,
        last_reviewed_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_legislation_type FOREIGN KEY (type_id) REFERENCES legislation_types(id),
        CONSTRAINT fk_legislation_authority FOREIGN KEY (authority_id) REFERENCES authorities(id),
        CONSTRAINT fk_legislation_gazette FOREIGN KEY (gazette_issue_id) REFERENCES gazette_issues(id),
        KEY idx_legislation_list (status, year, type_id), KEY idx_legislation_authority (authority_id, year),
        FULLTEXT KEY ft_legislation_title (title_ar, summary_ar)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE legislation_subjects (
        legislation_id CHAR(36) NOT NULL, subject_id CHAR(36) NOT NULL,
        PRIMARY KEY (legislation_id, subject_id),
        CONSTRAINT fk_ls_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
        CONSTRAINT fk_ls_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE legislation_versions (
        id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NOT NULL, version_no INT UNSIGNED NOT NULL,
        workflow_status ENUM('INBOX','DRAFT','IN_REVIEW','APPROVED_FOR_PUBLISHING','PUBLISHED','ARCHIVED') NOT NULL,
        content_kind ENUM('OFFICIAL','EXTRACTED','CONSOLIDATED_INTERNAL') NOT NULL,
        source_document_id CHAR(36) NOT NULL, valid_from DATE NOT NULL, valid_to DATE NULL,
        previous_version_id CHAR(36) NULL, published_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_legislation_version (legislation_id, version_no),
        CONSTRAINT fk_lv_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id),
        CONSTRAINT fk_lv_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
        CONSTRAINT fk_lv_previous FOREIGN KEY (previous_version_id) REFERENCES legislation_versions(id),
        CONSTRAINT ck_lv_period CHECK (valid_to IS NULL OR valid_to > valid_from)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE structure_nodes (
        id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NOT NULL, parent_id CHAR(36) NULL,
        node_type ENUM('PREAMBLE','BOOK','PART','TITLE','CHAPTER','SECTION','SUBSECTION') NOT NULL,
        label_ar VARCHAR(120) NULL, title_ar VARCHAR(500) NOT NULL, sort_key VARCHAR(120) NOT NULL,
        CONSTRAINT fk_structure_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
        CONSTRAINT fk_structure_parent FOREIGN KEY (parent_id) REFERENCES structure_nodes(id),
        KEY idx_structure_order (legislation_id, sort_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE articles (
        id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NOT NULL, structure_node_id CHAR(36) NULL,
        published_label VARCHAR(120) NOT NULL, current_label VARCHAR(120) NOT NULL, sort_key VARCHAR(120) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_article_label (legislation_id, current_label),
        CONSTRAINT fk_article_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
        CONSTRAINT fk_article_structure FOREIGN KEY (structure_node_id) REFERENCES structure_nodes(id),
        KEY idx_article_order (legislation_id, sort_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE article_versions (
        id CHAR(36) PRIMARY KEY, article_id CHAR(36) NOT NULL, version_no INT UNSIGNED NOT NULL,
        text_original LONGTEXT NOT NULL, text_structured LONGTEXT NOT NULL, text_normalized LONGTEXT NOT NULL,
        valid_from DATE NOT NULL, valid_to DATE NULL, status ENUM('DRAFT','PUBLISHED','REPEALED','FUTURE') NOT NULL,
        ending_reason VARCHAR(500) NULL, source_document_id CHAR(36) NOT NULL, previous_version_id CHAR(36) NULL,
        verified_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_article_version (article_id, version_no),
        CONSTRAINT fk_av_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE RESTRICT,
        CONSTRAINT fk_av_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
        CONSTRAINT fk_av_previous FOREIGN KEY (previous_version_id) REFERENCES article_versions(id),
        CONSTRAINT ck_av_period CHECK (valid_to IS NULL OR valid_to > valid_from),
        KEY idx_av_temporal (article_id, valid_from, valid_to), FULLTEXT KEY ft_av_text (text_normalized)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE paragraphs (
        id CHAR(36) PRIMARY KEY, article_version_id CHAR(36) NOT NULL, stable_locator VARCHAR(160) NOT NULL,
        published_label VARCHAR(120) NULL, sort_key VARCHAR(120) NOT NULL, text_original LONGTEXT NOT NULL,
        CONSTRAINT fk_paragraph_version FOREIGN KEY (article_version_id) REFERENCES article_versions(id) ON DELETE CASCADE,
        UNIQUE KEY uq_paragraph_locator (article_version_id, stable_locator)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE amendments (
        id CHAR(36) PRIMARY KEY, amended_legislation_id CHAR(36) NOT NULL, instrument_legislation_id CHAR(36) NULL,
        title_ar VARCHAR(1000) NOT NULL, issue_date DATE NULL, effective_from DATE NOT NULL,
        source_document_id CHAR(36) NOT NULL, status ENUM('DRAFT','REVIEWED','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
        CONSTRAINT fk_amendment_target FOREIGN KEY (amended_legislation_id) REFERENCES legislations(id),
        CONSTRAINT fk_amendment_instrument FOREIGN KEY (instrument_legislation_id) REFERENCES legislations(id),
        CONSTRAINT fk_amendment_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE amendment_operations (
        id CHAR(36) PRIMARY KEY, amendment_id CHAR(36) NOT NULL,
        operation_type ENUM('ADD','REPLACE','DELETE','REPEAL','RENUMBER','CORRECT') NOT NULL,
        target_kind ENUM('LEGISLATION','ARTICLE','PARAGRAPH') NOT NULL, target_id CHAR(36) NOT NULL,
        effective_from DATE NOT NULL, application_order INT UNSIGNED NOT NULL, citation_text TEXT NOT NULL,
        source_document_id CHAR(36) NOT NULL,
        CONSTRAINT fk_operation_amendment FOREIGN KEY (amendment_id) REFERENCES amendments(id) ON DELETE CASCADE,
        CONSTRAINT fk_operation_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
        UNIQUE KEY uq_operation_order (amendment_id, application_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE article_modifications (
        id CHAR(36) PRIMARY KEY, operation_id CHAR(36) NOT NULL, article_id CHAR(36) NOT NULL,
        paragraph_locator VARCHAR(160) NULL, before_version_id CHAR(36) NULL, after_version_id CHAR(36) NULL,
        previous_text LONGTEXT NULL, new_text LONGTEXT NULL, effective_from DATE NOT NULL,
        CONSTRAINT fk_mod_operation FOREIGN KEY (operation_id) REFERENCES amendment_operations(id),
        CONSTRAINT fk_mod_article FOREIGN KEY (article_id) REFERENCES articles(id),
        CONSTRAINT fk_mod_before FOREIGN KEY (before_version_id) REFERENCES article_versions(id),
        CONSTRAINT fk_mod_after FOREIGN KEY (after_version_id) REFERENCES article_versions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE previous_text_snapshots (
        id CHAR(36) PRIMARY KEY, article_version_id CHAR(36) NOT NULL, modification_id CHAR(36) NOT NULL,
        article_label VARCHAR(120) NOT NULL, full_text LONGTEXT NOT NULL, valid_from DATE NOT NULL, valid_to DATE NOT NULL,
        ending_reason VARCHAR(500) NOT NULL, source_document_id CHAR(36) NOT NULL,
        CONSTRAINT fk_snapshot_version FOREIGN KEY (article_version_id) REFERENCES article_versions(id),
        CONSTRAINT fk_snapshot_modification FOREIGN KEY (modification_id) REFERENCES article_modifications(id),
        CONSTRAINT fk_snapshot_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE annexes (
        id CHAR(36) PRIMARY KEY, legislation_id CHAR(36) NOT NULL,
        annex_type ENUM('EXECUTIVE_REGULATION','TABLE','FORM','ANNEX','MAP','TARIFF','LIST','CORRECTION') NOT NULL,
        title_ar VARCHAR(1000) NOT NULL, status ENUM('DRAFT','PUBLISHED','REPLACED','REPEALED') NOT NULL,
        CONSTRAINT fk_annex_legislation FOREIGN KEY (legislation_id) REFERENCES legislations(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE annex_versions (
        id CHAR(36) PRIMARY KEY, annex_id CHAR(36) NOT NULL, version_no INT UNSIGNED NOT NULL,
        valid_from DATE NOT NULL, valid_to DATE NULL, source_document_id CHAR(36) NOT NULL,
        previous_version_id CHAR(36) NULL, structured_table_json JSON NULL,
        UNIQUE KEY uq_annex_version (annex_id, version_no),
        CONSTRAINT fk_annex_version_annex FOREIGN KEY (annex_id) REFERENCES annexes(id),
        CONSTRAINT fk_annex_version_source FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
        CONSTRAINT fk_annex_version_previous FOREIGN KEY (previous_version_id) REFERENCES annex_versions(id),
        CONSTRAINT ck_annex_period CHECK (valid_to IS NULL OR valid_to > valid_from)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE annex_files (
        id CHAR(36) PRIMARY KEY, annex_version_id CHAR(36) NOT NULL, storage_key VARCHAR(500) NOT NULL UNIQUE,
        original_name VARCHAR(255) NOT NULL, media_type VARCHAR(120) NOT NULL, byte_size BIGINT UNSIGNED NOT NULL,
        sha256 CHAR(64) NOT NULL UNIQUE, page_count INT UNSIGNED NULL, extracted_text LONGTEXT NULL,
        ocr_status ENUM('NOT_REQUIRED','PENDING','UNREVIEWED','REVIEWED','FAILED') NOT NULL,
        CONSTRAINT fk_annex_file_version FOREIGN KEY (annex_version_id) REFERENCES annex_versions(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE viewer_metadata (
        id CHAR(36) PRIMARY KEY, annex_file_id CHAR(36) NOT NULL UNIQUE, bookmarks_json JSON NULL,
        page_text_json JSON NULL, search_positions_json JSON NULL, default_rotation SMALLINT NOT NULL DEFAULT 0,
        CONSTRAINT fk_viewer_file FOREIGN KEY (annex_file_id) REFERENCES annex_files(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE legal_relations (
        id CHAR(36) PRIMARY KEY, source_legislation_id CHAR(36) NOT NULL, target_legislation_id CHAR(36) NOT NULL,
        relation_type ENUM('AMENDS','REPEALS','IMPLEMENTS','BASED_ON','REFERS_TO','CORRECTS','TOPICALLY_RELATED') NOT NULL,
        scope_text VARCHAR(1000) NULL, effective_from DATE NULL, source_document_id CHAR(36) NULL,
        review_status ENUM('UNREVIEWED','REVIEWED','REJECTED') NOT NULL DEFAULT 'UNREVIEWED',
        CONSTRAINT fk_relation_source_leg FOREIGN KEY (source_legislation_id) REFERENCES legislations(id),
        CONSTRAINT fk_relation_target_leg FOREIGN KEY (target_legislation_id) REFERENCES legislations(id),
        CONSTRAINT fk_relation_evidence FOREIGN KEY (source_document_id) REFERENCES source_documents(id),
        UNIQUE KEY uq_legal_relation (source_legislation_id, target_legislation_id, relation_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE verification_records (
        id CHAR(36) PRIMARY KEY, entity_type VARCHAR(80) NOT NULL, entity_id CHAR(36) NOT NULL,
        level ENUM('A','B','C','D') NOT NULL, reviewer_id CHAR(36) NULL, verified_at DATETIME(3) NOT NULL,
        notes TEXT NULL, KEY idx_verification_entity (entity_type, entity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE roles (
        id CHAR(36) PRIMARY KEY, code VARCHAR(60) NOT NULL UNIQUE, name_ar VARCHAR(120) NOT NULL,
        permissions_json JSON NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE users (
        id CHAR(36) PRIMARY KEY, username VARCHAR(120) NOT NULL UNIQUE, display_name VARCHAR(200) NOT NULL,
        password_hash VARCHAR(255) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE user_roles (
        user_id CHAR(36) NOT NULL, role_id CHAR(36) NOT NULL, PRIMARY KEY (user_id, role_id),
        CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE favorites (
        user_id CHAR(36) NOT NULL, legislation_id CHAR(36) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (user_id, legislation_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE saved_searches (
        id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, name_ar VARCHAR(200) NOT NULL, query_json JSON NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE user_notes (
        id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, entity_type VARCHAR(80) NOT NULL, entity_id CHAR(36) NOT NULL,
        note_text TEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE reports (
        id CHAR(36) PRIMARY KEY, reporter_id CHAR(36) NULL, entity_type VARCHAR(80) NOT NULL, entity_id CHAR(36) NOT NULL,
        category VARCHAR(80) NOT NULL, details TEXT NOT NULL, status ENUM('OPEN','TRIAGED','RESOLVED','REJECTED') NOT NULL DEFAULT 'OPEN',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), FOREIGN KEY (reporter_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE audit_logs (
        id CHAR(36) PRIMARY KEY, actor_id CHAR(36) NULL, action VARCHAR(100) NOT NULL, entity_type VARCHAR(80) NOT NULL,
        entity_id CHAR(36) NOT NULL, before_json JSON NULL, after_json JSON NULL, reason VARCHAR(1000) NOT NULL,
        occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), request_id VARCHAR(100) NULL,
        FOREIGN KEY (actor_id) REFERENCES users(id), KEY idx_audit_entity (entity_type, entity_id, occurred_at),
        KEY idx_audit_actor (actor_id, occurred_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE job_queue (
        id CHAR(36) PRIMARY KEY, job_type VARCHAR(80) NOT NULL, payload_json JSON NOT NULL,
        status ENUM('READY','RUNNING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'READY', priority INT NOT NULL DEFAULT 100,
        available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), locked_by VARCHAR(120) NULL, locked_at DATETIME(3) NULL,
        attempts INT UNSIGNED NOT NULL DEFAULT 0, last_error TEXT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_job_claim (status, available_at, priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE search_synonym_sets (
        id CHAR(36) PRIMARY KEY, version_no INT UNSIGNED NOT NULL UNIQUE, status ENUM('DRAFT','ACTIVE','ARCHIVED') NOT NULL,
        published_at DATETIME(3) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE search_synonyms (
        id CHAR(36) PRIMARY KEY, set_id CHAR(36) NOT NULL, term_ar VARCHAR(200) NOT NULL, synonym_ar VARCHAR(200) NOT NULL,
        FOREIGN KEY (set_id) REFERENCES search_synonym_sets(id) ON DELETE CASCADE,
        UNIQUE KEY uq_synonym (set_id, term_ar, synonym_ar)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TABLE search_documents (
        id CHAR(36) PRIMARY KEY, entity_type ENUM('LEGISLATION','ARTICLE_VERSION','AMENDMENT','ANNEX_PAGE','RELATION') NOT NULL,
        entity_id CHAR(36) NOT NULL, legislation_id CHAR(36) NULL, article_id CHAR(36) NULL, version_id CHAR(36) NULL,
        page_number INT UNSIGNED NULL, title_ar VARCHAR(1000) NOT NULL, text_literal LONGTEXT NOT NULL,
        text_normalized LONGTEXT NOT NULL, is_current BOOLEAN NOT NULL DEFAULT TRUE, valid_from DATE NULL, valid_to DATE NULL,
        verification_level ENUM('A','B','C','D') NOT NULL DEFAULT 'D', metadata_json JSON NULL,
        UNIQUE KEY uq_search_entity (entity_type, entity_id, page_number),
        KEY idx_search_scope (legislation_id, is_current, valid_from, valid_to),
        FULLTEXT KEY ft_search_content (title_ar, text_normalized),
        FOREIGN KEY (legislation_id) REFERENCES legislations(id) ON DELETE CASCADE,
        FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      `CREATE TRIGGER trg_article_versions_no_overlap_insert BEFORE INSERT ON article_versions FOR EACH ROW
       BEGIN
         IF EXISTS (
           SELECT 1 FROM article_versions av WHERE av.article_id = NEW.article_id
           AND NEW.valid_from < COALESCE(av.valid_to, '9999-12-31')
           AND av.valid_from < COALESCE(NEW.valid_to, '9999-12-31')
         ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ARTICLE_VERSION_PERIOD_OVERLAP'; END IF;
       END`,
      `CREATE TRIGGER trg_article_versions_no_overlap_update BEFORE UPDATE ON article_versions FOR EACH ROW
       BEGIN
         IF OLD.status = 'PUBLISHED' AND (NOT (NEW.text_original <=> OLD.text_original) OR NOT (NEW.text_structured <=> OLD.text_structured))
         THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'PUBLISHED_ARTICLE_VERSION_IMMUTABLE'; END IF;
         IF EXISTS (
           SELECT 1 FROM article_versions av WHERE av.article_id = NEW.article_id AND av.id <> NEW.id
           AND NEW.valid_from < COALESCE(av.valid_to, '9999-12-31')
           AND av.valid_from < COALESCE(NEW.valid_to, '9999-12-31')
         ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ARTICLE_VERSION_PERIOD_OVERLAP'; END IF;
       END`,
      `CREATE TRIGGER trg_audit_logs_immutable_update BEFORE UPDATE ON audit_logs FOR EACH ROW
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT_LOG_IMMUTABLE'`,
      `CREATE TRIGGER trg_audit_logs_immutable_delete BEFORE DELETE ON audit_logs FOR EACH ROW
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT_LOG_IMMUTABLE'`,
    ];
    for (const sql of statements) await q.query(sql);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TRIGGER IF EXISTS trg_audit_logs_immutable_delete");
    await q.query("DROP TRIGGER IF EXISTS trg_audit_logs_immutable_update");
    await q.query(
      "DROP TRIGGER IF EXISTS trg_article_versions_no_overlap_update",
    );
    await q.query(
      "DROP TRIGGER IF EXISTS trg_article_versions_no_overlap_insert",
    );
    const tables = [
      "search_documents",
      "search_synonyms",
      "search_synonym_sets",
      "job_queue",
      "audit_logs",
      "reports",
      "user_notes",
      "saved_searches",
      "favorites",
      "user_roles",
      "users",
      "roles",
      "verification_records",
      "legal_relations",
      "viewer_metadata",
      "annex_files",
      "annex_versions",
      "annexes",
      "previous_text_snapshots",
      "article_modifications",
      "amendment_operations",
      "amendments",
      "paragraphs",
      "article_versions",
      "articles",
      "structure_nodes",
      "legislation_versions",
      "legislation_subjects",
      "legislations",
      "source_documents",
      "gazette_issues",
      "subjects",
      "authorities",
      "legislation_types",
    ];
    for (const table of tables) await q.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
