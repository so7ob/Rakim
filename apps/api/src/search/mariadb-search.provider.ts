import { PUBLIC_INDEX_RECORD } from "./public-record-visibility.js";
import { Inject, Injectable } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import { normalizeArabic, parseSearchQuery } from "./arabic-normalizer.js";
import type { SearchInput, SearchProvider } from "./search.provider.js";

interface BuiltQuery {
  conditions: string[];
  values: Array<string | number>;
}

@Injectable()
export class MariaDbSearchProvider implements SearchProvider {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async search(input: SearchInput) {
    const parsed = parseSearchQuery(input.q);
    const built = await this.build(input, parsed);
    const needle = normalizeArabic(
      parsed.phrases[0] ?? parsed.include[0] ?? input.q,
    );
    const rows = await this.db.query(
      `SELECT sd.entity_type entityType, sd.entity_id entityId,
      sd.legislation_id legislationId, sd.article_id articleId, sd.version_id versionId, sd.page_number pageNumber,
      sd.title_ar titleAr, sd.text_literal textLiteral, sd.is_current isCurrent,sd.verification_level verificationLevel,
      JSON_UNQUOTE(JSON_EXTRACT(sd.metadata_json,'$.annexId')) annexId,
      DATE_FORMAT(sd.valid_from,'%Y-%m-%d') validFrom, DATE_FORMAT(sd.valid_to,'%Y-%m-%d') validTo,
      l.title_ar legislationTitle,l.legal_status legalStatus,l.year,l.official_number officialNumber,
      lt.code typeCode,lt.name_ar typeName,au.code authorityCode,au.name_ar authorityName,
      (CASE WHEN sd.title_ar LIKE ? THEN 5 ELSE 0 END + CASE WHEN sd.text_normalized LIKE ? THEN 3 ELSE 0 END +
       COALESCE(MATCH(sd.title_ar,sd.text_normalized) AGAINST (? IN NATURAL LANGUAGE MODE),0) +
       CASE WHEN sd.is_current=1 THEN 1.2 ELSE .6 END + CASE WHEN sd.verification_level IN ('A','B') THEN .5 ELSE 0 END) score
      FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id
      JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id
      WHERE ${built.conditions.join(" AND ")} ORDER BY score DESC,l.year DESC LIMIT ? OFFSET ?`,
      [
        `%${input.q}%`,
        `%${needle}%`,
        needle,
        ...built.values,
        input.pageSize,
        (input.page - 1) * input.pageSize,
      ],
    );
    const countRows = (await this.db.query(
      `SELECT COUNT(*) total FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id
      JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id
      WHERE ${built.conditions.join(" AND ")}`,
      built.values,
    )) as Array<{ total: string }>;
    const [
      typeFacets,
      yearFacets,
      authorityFacets,
      statusFacets,
      subjectFacets,
    ] = await Promise.all([
      this.facet("lt.code code,lt.name_ar name", "lt.id", "count DESC", built),
      this.facet("l.year code,l.year name", "l.year", "l.year DESC", built),
      this.facet("au.code code,au.name_ar name", "au.id", "count DESC", built),
      this.facet(
        "l.legal_status code,l.legal_status name",
        "l.legal_status",
        "count DESC",
        built,
      ),
      this.subjectFacet(built),
    ]);
    const items = (rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      snippet: this.snippet(String(row.textLiteral ?? ""), needle),
      matchedTerms: [...parsed.phrases, ...parsed.include],
    }));
    const total = Number(countRows[0]?.total ?? 0);
    return {
      query: input.q,
      items,
      meta: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        pageCount: Math.ceil(total / input.pageSize),
      },
      facets: {
        types: typeFacets,
        years: yearFacets,
        authorities: authorityFacets,
        statuses: statusFacets,
        subjects: subjectFacets,
      },
    };
  }

  async analytics(input: SearchInput) {
    const result = await this.search({ ...input, page: 1, pageSize: 500 });
    const items = result.items as Array<Record<string, unknown>>;
    const years = new Map<number, number>();
    const entities = new Map<string, number>();
    const words = new Map<string, number>();
    const queryTerms = new Set(normalizeArabic(input.q).split(" "));
    for (const item of items) {
      years.set(Number(item.year), (years.get(Number(item.year)) ?? 0) + 1);
      entities.set(
        String(item.entityType),
        (entities.get(String(item.entityType)) ?? 0) + 1,
      );
      for (const word of normalizeArabic(String(item.textLiteral ?? "")).split(
        " ",
      )) {
        if (word.length > 2 && !queryTerms.has(word))
          words.set(word, (words.get(word) ?? 0) + 1);
      }
    }
    const legislationIds = [
      ...new Set(items.map((item) => String(item.legislationId))),
    ];
    let references = 0;
    if (legislationIds.length) {
      const placeholders = legislationIds.map(() => "?").join(",");
      const rows = await this.db.query(
        `SELECT COUNT(*) count FROM legal_relations WHERE source_legislation_id IN (${placeholders}) OR target_legislation_id IN (${placeholders})`,
        [...legislationIds, ...legislationIds],
      );
      references = Number(rows[0]?.count ?? 0);
    }
    return {
      totalResults: result.meta.total,
      uniqueLegislations: legislationIds.length,
      entityDistribution: [...entities].map(([name, count]) => ({
        name,
        count,
      })),
      timeline: [...years]
        .sort((a, b) => a[0] - b[0])
        .map(([year, count]) => ({ year, count })),
      cooccurring: [...words]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([term, count]) => ({ term, count })),
      references,
    };
  }

  async exportCsv(input: SearchInput) {
    const result = await this.search({ ...input, page: 1, pageSize: 5000 });
    const quote = (value: unknown) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = [
      "نوع المحتوى",
      "التشريع",
      "الرقم",
      "السنة",
      "المادة/العنوان",
      "النسخة من",
      "النسخة إلى",
      "الصفحة",
      "المقتطف",
      "درجة الصلة",
    ];
    return [
      "\uFEFF" + header.map(quote).join(","),
      ...result.items.map((item: Record<string, unknown>) =>
        [
          item.entityType,
          item.legislationTitle,
          item.officialNumber,
          item.year,
          item.titleAr,
          item.validFrom,
          item.validTo,
          item.pageNumber,
          item.snippet,
          item.score,
        ]
          .map(quote)
          .join(","),
      ),
    ].join("\r\n");
  }

  private async build(
    input: SearchInput,
    parsed: ReturnType<typeof parseSearchQuery>,
  ): Promise<BuiltQuery> {
    const conditions = [
      PUBLIC_INDEX_RECORD,
      `l.is_active=TRUE AND l.deleted_at IS NULL AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')`,
      `(sd.entity_type<>'ARTICLE_VERSION' OR EXISTS (
        SELECT 1 FROM article_versions public_av
        JOIN articles public_a ON public_a.id=public_av.article_id WHERE public_a.is_active=TRUE AND public_a.deleted_at IS NULL AND public_av.id=sd.version_id AND public_av.status IN ('PUBLISHED','REPEALED')
          AND public_av.valid_from<=CURRENT_DATE()
      ))`,
      `(sd.entity_type<>'ANNEX_PAGE' OR EXISTS (
        SELECT 1 FROM annex_files public_af
        JOIN annex_versions public_axv ON public_axv.id=public_af.annex_version_id
        JOIN annexes public_ax ON public_ax.id=public_axv.annex_id
        WHERE public_af.id=sd.entity_id
          AND public_ax.is_active=TRUE AND public_ax.deleted_at IS NULL AND public_ax.status IN ('PUBLISHED','REPLACED','REPEALED')
          AND public_axv.valid_from<=CURRENT_DATE()
      ))`,
      `(sd.entity_type<>'RELATION' OR EXISTS (
        SELECT 1 FROM legal_relations public_lr
        JOIN legislations public_source ON public_source.id=public_lr.source_legislation_id
        JOIN legislations public_target ON public_target.id=public_lr.target_legislation_id
        WHERE public_lr.id=sd.entity_id AND public_lr.is_active=TRUE AND public_lr.deleted_at IS NULL AND public_lr.review_status='PUBLISHED'
          AND public_source.is_active=TRUE AND public_source.deleted_at IS NULL AND public_source.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
          AND public_target.is_active=TRUE AND public_target.deleted_at IS NULL AND public_target.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
      ))`,
      `(sd.entity_type<>'AMENDMENT' OR EXISTS (
        SELECT 1 FROM amendments public_am WHERE public_am.id=sd.entity_id AND public_am.is_active=TRUE AND public_am.deleted_at IS NULL AND public_am.status='PUBLISHED'
      ))`,
    ];
    const values: Array<string | number> = [];
    const synonyms = await this.synonyms();
    const terms =
      input.mode === "exact"
        ? [normalizeArabic(parsed.phrases[0] ?? input.q.replace(/["']/g, ""))]
        : [...parsed.phrases, ...parsed.include];
    const groups = terms
      .filter(Boolean)
      .map((term) => [term, ...(synonyms.get(term) ?? [])]);
    const searchable =
      input.field === "title"
        ? "sd.title_ar"
        : input.field === "number"
          ? "CONCAT(COALESCE(l.official_number,''),' ',l.year)"
          : "sd.text_normalized";
    if (groups.length) {
      if (input.mode === "any") {
        conditions.push(
          `(${groups
            .flat()
            .map(() => `${searchable} LIKE ?`)
            .join(" OR ")})`,
        );
        values.push(...groups.flat().map((term) => `%${term}%`));
      } else
        for (const group of groups) {
          conditions.push(
            `(${group.map(() => `${searchable} LIKE ?`).join(" OR ")})`,
          );
          values.push(...group.map((term) => `%${term}%`));
        }
    }
    for (const term of parsed.exclude) {
      conditions.push("sd.text_normalized NOT LIKE ?");
      values.push(`%${term}%`);
    }
    if (!input.historical && !input.at)
      conditions.push(
        `(sd.entity_type='LEGISLATION' OR sd.is_current=1 OR (sd.valid_from<=CURRENT_DATE() AND (sd.valid_to IS NULL OR sd.valid_to>CURRENT_DATE())))`,
      );
    if (input.at) {
      conditions.push(
        `(sd.entity_type='LEGISLATION' OR (sd.valid_from<=? AND (sd.valid_to IS NULL OR sd.valid_to>?)))`,
      );
      values.push(input.at, input.at);
    }
    if (input.type) {
      conditions.push("lt.code=?");
      values.push(input.type);
    }
    if (input.authority) {
      conditions.push("au.code=?");
      values.push(input.authority);
    }
    if (input.subject) {
      conditions.push(
        "EXISTS (SELECT 1 FROM legislation_subjects ls JOIN subjects s ON s.id=ls.subject_id WHERE ls.legislation_id=l.id AND s.code=?)",
      );
      values.push(input.subject);
    }
    if (input.status) {
      conditions.push("l.legal_status=?");
      values.push(input.status);
    }
    if (input.yearFrom) {
      conditions.push("l.year>=?");
      values.push(input.yearFrom);
    }
    if (input.yearTo) {
      conditions.push("l.year<=?");
      values.push(input.yearTo);
    }
    if (input.verification) {
      conditions.push("sd.verification_level=?");
      values.push(input.verification);
    }
    if (input.entityType) {
      conditions.push("sd.entity_type=?");
      values.push(input.entityType);
    }
    if (input.proximityFirst && input.proximitySecond) {
      conditions.push(
        `EXISTS (SELECT 1 FROM search_tokens p1 JOIN search_tokens p2 ON p2.search_document_id=p1.search_document_id WHERE p1.search_document_id=sd.id AND p1.term=? AND p2.term=? AND ABS(CAST(p1.position_no AS SIGNED)-CAST(p2.position_no AS SIGNED))<=?)`,
      );
      values.push(
        normalizeArabic(input.proximityFirst),
        normalizeArabic(input.proximitySecond),
        Math.min(50, Math.max(1, input.proximityDistance ?? 5)),
      );
    }
    return { conditions, values };
  }

  private async synonyms() {
    const rows = (await this.db.query(
      `SELECT term_ar term,synonym_ar synonym FROM search_synonyms sy JOIN search_synonym_sets ss ON ss.id=sy.set_id WHERE sy.is_active=TRUE AND sy.deleted_at IS NULL AND ss.is_active=TRUE AND ss.deleted_at IS NULL AND ss.status='ACTIVE'`,
    )) as Array<{ term: string; synonym: string }>;
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const term = normalizeArabic(row.term);
      const synonym = normalizeArabic(row.synonym);
      map.set(term, [...(map.get(term) ?? []), synonym]);
      map.set(synonym, [...(map.get(synonym) ?? []), term]);
    }
    return map;
  }
  private facet(
    select: string,
    group: string,
    order: string,
    built: BuiltQuery,
  ) {
    return this.db.query(
      `SELECT ${select},COUNT(DISTINCT sd.id) count FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id WHERE ${built.conditions.join(" AND ")} GROUP BY ${group} ORDER BY ${order}`,
      built.values,
    );
  }
  private subjectFacet(built: BuiltQuery) {
    return this.db.query(
      `SELECT s.code,s.name_ar name,COUNT(DISTINCT sd.id) count FROM search_documents sd JOIN legislations l ON l.id=sd.legislation_id JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id JOIN legislation_subjects ls ON ls.legislation_id=l.id JOIN subjects s ON s.id=ls.subject_id WHERE ${built.conditions.join(" AND ")} GROUP BY s.id ORDER BY count DESC`,
      built.values,
    );
  }
  private snippet(text: string, needle: string) {
    const normalized = normalizeArabic(text);
    const position = normalized.indexOf(needle);
    if (position < 0) return text.slice(0, 240);
    return `${position > 80 ? "…" : ""}${text.slice(Math.max(0, position - 80), position + needle.length + 160)}${text.length > position + needle.length + 160 ? "…" : ""}`;
  }
}
