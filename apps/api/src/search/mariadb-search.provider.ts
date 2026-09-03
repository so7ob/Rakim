import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DATABASE } from '../database/database.module.js';
import { normalizeArabic, parseSearchQuery } from './arabic-normalizer.js';
import type { SearchInput, SearchProvider } from './search.provider.js';

@Injectable()
export class MariaDbSearchProvider implements SearchProvider {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async search(input: SearchInput) {
    const parsed = parseSearchQuery(input.q);
    const conditions = [`l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')`];
    const values: Array<string | number> = [];
    for (const term of [...parsed.phrases, ...parsed.include]) {
      conditions.push('sd.text_normalized LIKE ?'); values.push(`%${term}%`);
    }
    for (const term of parsed.exclude) { conditions.push('sd.text_normalized NOT LIKE ?'); values.push(`%${term}%`); }
    if (!input.historical && !input.at) conditions.push(`(sd.entity_type='LEGISLATION' OR sd.is_current=1 OR (sd.valid_from<=CURRENT_DATE() AND (sd.valid_to IS NULL OR sd.valid_to>CURRENT_DATE())))`);
    if (input.at) {
      conditions.push(`(sd.entity_type='LEGISLATION' OR (sd.valid_from<=? AND (sd.valid_to IS NULL OR sd.valid_to>?)))`);
      values.push(input.at, input.at);
    }
    const needle = normalizeArabic([...parsed.phrases, ...parsed.include][0] ?? input.q);
    const rows = await this.db.query(`SELECT sd.entity_type entityType, sd.entity_id entityId,
      sd.legislation_id legislationId, sd.article_id articleId, sd.version_id versionId, sd.page_number pageNumber,
      sd.title_ar titleAr, sd.text_literal textLiteral, sd.is_current isCurrent,
      DATE_FORMAT(sd.valid_from,'%Y-%m-%d') validFrom, DATE_FORMAT(sd.valid_to,'%Y-%m-%d') validTo,
      l.title_ar legislationTitle, l.year, l.official_number officialNumber, lt.name_ar typeName,
      (CASE WHEN sd.title_ar LIKE ? THEN 5 ELSE 0 END + CASE WHEN sd.text_normalized LIKE ? THEN 3 ELSE 0 END +
       COALESCE(MATCH(sd.title_ar,sd.text_normalized) AGAINST (? IN NATURAL LANGUAGE MODE),0) +
       CASE WHEN sd.is_current=1 THEN 1.2 ELSE .6 END) score
      FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id JOIN legislation_types lt ON lt.id=l.type_id
      WHERE ${conditions.join(' AND ')} ORDER BY score DESC, l.year DESC LIMIT ? OFFSET ?`,
      [`%${input.q}%`, `%${needle}%`, needle, ...values, input.pageSize, (input.page - 1) * input.pageSize]);
    const countRows = await this.db.query(`SELECT COUNT(*) total FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id
      WHERE ${conditions.join(' AND ')}`, values) as Array<{total:string}>;
    const facets = await this.db.query(`SELECT lt.code, lt.name_ar name, COUNT(DISTINCT sd.id) count
      FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id JOIN legislation_types lt ON lt.id=l.type_id
      WHERE ${conditions.join(' AND ')} GROUP BY lt.id ORDER BY count DESC`, values);
    const items = (rows as Array<Record<string, unknown>>).map((row) => ({ ...row, snippet: this.snippet(String(row.textLiteral ?? ''), needle) }));
    const total = Number(countRows[0]?.total ?? 0);
    return { query: input.q, items, meta: { page: input.page, pageSize: input.pageSize, total, pageCount: Math.ceil(total / input.pageSize) }, facets: { types: facets } };
  }

  private snippet(text: string, needle: string): string {
    const normalized = normalizeArabic(text);
    const position = normalized.indexOf(needle);
    if (position < 0) return text.slice(0, 220);
    return `${position > 70 ? '…' : ''}${text.slice(Math.max(0, position - 70), position + needle.length + 150)}${text.length > position + 150 ? '…' : ''}`;
  }
}
