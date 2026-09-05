import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";
import type { CreateLegislationDto } from "./create-legislation.dto.js";
import type { AuthUser } from "../auth/auth.types.js";

type QueryValue = string | number | null;

@Injectable()
export class LegislationsService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async list(query: Record<string, string | undefined>) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(query.pageSize ?? 10) || 10),
    );
    const archived = query.archived === "1" || query.archived === "true";
    const where = [
      archived
        ? `(l.status='ARCHIVED' OR l.legal_status IN ('REPEALED','PARTIALLY_REPEALED'))`
        : `l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')`,
    ];
    const values: QueryValue[] = [];
    if (query.q?.trim()) {
      where.push(
        `EXISTS (SELECT 1 FROM search_documents sd WHERE sd.legislation_id = l.id AND sd.text_normalized LIKE ?)`,
      );
      values.push(`%${normalizeArabic(query.q)}%`);
    }
    if (query.type) {
      where.push("lt.code = ?");
      values.push(query.type);
    }
    if (query.authority) {
      where.push("au.code = ?");
      values.push(query.authority);
    }
    if (query.status) {
      where.push("l.legal_status = ?");
      values.push(query.status);
    }
    if (query.yearFrom) {
      where.push("l.year >= ?");
      values.push(Number(query.yearFrom));
    }
    if (query.yearTo) {
      where.push("l.year <= ?");
      values.push(Number(query.yearTo));
    }
    if (query.verification) {
      where.push("l.verification_level = ?");
      values.push(query.verification);
    }
    if (query.subject) {
      where.push(
        "EXISTS (SELECT 1 FROM legislation_subjects ls JOIN subjects s ON s.id=ls.subject_id WHERE ls.legislation_id=l.id AND s.code=?)",
      );
      values.push(query.subject);
    }
    if (query.hasAmendments === "true")
      where.push(
        "EXISTS (SELECT 1 FROM amendments am WHERE am.amended_legislation_id=l.id AND am.status='PUBLISHED')",
      );
    if (query.hasAmendments === "false")
      where.push(
        "NOT EXISTS (SELECT 1 FROM amendments am WHERE am.amended_legislation_id=l.id AND am.status='PUBLISHED')",
      );
    if (query.effect === "current")
      where.push(
        "l.effective_from<=CURRENT_DATE() AND (l.repeal_date IS NULL OR l.repeal_date>CURRENT_DATE())",
      );
    if (query.effect === "future")
      where.push("l.effective_from>CURRENT_DATE()");
    if (query.effect === "ended") where.push("l.repeal_date<=CURRENT_DATE()");
    const sortMap: Record<string, string> = {
      newest: "l.year DESC, l.official_number DESC",
      oldest: "l.year ASC, l.official_number ASC",
      number: "CAST(l.official_number AS UNSIGNED), l.official_number",
      title: "l.title_ar",
      reviewed: "l.last_reviewed_at DESC",
      relevance: "l.year DESC",
    };
    const order = sortMap[query.sort ?? "newest"] ?? sortMap.newest;
    const filterSql = where.join(" AND ");
    const countRows = (await this.db.query(
      `SELECT COUNT(*) total FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id WHERE ${filterSql}`,
      values,
    )) as Array<{ total: string }>;
    const items = await this.db.query(
      `
      SELECT l.id, l.display_code displayCode, l.official_number officialNumber, l.year, l.title_ar titleAr,
             l.summary_ar summaryAr, l.legal_status legalStatus, l.verification_level verificationLevel,
             DATE_FORMAT(l.issue_date, '%Y-%m-%d') issueDate, DATE_FORMAT(l.effective_from, '%Y-%m-%d') effectiveFrom,
             lt.code typeCode, lt.name_ar typeName, au.code authorityCode, au.name_ar authorityName,
             (SELECT COUNT(*) FROM articles a WHERE a.legislation_id=l.id) articleCount,
             (SELECT COUNT(*) FROM amendments am WHERE am.amended_legislation_id=l.id AND am.status='PUBLISHED') amendmentCount,
             (SELECT COUNT(*) FROM annexes ax WHERE ax.legislation_id=l.id AND ax.status='PUBLISHED') annexCount
      FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id
      WHERE ${filterSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize],
    );
    const [types, authorities, years, subjects] = await Promise.all([
      this.db.query(
        `SELECT lt.code,lt.name_ar name,COUNT(l.id) count FROM legislation_types lt
         LEFT JOIN legislations l ON l.type_id=lt.id AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
         WHERE lt.is_active=1 GROUP BY lt.id,lt.code,lt.name_ar ORDER BY lt.name_ar`,
      ),
      this.db.query(
        `SELECT au.code,au.name_ar name,COUNT(l.id) count FROM authorities au
         LEFT JOIN legislations l ON l.authority_id=au.id AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
         WHERE au.is_active=1 GROUP BY au.id,au.code,au.name_ar ORDER BY au.name_ar`,
      ),
      this.db.query(
        `SELECT year, COUNT(*) count FROM legislations WHERE status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED') GROUP BY year ORDER BY year DESC`,
      ),
      this.db.query(
        `SELECT s.code,s.name_ar name,COUNT(l.id) count FROM subjects s
         LEFT JOIN legislation_subjects ls ON ls.subject_id=s.id
         LEFT JOIN legislations l ON l.id=ls.legislation_id AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
         WHERE s.is_active=1 GROUP BY s.id,s.code,s.name_ar ORDER BY s.name_ar`,
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return {
      items,
      meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
      filters: { types, authorities, years, subjects },
    };
  }

  async suggestions(q: string) {
    const needle = normalizeArabic(q.trim());
    if (needle.length < 2) return [];
    return this.db.query(
      `SELECT DISTINCT l.id,l.title_ar titleAr,l.official_number officialNumber,l.year
    FROM legislations l JOIN search_documents sd ON sd.legislation_id=l.id WHERE l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
    AND sd.text_normalized LIKE ? ORDER BY CASE WHEN sd.title_ar LIKE ? THEN 0 ELSE 1 END,l.year DESC LIMIT 8`,
      [`%${needle}%`, `%${q}%`],
    );
  }

  async latestModifications(limitValue?: string) {
    const limit = Math.min(50, Math.max(1, Number(limitValue ?? 20) || 20));
    return this.db.query(
      `SELECT am.id,am.title_ar titleAr,DATE_FORMAT(am.issue_date,'%Y-%m-%d') issueDate,
      DATE_FORMAT(am.effective_from,'%Y-%m-%d') effectiveFrom,l.id legislationId,
      l.title_ar legislationTitle,l.official_number legislationNumber,l.year legislationYear,
      sd.original_name sourceName,COUNT(ao.id) operationCount
      FROM amendments am JOIN legislations l ON l.id=am.amended_legislation_id
      LEFT JOIN amendment_operations ao ON ao.amendment_id=am.id
      LEFT JOIN source_documents sd ON sd.id=am.source_document_id
      WHERE am.status='PUBLISHED' AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
      GROUP BY am.id,am.title_ar,am.issue_date,am.effective_from,l.id,l.title_ar,l.official_number,l.year,sd.original_name
      ORDER BY am.effective_from DESC,am.issue_date DESC LIMIT ?`,
      [limit],
    );
  }

  async source(id: string) {
    await this.detail(id);
    const rows = await this.db.query(
      `SELECT sd.storage_key storageKey,sd.original_name fileName,sd.media_type mediaType
    FROM legislation_versions lv JOIN source_documents sd ON sd.id=lv.source_document_id WHERE lv.legislation_id=?
    AND sd.extraction_status='REVIEWED' ORDER BY lv.version_no DESC LIMIT 1`,
      [id],
    );
    if (!rows[0])
      throw new NotFoundException("لا يوجد ملف مصدر عام ومدقق لهذا التشريع.");
    return rows[0] as {
      storageKey: string;
      fileName: string;
      mediaType: string;
    };
  }

  async detail(id: string) {
    const rows = await this.db.query(
      `
      SELECT l.id, l.display_code displayCode, l.official_number officialNumber, l.year, l.title_ar titleAr,
             l.summary_ar summaryAr, l.status workflowStatus, l.legal_status legalStatus,
             l.verification_level verificationLevel, DATE_FORMAT(l.issue_date,'%Y-%m-%d') issueDate,
             DATE_FORMAT(l.publication_date,'%Y-%m-%d') publicationDate,
             DATE_FORMAT(l.effective_from,'%Y-%m-%d') effectiveFrom, DATE_FORMAT(l.repeal_date,'%Y-%m-%d') repealDate,
             DATE_FORMAT(l.last_reviewed_at,'%Y-%m-%d') lastReviewedAt, lt.name_ar typeName,
             au.name_ar authorityName, gi.issue_number gazetteIssue,
             (SELECT lv.preamble_text FROM legislation_versions lv WHERE lv.legislation_id=l.id AND lv.workflow_status='PUBLISHED' ORDER BY lv.version_no DESC LIMIT 1) preambleText,
             (SELECT COUNT(*) FROM articles a WHERE a.legislation_id=l.id) articleCount,
             (SELECT COUNT(*) FROM amendments am WHERE am.amended_legislation_id=l.id AND am.status='PUBLISHED') amendmentCount,
             (SELECT COUNT(*) FROM annexes ax WHERE ax.legislation_id=l.id AND ax.status='PUBLISHED') annexCount,
             (SELECT COUNT(*) FROM legal_relations lr WHERE lr.source_legislation_id=l.id OR lr.target_legislation_id=l.id) relationCount
      FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id JOIN authorities au ON au.id=l.authority_id
      LEFT JOIN gazette_issues gi ON gi.id=l.gazette_issue_id
      WHERE l.id=? AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')`,
      [id],
    );
    if (!rows[0])
      throw new NotFoundException("التشريع المطلوب غير موجود أو غير منشور.");
    return rows[0];
  }

  async structure(id: string) {
    await this.detail(id);
    return this.db.query(
      `SELECT id, parent_id parentId, node_type nodeType, label_ar labelAr, title_ar titleAr, sort_key sortKey
      FROM structure_nodes WHERE legislation_id=? ORDER BY sort_key`,
      [id],
    );
  }

  async articles(id: string, at?: string) {
    await this.detail(id);
    const effectiveDate = /^\d{4}-\d{2}-\d{2}$/.test(at ?? "")
      ? at!
      : new Date().toISOString().slice(0, 10);
    const rows = await this.db.query(
      `
      SELECT a.id, a.structure_node_id structureNodeId, a.published_label publishedLabel, a.current_label currentLabel,
             a.sort_key sortKey, av.id versionId, av.version_no versionNo, av.text_original textOriginal,
             av.text_structured textStructured, DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom,
             DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo, av.status,
             (SELECT COUNT(*) FROM article_versions history WHERE history.article_id=a.id) versionCount,
             (SELECT COUNT(*) FROM article_versions history WHERE history.article_id=a.id AND history.valid_to IS NOT NULL AND history.valid_to<=?) previousCount,
             (SELECT COUNT(*) FROM article_versions future WHERE future.article_id=a.id AND future.valid_from>?) futureCount
      FROM articles a JOIN article_versions av ON av.article_id=a.id
      WHERE a.legislation_id=? AND av.valid_from <= ? AND (av.valid_to IS NULL OR av.valid_to > ?)
      ORDER BY a.sort_key`,
      [effectiveDate, effectiveDate, id, effectiveDate, effectiveDate],
    );
    return { at: effectiveDate, items: rows };
  }

  async modifications(id: string) {
    await this.detail(id);
    const rows = (await this.db.query(
      `SELECT am.id amendmentId,am.title_ar amendmentTitle,
      DATE_FORMAT(am.issue_date,'%Y-%m-%d') issueDate,DATE_FORMAT(am.effective_from,'%Y-%m-%d') effectiveFrom,
      YEAR(am.effective_from) year,ao.id operationId,ao.operation_type operationType,ao.application_order applicationOrder,
      ao.citation_text citationText,a.id articleId,a.current_label articleLabel,amod.paragraph_locator paragraphLocator,
      amod.previous_text previousText,amod.new_text newText,sd.original_name sourceName
      FROM amendments am JOIN amendment_operations ao ON ao.amendment_id=am.id
      LEFT JOIN article_modifications amod ON amod.operation_id=ao.id LEFT JOIN articles a ON a.id=amod.article_id
      JOIN source_documents sd ON sd.id=ao.source_document_id
      WHERE am.amended_legislation_id=? AND am.status='PUBLISHED'
      ORDER BY am.effective_from DESC,ao.application_order`,
      [id],
    )) as Array<Record<string, unknown>>;
    const amendmentMap = new Map<
      string,
      {
        id: string;
        titleAr: string;
        issueDate: string;
        effectiveFrom: string;
        year: number;
        sourceName: string;
        operations: Array<Record<string, unknown>>;
      }
    >();
    for (const row of rows) {
      const key = String(row.amendmentId);
      if (!amendmentMap.has(key))
        amendmentMap.set(key, {
          id: key,
          titleAr: String(row.amendmentTitle),
          issueDate: String(row.issueDate),
          effectiveFrom: String(row.effectiveFrom),
          year: Number(row.year),
          sourceName: String(row.sourceName),
          operations: [],
        });
      amendmentMap.get(key)!.operations.push({
        id: row.operationId,
        operationType: row.operationType,
        applicationOrder: row.applicationOrder,
        citationText: row.citationText,
        articleId: row.articleId,
        articleLabel: row.articleLabel,
        paragraphLocator: row.paragraphLocator,
        previousText: row.previousText,
        newText: row.newText,
      });
    }
    const amendments = [...amendmentMap.values()];
    const years = [...new Set(amendments.map((item) => item.year))].map(
      (year) => ({
        year,
        count: amendments
          .filter((item) => item.year === year)
          .reduce((sum, item) => sum + item.operations.length, 0),
      }),
    );
    return { years, amendments };
  }

  async annexes(id: string) {
    await this.detail(id);
    return this.db.query(
      `SELECT ax.id,ax.annex_type annexType,ax.title_ar titleAr,ax.status,
    av.id versionId,av.version_no versionNo,DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom,DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo,
    af.id fileId,af.original_name fileName,af.media_type mediaType,af.byte_size byteSize,af.page_count pageCount,af.ocr_status ocrStatus,
    av.structured_table_json structuredTable
    FROM annexes ax JOIN annex_versions av ON av.annex_id=ax.id LEFT JOIN annex_files af ON af.annex_version_id=av.id
    WHERE ax.legislation_id=? AND ax.status IN ('PUBLISHED','REPLACED','REPEALED') ORDER BY av.valid_from DESC`,
      [id],
    );
  }

  async relations(id: string) {
    await this.detail(id);
    return this.db.query(
      `SELECT lr.id,lr.relation_type relationType,lr.scope_text scopeText,
    DATE_FORMAT(lr.effective_from,'%Y-%m-%d') effectiveFrom,lr.review_status reviewStatus,
    CASE WHEN lr.source_legislation_id=? THEN 'OUTGOING' ELSE 'INCOMING' END direction,
    CASE WHEN lr.source_legislation_id=? THEN target.id ELSE source.id END relatedId,
    CASE WHEN lr.source_legislation_id=? THEN target.title_ar ELSE source.title_ar END relatedTitle,
    CASE WHEN lr.source_legislation_id=? THEN target.official_number ELSE source.official_number END relatedNumber,
    CASE WHEN lr.source_legislation_id=? THEN target.year ELSE source.year END relatedYear,
    sd.original_name evidenceSource
    FROM legal_relations lr JOIN legislations source ON source.id=lr.source_legislation_id JOIN legislations target ON target.id=lr.target_legislation_id
    LEFT JOIN source_documents sd ON sd.id=lr.source_document_id WHERE lr.source_legislation_id=? OR lr.target_legislation_id=?
    ORDER BY lr.effective_from DESC`,
      [id, id, id, id, id, id, id],
    );
  }

  async create(dto: CreateLegislationDto, actor: AuthUser) {
    return this.db.transaction(async (m) => {
      const id = randomUUID();
      await m.query(
        `INSERT INTO legislations
        (id,type_id,authority_id,official_number,year,title_ar,status,legal_status,verification_level)
        VALUES (?,?,?,?,?,?,'DRAFT','UNKNOWN','D')`,
        [
          id,
          dto.typeId,
          dto.authorityId,
          dto.officialNumber ?? null,
          dto.year,
          dto.titleAr,
        ],
      );
      await m.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason)
        VALUES (?,?,'CREATE_DRAFT','LEGISLATION',?,?,?)`,
        [
          randomUUID(),
          actor.id,
          id,
          JSON.stringify(dto),
          "إنشاء مسودة عبر API",
        ],
      );
      await m.query(
        `INSERT INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'EDIT')`,
        [id, actor.id],
      );
      return { id, workflowStatus: "DRAFT" };
    });
  }
}
