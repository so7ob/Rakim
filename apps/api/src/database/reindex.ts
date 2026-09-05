import { randomUUID } from "node:crypto";
import { createDataSource } from "./config.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";

const isoDate = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

export async function rebuildSearchIndex(): Promise<number> {
  const db = await createDataSource().initialize();
  try {
    return await db.transaction(async (manager) => {
      await manager.query("DELETE FROM search_documents");
      const legislations = (await manager.query(`
        SELECT l.id, l.title_ar, COALESCE(l.summary_ar, '') summary_ar,
        COALESCE((SELECT lv.preamble_text FROM legislation_versions lv WHERE lv.legislation_id=l.id AND lv.workflow_status='PUBLISHED' ORDER BY lv.version_no DESC LIMIT 1),'') preamble_text,
        l.verification_level,l.official_number,l.year,lt.name_ar type_name
        FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id WHERE l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
      `)) as Array<{
        id: string;
        title_ar: string;
        summary_ar: string;
        preamble_text: string;
        verification_level: string;
        official_number: string;
        year: string;
        type_name: string;
      }>;
      let count = 0;
      for (const law of legislations) {
        await manager.query(
          `INSERT INTO search_documents
           (id, entity_type, entity_id, legislation_id, title_ar, text_literal, text_normalized, verification_level, metadata_json)
           VALUES (?, 'LEGISLATION', ?, ?, ?, ?, ?, ?, JSON_OBJECT('kind','legislation'))`,
          [
            randomUUID(),
            law.id,
            law.id,
            law.title_ar,
            `${law.summary_ar} ${law.preamble_text}`.trim(),
            normalizeArabic(
              `${law.title_ar} ${law.type_name} رقم ${law.official_number} لسنة ${law.year} ${law.summary_ar} ${law.preamble_text}`,
            ),
            law.verification_level,
          ],
        );
        count += 1;
      }
      const versions = (await manager.query(`
        SELECT av.id, av.article_id, a.legislation_id, a.current_label, av.text_original,
               av.valid_from, av.valid_to, av.status, l.verification_level
        FROM article_versions av
        JOIN articles a ON a.id = av.article_id
        JOIN legislations l ON l.id = a.legislation_id
        WHERE l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
          AND av.status IN ('PUBLISHED','REPEALED')
          AND av.valid_from<=CURRENT_DATE()
      `)) as Array<Record<string, string | null>>;
      const today = new Date().toISOString().slice(0, 10);
      for (const version of versions) {
        const isCurrent =
          version.status === "PUBLISHED" &&
          isoDate(version.valid_from) <= today &&
          (version.valid_to === null || isoDate(version.valid_to) > today);
        await manager.query(
          `INSERT INTO search_documents
           (id, entity_type, entity_id, legislation_id, article_id, version_id, title_ar, text_literal,
            text_normalized, is_current, valid_from, valid_to, verification_level, metadata_json)
           VALUES (?, 'ARTICLE_VERSION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, JSON_OBJECT('articleLabel', ?))`,
          [
            randomUUID(),
            version.id,
            version.legislation_id,
            version.article_id,
            version.id,
            `المادة ${version.current_label}`,
            version.text_original,
            normalizeArabic(
              `المادة ${version.current_label} ${String(version.text_original)}`,
            ),
            isCurrent,
            version.valid_from,
            version.valid_to,
            version.verification_level,
            version.current_label,
          ],
        );
        count += 1;
      }
      const amendments =
        (await manager.query(`SELECT am.id,am.amended_legislation_id legislation_id,am.title_ar,
        GROUP_CONCAT(CONCAT(ao.operation_type,' ',ao.citation_text) SEPARATOR ' ') body,l.verification_level
        FROM amendments am JOIN amendment_operations ao ON ao.amendment_id=am.id JOIN legislations l ON l.id=am.amended_legislation_id
        WHERE am.status='PUBLISHED' AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED') GROUP BY am.id`)) as Array<
          Record<string, string>
        >;
      for (const item of amendments) {
        const body = String(item.body ?? "");
        await manager.query(
          `INSERT INTO search_documents
        (id,entity_type,entity_id,legislation_id,title_ar,text_literal,text_normalized,verification_level,metadata_json)
        VALUES (?,'AMENDMENT',?,?,?,?,?,?,JSON_OBJECT('kind','amendment'))`,
          [
            randomUUID(),
            item.id,
            item.legislation_id,
            item.title_ar,
            body,
            normalizeArabic(`${item.title_ar} ${body}`),
            item.verification_level,
          ],
        );
        count += 1;
      }
      const annexPages =
        (await manager.query(`SELECT af.id,ax.id annex_id,ax.legislation_id,ax.title_ar,af.extracted_text,l.verification_level
        FROM annex_files af JOIN annex_versions av ON av.id=af.annex_version_id JOIN annexes ax ON ax.id=av.annex_id
        JOIN legislations l ON l.id=ax.legislation_id WHERE ax.status='PUBLISHED'
        AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
        AND av.valid_from<=CURRENT_DATE() AND af.ocr_status<>'UNREVIEWED'`)) as Array<
          Record<string, string>
        >;
      for (const item of annexPages) {
        const body = String(item.extracted_text ?? "");
        await manager.query(
          `INSERT INTO search_documents
        (id,entity_type,entity_id,legislation_id,page_number,title_ar,text_literal,text_normalized,verification_level,metadata_json)
        VALUES (?,'ANNEX_PAGE',?,?,1,?,?,?,?,JSON_OBJECT('kind','annex_page','annexId',?,'fileId',?))`,
          [
            randomUUID(),
            item.id,
            item.legislation_id,
            item.title_ar,
            body,
            normalizeArabic(`${item.title_ar} ${body}`),
            item.verification_level,
            item.annex_id,
            item.id,
          ],
        );
        count += 1;
      }
      const relations =
        (await manager.query(`SELECT lr.id,lr.source_legislation_id legislation_id,lr.relation_type,lr.scope_text,
        CONCAT(source.title_ar,' ',target.title_ar) title_ar,source.verification_level
        FROM legal_relations lr JOIN legislations source ON source.id=lr.source_legislation_id JOIN legislations target ON target.id=lr.target_legislation_id
        WHERE lr.review_status='REVIEWED'
          AND source.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
          AND target.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')`)) as Array<
          Record<string, string>
        >;
      for (const item of relations) {
        const body = `${item.relation_type} ${item.scope_text ?? ""}`;
        await manager.query(
          `INSERT INTO search_documents
        (id,entity_type,entity_id,legislation_id,title_ar,text_literal,text_normalized,verification_level,metadata_json)
        VALUES (?,'RELATION',?,?,?,?,?,?,JSON_OBJECT('kind','relation'))`,
          [
            randomUUID(),
            item.id,
            item.legislation_id,
            item.title_ar,
            body,
            normalizeArabic(`${item.title_ar} ${body}`),
            item.verification_level,
          ],
        );
        count += 1;
      }
      const documents = (await manager.query(
        "SELECT id,text_normalized text FROM search_documents",
      )) as Array<{ id: string; text: string }>;
      for (const document of documents) {
        const tokens = String(document.text ?? "")
          .split(/\s+/u)
          .filter(Boolean);
        for (const [position, term] of tokens.entries())
          await manager.query(
            "INSERT INTO search_tokens (search_document_id,term,position_no) VALUES (?,?,?)",
            [document.id, term.slice(0, 190), position],
          );
      }
      return count;
    });
  } finally {
    await db.destroy();
  }
}

if (
  process.argv[1]?.endsWith("reindex.ts") ||
  process.argv[1]?.endsWith("reindex.js")
) {
  rebuildSearchIndex()
    .then((count) =>
      console.log(JSON.stringify({ event: "search.reindexed", count })),
    )
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
