import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { normalizeArabic } from '../search/arabic-normalizer.js';

export interface NewArticleVersion {
  articleId: string; textOriginal: string; validFrom: string; validTo?: string | null;
  sourceDocumentId: string; status?: 'DRAFT'|'PUBLISHED'|'REPEALED'|'FUTURE';
}

export class TemporalConflictError extends Error {}

export class TemporalVersionService {
  constructor(private readonly db: DataSource) {}

  async create(input: NewArticleVersion): Promise<string> {
    return this.db.transaction(async (manager) => {
      const article = await manager.query('SELECT id FROM articles WHERE id=? FOR UPDATE', [input.articleId]);
      if (!article[0]) throw new Error('ARTICLE_NOT_FOUND');
      const overlap = await manager.query(`SELECT id FROM article_versions WHERE article_id=?
        AND ? < COALESCE(valid_to,'9999-12-31') AND valid_from < COALESCE(?,'9999-12-31') LIMIT 1`,
        [input.articleId, input.validFrom, input.validTo ?? null]);
      if (overlap[0]) throw new TemporalConflictError('ARTICLE_VERSION_PERIOD_OVERLAP');
      const versionRows = await manager.query('SELECT COALESCE(MAX(version_no),0)+1 nextVersion FROM article_versions WHERE article_id=?', [input.articleId]);
      const id = randomUUID();
      await manager.query(`INSERT INTO article_versions
        (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,valid_to,status,source_document_id)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [id,input.articleId,Number(versionRows[0].nextVersion),input.textOriginal,input.textOriginal,
        normalizeArabic(input.textOriginal),input.validFrom,input.validTo??null,input.status??'DRAFT',input.sourceDocumentId]);
      return id;
    });
  }
}

