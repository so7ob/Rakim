import { assertSchemaCompatible } from "../../../scripts/database/schema-contract.mjs";
import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import { DataSource, type EntityManager } from "typeorm";
import { parseLegalStructure } from "./legal-structure-parser.js";

config({
  path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
});
const execFile = promisify(execFileCallback);
const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const dataRoot = resolve(
  process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
);
const isoDate = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export const workerDatabase = new DataSource({
  type: "mariadb",
  host: process.env.DATABASE_HOST ?? "127.0.0.1",
  port: Number(process.env.DATABASE_PORT ?? 3306),
  username: process.env.DATABASE_USER ?? "legislation_app",
  password: process.env.DATABASE_PASSWORD ?? "",
  database: process.env.DATABASE_NAME ?? "yemen_legislation",
  charset: "utf8mb4",
  timezone: "Z",
  extra: {
    connectionLimit: Number(process.env.WORKER_DATABASE_POOL_SIZE ?? 2),
    idleTimeout: 60_000,
    enableKeepAlive: true,
  },
});
const db = workerDatabase;

export interface Job {
  id: string;
  job_type: string;
  payload_json: string | Record<string, string>;
}
interface JobPayload {
  importId?: string;
  sourceDocumentId?: string;
  storageKey?: string;
  mediaType?: string;
  legislationId?: string;
  deletionBatchId?: string;
}

class JobCancelledError extends Error {
  constructor() {
    super("JOB_CANCELLED");
  }
}

async function assertNotCancelled(jobId: string) {
  const [job] = await db.query(
    "SELECT cancel_requested_at cancelRequestedAt FROM job_queue WHERE id=?",
    [jobId],
  );
  if (job?.cancelRequestedAt) throw new JobCancelledError();
}

async function cancellableExecFile(
  jobId: string,
  command: string,
  args: string[],
  options: { maxBuffer: number },
) {
  const controller = new AbortController();
  let polling = false;
  const timer = setInterval(() => {
    if (polling) return;
    polling = true;
    void db
      .query(
        "SELECT cancel_requested_at cancelRequestedAt FROM job_queue WHERE id=?",
        [jobId],
      )
      .then(([job]) => {
        if (job?.cancelRequestedAt) controller.abort();
      })
      .finally(() => {
        polling = false;
      });
  }, 250);
  try {
    return await execFile(command, args, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new JobCancelledError();
    throw error;
  } finally {
    clearInterval(timer);
  }
}

async function claim(manager: EntityManager): Promise<Job | null> {
  const rows =
    await manager.query(`SELECT id,job_type,payload_json FROM job_queue
    WHERE status='READY' AND available_at<=NOW(3) ORDER BY priority,created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
  if (!rows[0]) return null;
  await manager.query(
    `UPDATE job_queue SET status='RUNNING',locked_by=?,locked_at=NOW(3),attempts=attempts+1,progress=1 WHERE id=?`,
    [workerId, rows[0].id],
  );
  return rows[0] as Job;
}

function targetPath(storageKey: string): string {
  const target = resolve(dataRoot, storageKey);
  if (!target.startsWith(`${dataRoot}${sep}`))
    throw new Error("UNSAFE_STORAGE_PATH");
  return target;
}

export function parseStructure(text: string) {
  return parseLegalStructure(text);
}

async function pdfText(
  path: string,
  jobId?: string,
): Promise<{ text: string; pages: number | null }> {
  const [{ stdout }, { stdout: info }] = await Promise.all([
    jobId
      ? cancellableExecFile(jobId, "pdftotext", ["-layout", path, "-"], {
          maxBuffer: 50 * 1024 * 1024,
        })
      : execFile("pdftotext", ["-layout", path, "-"], {
          maxBuffer: 50 * 1024 * 1024,
        }),
    jobId
      ? cancellableExecFile(jobId, "pdfinfo", [path], {
          maxBuffer: 1024 * 1024,
        })
      : execFile("pdfinfo", [path], { maxBuffer: 1024 * 1024 }),
  ]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0) || null;
  return { text: stdout, pages };
}

export async function extract(
  path: string,
  mediaType: string,
  jobId = "",
): Promise<{ text: string; pages: number | null }> {
  const extension = extname(path).toLowerCase();
  if ([".txt", ".md", ".csv"].includes(extension))
    return { text: await readFile(path, "utf8"), pages: 1 };
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path });
    return { text: result.value, pages: null };
  }
  if (extension === ".xlsx") {
    const sheets = await readXlsxFile(path);
    return {
      text: sheets
        .map(
          (sheet) =>
            `[${sheet.sheet}]\n${sheet.data.map((row) => row.map((value) => value ?? "").join("\t")).join("\n")}`,
        )
        .join("\n\n"),
      pages: 1,
    };
  }
  if (mediaType === "application/pdf" || extension === ".pdf")
    return pdfText(path, jobId || undefined);
  if (mediaType.startsWith("image/")) return { text: "", pages: 1 };
  throw new Error(`UNSUPPORTED_FORMAT:${extension}`);
}

export async function processImport(payload: JobPayload, jobId: string) {
  if (
    !payload.importId ||
    !payload.sourceDocumentId ||
    !payload.storageKey ||
    !payload.mediaType
  )
    throw new Error("INVALID_IMPORT_JOB_PAYLOAD");
  await assertNotCancelled(jobId);
  const path = targetPath(payload.storageKey);
  const started = await db.query(
    `UPDATE source_imports si JOIN job_queue jq ON jq.id=?
     SET si.status='EXTRACTING',si.updated_at=NOW(3)
     WHERE si.id=? AND si.deleted_at IS NULL AND jq.cancel_requested_at IS NULL`,
    [jobId, payload.importId],
  );
  if (!started.affectedRows) {
    await assertNotCancelled(jobId);
    throw new Error("SOURCE_IMPORT_NOT_ACTIVE");
  }
  await db.query(
    "UPDATE job_queue SET progress=15 WHERE id=? AND cancel_requested_at IS NULL",
    [jobId],
  );
  const result = await extract(path, payload.mediaType, jobId);
  await assertNotCancelled(jobId);
  const text = result.text.replace(/\u0000/g, "").trim();
  if (!text || (payload.mediaType === "application/pdf" && text.length < 40)) {
    await db.transaction(async (m) => {
      const [currentJob] = await m.query(
        "SELECT cancel_requested_at cancelRequestedAt FROM job_queue WHERE id=? FOR UPDATE",
        [jobId],
      );
      if (currentJob?.cancelRequestedAt) throw new JobCancelledError();
      await m.query(
        "UPDATE source_documents SET extraction_status='OCR_REQUIRED',page_count=? WHERE id=?",
        [result.pages, payload.sourceDocumentId],
      );
      await m.query(
        "UPDATE source_imports SET status='OCR_REQUIRED' WHERE id=?",
        [payload.importId],
      );
      await m.query(
        `INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'OCR_SOURCE',?,15)`,
        [randomUUID(), JSON.stringify(payload)],
      );
      await m.query(
        "UPDATE job_queue SET status='SUCCEEDED',progress=100,completed_at=NOW(3) WHERE id=?",
        [jobId],
      );
    });
    return;
  }
  const structured = parseStructure(text);
  await db.transaction(async (m) => {
    const [currentJob] = await m.query(
      "SELECT cancel_requested_at cancelRequestedAt FROM job_queue WHERE id=? FOR UPDATE",
      [jobId],
    );
    if (currentJob?.cancelRequestedAt) throw new JobCancelledError();
    await m.query(
      "UPDATE source_documents SET extraction_status='EXTRACTED',page_count=? WHERE id=?",
      [result.pages, payload.sourceDocumentId],
    );
    await m.query(
      "UPDATE source_imports SET status='READY_FOR_REVIEW',extracted_text=?,extraction_json=? WHERE id=?",
      [text, JSON.stringify(structured), payload.importId],
    );
    await m.query(
      "UPDATE job_queue SET status='SUCCEEDED',progress=100,completed_at=NOW(3) WHERE id=?",
      [jobId],
    );
  });
}

export async function recognizeImage(
  path: string,
  jobId?: string,
): Promise<{ text: string; confidence: number }> {
  const args = [
    path,
    "stdout",
    "-l",
    process.env.OCR_LANGUAGES ?? "ara+eng",
    "tsv",
  ];
  const { stdout } = jobId
    ? await cancellableExecFile(jobId, "tesseract", args, {
        maxBuffer: 50 * 1024 * 1024,
      })
    : await execFile("tesseract", args, { maxBuffer: 50 * 1024 * 1024 });
  const lines = stdout.split("\n").slice(1);
  const words: Array<{ text: string; confidence: number; line: string }> = [];
  for (const line of lines) {
    const columns = line.split("\t");
    const confidence = Number(columns[10]);
    const value = (columns[11] ?? "").trim();
    if (value && confidence >= 0)
      words.push({
        text: value,
        confidence,
        line: `${columns[1]}:${columns[2]}:${columns[3]}:${columns[4]}`,
      });
  }
  const grouped = new Map<string, string[]>();
  for (const word of words) {
    const values = grouped.get(word.line) ?? [];
    values.push(word.text);
    grouped.set(word.line, values);
  }
  return {
    text: [...grouped.values()].map((items) => items.join(" ")).join("\n"),
    confidence: words.length
      ? words.reduce((sum, item) => sum + item.confidence, 0) / words.length
      : 0,
  };
}

async function processOcr(payload: JobPayload, jobId: string) {
  if (
    !payload.importId ||
    !payload.sourceDocumentId ||
    !payload.storageKey ||
    !payload.mediaType
  )
    throw new Error("INVALID_OCR_JOB_PAYLOAD");
  await assertNotCancelled(jobId);
  const path = targetPath(payload.storageKey);
  const started = await db.query(
    `UPDATE source_imports si JOIN job_queue jq ON jq.id=?
     SET si.status='OCR_RUNNING',si.updated_at=NOW(3)
     WHERE si.id=? AND si.deleted_at IS NULL AND jq.cancel_requested_at IS NULL`,
    [jobId, payload.importId],
  );
  if (!started.affectedRows) {
    await assertNotCancelled(jobId);
    throw new Error("SOURCE_IMPORT_NOT_ACTIVE");
  }
  let files = [path];
  let temporary: string | undefined;
  if (payload.mediaType === "application/pdf") {
    temporary = await mkdtemp(resolve(tmpdir(), "ylp-ocr-"));
    await cancellableExecFile(
      jobId,
      "pdftoppm",
      ["-png", "-r", "200", path, resolve(temporary, "page")],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    files = (await readdir(temporary))
      .filter((name) => name.endsWith(".png"))
      .sort()
      .map((name) => resolve(temporary!, name));
  }
  try {
    const outputs = [];
    for (const [index, file] of files.entries()) {
      await assertNotCancelled(jobId);
      outputs.push(await recognizeImage(file, jobId));
      await assertNotCancelled(jobId);
      await db.query(
        "UPDATE job_queue SET progress=? WHERE id=? AND cancel_requested_at IS NULL",
        [
          Math.min(95, 10 + Math.round(((index + 1) / files.length) * 80)),
          jobId,
        ],
      );
    }
    const text = outputs
      .map((item, index) => `[صفحة ${index + 1}]\n${item.text}`)
      .join("\n\n")
      .trim();
    const confidence = outputs.length
      ? outputs.reduce((sum, item) => sum + item.confidence, 0) / outputs.length
      : 0;
    if (!text) throw new Error("OCR_EMPTY_RESULT");
    await db.transaction(async (m) => {
      const [currentJob] = await m.query(
        "SELECT cancel_requested_at cancelRequestedAt FROM job_queue WHERE id=? FOR UPDATE",
        [jobId],
      );
      if (currentJob?.cancelRequestedAt) throw new JobCancelledError();
      await m.query(
        "UPDATE source_documents SET extraction_status='OCR_UNREVIEWED',ocr_confidence=?,page_count=? WHERE id=?",
        [confidence, files.length, payload.sourceDocumentId],
      );
      await m.query(
        "UPDATE source_imports SET status='READY_FOR_REVIEW',extracted_text=?,extraction_json=? WHERE id=?",
        [text, JSON.stringify(parseStructure(text)), payload.importId],
      );
      await m.query(
        "UPDATE job_queue SET status='SUCCEEDED',progress=100,completed_at=NOW(3) WHERE id=?",
        [jobId],
      );
    });
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

async function reindexLegislation(legislationId: string, jobId: string) {
  await db.transaction(async (m) => {
    await m.query("DELETE FROM search_documents WHERE legislation_id=?", [
      legislationId,
    ]);
    const laws = await m.query(
      `SELECT l.id,l.title_ar,l.summary_ar,l.verification_level,l.official_number,l.year,lt.name_ar typeName,
      COALESCE((SELECT lv.preamble_text FROM legislation_versions lv WHERE lv.legislation_id=l.id AND lv.workflow_status='PUBLISHED' ORDER BY lv.version_no DESC LIMIT 1),'') preambleText
      FROM legislations l JOIN legislation_types lt ON lt.id=l.type_id WHERE l.id=? AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')`,
      [legislationId],
    );
    const law = laws[0];
    if (law) {
      await m.query(
        `INSERT INTO search_documents (id,entity_type,entity_id,legislation_id,title_ar,text_literal,text_normalized,verification_level,metadata_json) VALUES (?,'LEGISLATION',?,?,?,?,?,?,JSON_OBJECT('kind','legislation'))`,
        [
          randomUUID(),
          law.id,
          law.id,
          law.title_ar,
          `${law.summary_ar ?? ""} ${law.preambleText ?? ""}`.trim(),
          normalize(
            `${law.title_ar} ${law.typeName} رقم ${law.official_number} لسنة ${law.year} ${law.summary_ar ?? ""} ${law.preambleText ?? ""}`,
          ),
          law.verification_level,
        ],
      );
      const versions = await m.query(
        `SELECT av.id,av.article_id,a.current_label,av.text_original,av.valid_from,av.valid_to,av.status FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?`,
        [legislationId],
      );
      const today = new Date().toISOString().slice(0, 10);
      for (const version of versions) {
        const current =
          version.status === "PUBLISHED" &&
          isoDate(version.valid_from) <= today &&
          (!version.valid_to || isoDate(version.valid_to) > today);
        await m.query(
          `INSERT INTO search_documents (id,entity_type,entity_id,legislation_id,article_id,version_id,title_ar,text_literal,text_normalized,is_current,valid_from,valid_to,verification_level,metadata_json) VALUES (?,'ARTICLE_VERSION',?,?,?,?,?,?,?,?,?,?,?,JSON_OBJECT('articleLabel',?))`,
          [
            randomUUID(),
            version.id,
            legislationId,
            version.article_id,
            version.id,
            `المادة ${version.current_label}`,
            version.text_original,
            normalize(
              `المادة ${version.current_label} ${version.text_original}`,
            ),
            current,
            version.valid_from,
            version.valid_to,
            law.verification_level,
            version.current_label,
          ],
        );
      }
      const amendments = await m.query(
        `SELECT am.id,am.title_ar,GROUP_CONCAT(CONCAT(ao.operation_type,' ',ao.citation_text) SEPARATOR ' ') body FROM amendments am JOIN amendment_operations ao ON ao.amendment_id=am.id WHERE am.amended_legislation_id=? AND am.status='PUBLISHED' GROUP BY am.id`,
        [legislationId],
      );
      for (const item of amendments) {
        const text = String(item.body ?? "");
        await m.query(
          `INSERT INTO search_documents (id,entity_type,entity_id,legislation_id,title_ar,text_literal,text_normalized,verification_level,metadata_json) VALUES (?,'AMENDMENT',?,?,?,?,?,?,JSON_OBJECT('kind','amendment'))`,
          [
            randomUUID(),
            item.id,
            legislationId,
            item.title_ar,
            text,
            normalize(`${item.title_ar} ${text}`),
            law.verification_level,
          ],
        );
      }
      const annexes = await m.query(
        `SELECT af.id fileId,ax.id annexId,ax.title_ar,af.extracted_text FROM annex_files af JOIN annex_versions av ON av.id=af.annex_version_id JOIN annexes ax ON ax.id=av.annex_id WHERE ax.legislation_id=? AND ax.status='PUBLISHED' AND af.ocr_status<>'UNREVIEWED'`,
        [legislationId],
      );
      for (const item of annexes) {
        const text = String(item.extracted_text ?? "");
        await m.query(
          `INSERT INTO search_documents (id,entity_type,entity_id,legislation_id,page_number,title_ar,text_literal,text_normalized,verification_level,metadata_json) VALUES (?,'ANNEX_PAGE',?,?,1,?,?,?,?,JSON_OBJECT('kind','annex_page','annexId',?,'fileId',?))`,
          [
            randomUUID(),
            item.fileId,
            legislationId,
            item.title_ar,
            text,
            normalize(`${item.title_ar} ${text}`),
            law.verification_level,
            item.annexId,
            item.fileId,
          ],
        );
      }
      const relations = await m.query(
        `SELECT lr.id,lr.relation_type,lr.scope_text,CONCAT(source.title_ar,' ',target.title_ar) title_ar FROM legal_relations lr JOIN legislations source ON source.id=lr.source_legislation_id JOIN legislations target ON target.id=lr.target_legislation_id WHERE lr.source_legislation_id=? AND lr.review_status='REVIEWED'`,
        [legislationId],
      );
      for (const item of relations) {
        const text = `${item.relation_type} ${item.scope_text ?? ""}`;
        await m.query(
          `INSERT INTO search_documents (id,entity_type,entity_id,legislation_id,title_ar,text_literal,text_normalized,verification_level,metadata_json) VALUES (?,'RELATION',?,?,?,?,?,?,JSON_OBJECT('kind','relation'))`,
          [
            randomUUID(),
            item.id,
            legislationId,
            item.title_ar,
            text,
            normalize(`${item.title_ar} ${text}`),
            law.verification_level,
          ],
        );
      }
      const documents = await m.query(
        "SELECT id,text_normalized text FROM search_documents WHERE legislation_id=?",
        [legislationId],
      );
      for (const document of documents) {
        for (const [position, term] of String(document.text ?? "")
          .split(/\s+/u)
          .filter(Boolean)
          .entries())
          await m.query(
            "INSERT INTO search_tokens (search_document_id,term,position_no) VALUES (?,?,?)",
            [document.id, term.slice(0, 190), position],
          );
      }
    }
    await m.query(
      "UPDATE job_queue SET status='SUCCEEDED',progress=100,completed_at=NOW(3) WHERE id=?",
      [jobId],
    );
  });
}

async function finishDeletionCancellation(importId: string) {
  const batches = await db.query(
    `SELECT DISTINCT db.id FROM deletion_batches db
     JOIN deletion_batch_items dbi ON dbi.batch_id=db.id
     WHERE db.status='CANCELLING' AND dbi.item_kind='source_imports' AND dbi.item_id=?`,
    [importId],
  );
  for (const batch of batches) {
    const running = await db.query(
      `SELECT jq.id FROM job_queue jq
       JOIN deletion_batch_items dbi
         ON dbi.batch_id=? AND dbi.item_kind='source_imports'
         AND JSON_UNQUOTE(JSON_EXTRACT(jq.payload_json,'$.importId'))=dbi.item_id
       WHERE jq.status='RUNNING' LIMIT 1`,
      [batch.id],
    );
    if (!running.length)
      await db.query(
        "UPDATE deletion_batches SET status='TRASHED' WHERE id=? AND status='CANCELLING'",
        [batch.id],
      );
  }
}

function itemIds(items: Array<Record<string, any>>, kind: string) {
  return items
    .filter((item) => item.item_kind === kind)
    .map((item) => String(item.item_id));
}

async function deleteByIds(
  manager: EntityManager,
  table: string,
  field: string,
  ids: string[],
) {
  if (!ids.length) return;
  await manager.query(
    `DELETE FROM ${table} WHERE ${field} IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
}

export async function processPurge(payload: JobPayload, jobId: string) {
  if (!payload.deletionBatchId) throw new Error("INVALID_PURGE_JOB_PAYLOAD");
  const batchId = payload.deletionBatchId;
  const [batch] = await db.query(
    "SELECT status,restore_until restoreUntil FROM deletion_batches WHERE id=?",
    [batchId],
  );
  if (!batch || ["RESTORED", "PURGED"].includes(batch.status)) {
    await db.query(
      "UPDATE job_queue SET status='SUCCEEDED',progress=100,completed_at=NOW(3) WHERE id=?",
      [jobId],
    );
    return;
  }
  if (batch.status === "CANCELLING")
    throw new Error("DELETION_CANCELLATION_PENDING");
  if (
    batch.status === "TRASHED" &&
    new Date(batch.restoreUntil).getTime() > Date.now()
  )
    throw new Error("DELETION_RETENTION_NOT_EXPIRED");
  if (!["TRASHED", "PURGING", "PURGE_FAILED"].includes(batch.status))
    throw new Error(`INVALID_DELETION_BATCH_STATUS:${batch.status}`);
  await db.query(
    "UPDATE deletion_batches SET status='PURGING',last_error=NULL WHERE id=?",
    [batchId],
  );
  const items = await db.query(
    "SELECT item_kind,item_id FROM deletion_batch_items WHERE batch_id=?",
    [batchId],
  );
  const lawIds = itemIds(items, "legislations");
  const articleIds = itemIds(items, "articles");
  const structureIds = itemIds(items, "structure_nodes");
  const annexIds = itemIds(items, "annexes");
  const amendmentIds = itemIds(items, "amendments");
  const operationIds = itemIds(items, "amendment_operations");
  const relationIds = itemIds(items, "legal_relations");
  const importIds = itemIds(items, "source_imports");
  const sourceIds = itemIds(items, "source_documents");
  const entityIds = Array.from(
    new Set<string>(
      items.map((item: Record<string, any>) => String(item.item_id)),
    ),
  );

  const storedFiles: Array<{ storage_key: string }> = [];
  if (sourceIds.length)
    storedFiles.push(
      ...(await db.query(
        `SELECT storage_key FROM source_documents WHERE id IN (${sourceIds.map(() => "?").join(",")})`,
        sourceIds,
      )),
    );
  if (annexIds.length)
    storedFiles.push(
      ...(await db.query(
        `SELECT af.storage_key FROM annex_files af JOIN annex_versions av ON av.id=af.annex_version_id
         WHERE av.annex_id IN (${annexIds.map(() => "?").join(",")})`,
        annexIds,
      )),
    );
  for (const file of storedFiles)
    await rm(targetPath(file.storage_key), { force: true });

  await db.transaction(async (m) => {
    const modificationRows =
      articleIds.length || operationIds.length
        ? await m.query(
            `SELECT DISTINCT id FROM article_modifications
             WHERE ${[
               articleIds.length
                 ? `article_id IN (${articleIds.map(() => "?").join(",")})`
                 : null,
               operationIds.length
                 ? `operation_id IN (${operationIds.map(() => "?").join(",")})`
                 : null,
             ]
               .filter(Boolean)
               .join(" OR ")}`,
            [...articleIds, ...operationIds],
          )
        : [];
    const modificationIds = modificationRows.map((row: any) => String(row.id));
    await deleteByIds(
      m,
      "previous_text_snapshots",
      "modification_id",
      modificationIds,
    );
    await deleteByIds(m, "article_modifications", "id", modificationIds);
    if (articleIds.length) {
      await m.query(
        `DELETE pts FROM previous_text_snapshots pts
         JOIN article_versions av ON av.id=pts.article_version_id
         WHERE av.article_id IN (${articleIds.map(() => "?").join(",")})`,
        articleIds,
      );
      await m.query(
        `UPDATE article_versions SET previous_version_id=NULL WHERE article_id IN (${articleIds.map(() => "?").join(",")})`,
        articleIds,
      );
      await m.query(
        `DELETE FROM article_versions WHERE article_id IN (${articleIds.map(() => "?").join(",")})`,
        articleIds,
      );
    }
    for (const table of ["verification_records", "user_notes", "reports"])
      await deleteByIds(m, table, "entity_id", entityIds);
    await deleteByIds(m, "amendment_operations", "id", operationIds);
    await deleteByIds(m, "amendments", "id", amendmentIds);
    await deleteByIds(m, "legal_relations", "id", relationIds);
    if (annexIds.length) {
      await m.query(
        `UPDATE annex_versions SET previous_version_id=NULL WHERE annex_id IN (${annexIds.map(() => "?").join(",")})`,
        annexIds,
      );
      await m.query(
        `DELETE af FROM annex_files af JOIN annex_versions av ON av.id=af.annex_version_id
         WHERE av.annex_id IN (${annexIds.map(() => "?").join(",")})`,
        annexIds,
      );
      await m.query(
        `DELETE FROM annex_versions WHERE annex_id IN (${annexIds.map(() => "?").join(",")})`,
        annexIds,
      );
    }
    await deleteByIds(m, "annexes", "id", annexIds);
    if (lawIds.length) {
      await deleteByIds(m, "workflow_events", "legislation_id", lawIds);
      await deleteByIds(
        m,
        "content_responsibilities",
        "legislation_id",
        lawIds,
      );
      await deleteByIds(m, "quality_issues", "legislation_id", lawIds);
      await deleteByIds(m, "legislation_subjects", "legislation_id", lawIds);
      await deleteByIds(
        m,
        "legislation_source_documents",
        "legislation_id",
        lawIds,
      );
      await m.query(
        `UPDATE legislation_versions SET previous_version_id=NULL WHERE legislation_id IN (${lawIds.map(() => "?").join(",")})`,
        lawIds,
      );
      await deleteByIds(m, "legislation_versions", "legislation_id", lawIds);
    }
    await deleteByIds(
      m,
      "source_import_attachments",
      "source_import_id",
      importIds,
    );
    await deleteByIds(m, "source_imports", "id", importIds);
    await deleteByIds(m, "articles", "id", articleIds);
    if (structureIds.length)
      await m.query(
        `UPDATE structure_nodes SET parent_id=NULL WHERE id IN (${structureIds.map(() => "?").join(",")})`,
        structureIds,
      );
    await deleteByIds(m, "structure_nodes", "id", structureIds);
    if (lawIds.length)
      await m.query(
        `UPDATE source_imports SET legislation_id=NULL
         WHERE legislation_id IN (${lawIds.map(() => "?").join(",")})`,
        lawIds,
      );
    await deleteByIds(m, "legislations", "id", lawIds);
    if (sourceIds.length) {
      await deleteByIds(
        m,
        "source_import_attachments",
        "source_document_id",
        sourceIds,
      );
      await deleteByIds(m, "quality_issues", "source_document_id", sourceIds);
      await deleteByIds(
        m,
        "legislation_source_documents",
        "source_document_id",
        sourceIds,
      );
      await deleteByIds(m, "source_documents", "id", sourceIds);
    }
    await m.query(
      "UPDATE deletion_batches SET status='PURGED',purged_at=NOW(3),last_error=NULL WHERE id=?",
      [batchId],
    );
    await m.query(
      "UPDATE job_queue SET status='SUCCEEDED',progress=100,completed_at=NOW(3) WHERE id=?",
      [jobId],
    );
  });
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export async function executeJob(job: Job): Promise<void> {
  const payload = (typeof job.payload_json === "string"
    ? JSON.parse(job.payload_json)
    : job.payload_json) as unknown as JobPayload;
  try {
    if (job.job_type === "IMPORT_SOURCE") await processImport(payload, job.id);
    else if (job.job_type === "OCR_SOURCE") await processOcr(payload, job.id);
    else if (job.job_type === "PURGE_DELETION_BATCH")
      await processPurge(payload, job.id);
    else if (job.job_type === "REINDEX_ENTITY" && payload.legislationId)
      await reindexLegislation(payload.legislationId, job.id);
    else throw new Error(`نوع مهمة غير مدعوم: ${job.job_type}`);
    console.log(
      JSON.stringify({
        event: "job.succeeded",
        jobId: job.id,
        type: job.job_type,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof JobCancelledError) {
      await db.query(
        "UPDATE job_queue SET status='CANCELLED',cancelled_at=NOW(3),completed_at=NOW(3),last_error=NULL WHERE id=?",
        [job.id],
      );
      if (payload.importId) await finishDeletionCancellation(payload.importId);
      console.log(
        JSON.stringify({
          event: "job.cancelled",
          jobId: job.id,
          type: job.job_type,
        }),
      );
      return;
    }
    await db.query(
      "UPDATE job_queue SET status='FAILED',last_error=?,completed_at=NOW(3) WHERE id=?",
      [message.slice(0, 4000), job.id],
    );
    if (payload.importId)
      await db.query(
        "UPDATE source_imports SET status=IF(status='OCR_RUNNING','OCR_REQUIRED','FAILED'),error_details=? WHERE id=?",
        [message.slice(0, 4000), payload.importId],
      );
    if (payload.deletionBatchId)
      await db.query(
        "UPDATE deletion_batches SET status='PURGE_FAILED',last_error=? WHERE id=? AND status='PURGING'",
        [message.slice(0, 4000), payload.deletionBatchId],
      );
    console.error(
      JSON.stringify({
        event: "job.failed",
        jobId: job.id,
        type: job.job_type,
        error: message,
      }),
    );
  }
}

async function tick(): Promise<void> {
  await db.query(
    "INSERT INTO service_heartbeats (service_id,service_type,last_seen_at,metadata_json) VALUES (?,'WORKER',NOW(3),JSON_OBJECT('pid',?,'host',?)) ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at),metadata_json=VALUES(metadata_json)",
    [workerId, process.pid, hostname()],
  );
  const job = await db.transaction((manager) => claim(manager));
  if (job) await executeJob(job);
}

async function main() {
  await mkdir(resolve(dataRoot, "sources/inbox"), {
    recursive: true,
    mode: 0o750,
  });
  await db.initialize();
  try {
    await assertSchemaCompatible((sql) => db.query(sql));
  } catch (error) {
    await db.destroy();
    throw error;
  }
  await db.query(
    "INSERT INTO service_heartbeats (service_id,service_type,last_seen_at,metadata_json) VALUES (?,'WORKER',NOW(3),JSON_OBJECT('pid',?,'host',?)) ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at),metadata_json=VALUES(metadata_json)",
    [workerId, process.pid, hostname()],
  );
  await db.query(
    "UPDATE job_queue SET status=IF(cancel_requested_at IS NULL,'READY','CANCELLED'),cancelled_at=IF(cancel_requested_at IS NULL,cancelled_at,NOW(3)),completed_at=IF(cancel_requested_at IS NULL,completed_at,NOW(3)),locked_by=NULL,locked_at=NULL WHERE status='RUNNING' AND locked_at<DATE_SUB(NOW(3),INTERVAL 15 MINUTE)",
  );
  await db.query(
    `UPDATE deletion_batches db SET db.status='TRASHED'
     WHERE db.status='CANCELLING' AND NOT EXISTS (
       SELECT 1 FROM deletion_batch_items dbi JOIN job_queue jq
         ON JSON_UNQUOTE(JSON_EXTRACT(jq.payload_json,'$.importId'))=dbi.item_id
       WHERE dbi.batch_id=db.id AND dbi.item_kind='source_imports' AND jq.status='RUNNING'
     )`,
  );
  if (process.argv.includes("--once")) {
    await tick();
    await db.destroy();
    return;
  }
  console.log(JSON.stringify({ event: "worker.started", workerId }));
  const timer = setInterval(() => void tick(), 1000);
  const stop = async () => {
    clearInterval(timer);
    await db.destroy();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
