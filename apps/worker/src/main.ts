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
const db = new DataSource({
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

interface Job {
  id: string;
  job_type: string;
  payload_json: string | Record<string, string>;
}
interface JobPayload {
  importId: string;
  sourceDocumentId: string;
  storageKey: string;
  mediaType: string;
  legislationId?: string;
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
  const pattern =
    /(?:^|\n)\s*(?:المادة|مادة)\s*[\(（]?\s*([0-9٠-٩]+(?:\s*مكرر(?:\s*[أابتثجحخدذرزسشصضطظعغفقكلمنهوي])?)?)[\)）]?\s*[:：\-–]?/gmu;
  const matches = [...text.matchAll(pattern)];
  if (!matches.length)
    return {
      preamble: "",
      articles: [{ label: "1", sortKey: "00001", text: text.trim() }],
    };
  const articles = matches.map((match, index) => ({
    label: match[1]!.trim(),
    sortKey: String(index + 1).padStart(5, "0"),
    text: text
      .slice(
        match.index! + match[0].length,
        matches[index + 1]?.index ?? text.length,
      )
      .trim(),
  }));
  return { preamble: text.slice(0, matches[0]!.index).trim(), articles };
}

async function pdfText(
  path: string,
): Promise<{ text: string; pages: number | null }> {
  const [{ stdout }, { stdout: info }] = await Promise.all([
    execFile("pdftotext", ["-layout", path, "-"], {
      maxBuffer: 50 * 1024 * 1024,
    }),
    execFile("pdfinfo", [path], { maxBuffer: 1024 * 1024 }),
  ]);
  const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0) || null;
  return { text: stdout, pages };
}

export async function extract(
  path: string,
  mediaType: string,
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
    return pdfText(path);
  if (mediaType.startsWith("image/")) return { text: "", pages: 1 };
  throw new Error(`UNSUPPORTED_FORMAT:${extension}`);
}

async function processImport(payload: JobPayload, jobId: string) {
  const path = targetPath(payload.storageKey);
  await db.query("UPDATE source_imports SET status='EXTRACTING' WHERE id=?", [
    payload.importId,
  ]);
  await db.query("UPDATE job_queue SET progress=15 WHERE id=?", [jobId]);
  const result = await extract(path, payload.mediaType);
  const text = result.text.replace(/\u0000/g, "").trim();
  if (!text || (payload.mediaType === "application/pdf" && text.length < 40)) {
    await db.transaction(async (m) => {
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
): Promise<{ text: string; confidence: number }> {
  const { stdout } = await execFile(
    "tesseract",
    [path, "stdout", "-l", process.env.OCR_LANGUAGES ?? "ara+eng", "tsv"],
    { maxBuffer: 50 * 1024 * 1024 },
  );
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
  const path = targetPath(payload.storageKey);
  await db.query("UPDATE source_imports SET status='OCR_RUNNING' WHERE id=?", [
    payload.importId,
  ]);
  let files = [path];
  let temporary: string | undefined;
  if (payload.mediaType === "application/pdf") {
    temporary = await mkdtemp(resolve(tmpdir(), "ylp-ocr-"));
    await execFile(
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
      outputs.push(await recognizeImage(file));
      await db.query("UPDATE job_queue SET progress=? WHERE id=?", [
        Math.min(95, 10 + Math.round(((index + 1) / files.length) * 80)),
        jobId,
      ]);
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

async function tick(): Promise<void> {
  await db.query(
    "INSERT INTO service_heartbeats (service_id,service_type,last_seen_at,metadata_json) VALUES (?,'WORKER',NOW(3),JSON_OBJECT('pid',?,'host',?)) ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at),metadata_json=VALUES(metadata_json)",
    [workerId, process.pid, hostname()],
  );
  const job = await db.transaction((manager) => claim(manager));
  if (!job) return;
  const payload = (typeof job.payload_json === "string"
    ? JSON.parse(job.payload_json)
    : job.payload_json) as unknown as JobPayload;
  try {
    if (job.job_type === "IMPORT_SOURCE") await processImport(payload, job.id);
    else if (job.job_type === "OCR_SOURCE") await processOcr(payload, job.id);
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
    await db.query(
      "UPDATE job_queue SET status='FAILED',last_error=?,completed_at=NOW(3) WHERE id=?",
      [message.slice(0, 4000), job.id],
    );
    if (payload.importId)
      await db.query(
        "UPDATE source_imports SET status=IF(status='OCR_RUNNING','OCR_REQUIRED','FAILED'),error_details=? WHERE id=?",
        [message.slice(0, 4000), payload.importId],
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

async function main() {
  await mkdir(resolve(dataRoot, "sources/inbox"), {
    recursive: true,
    mode: 0o750,
  });
  await db.initialize();
  await db.query(
    "INSERT INTO service_heartbeats (service_id,service_type,last_seen_at,metadata_json) VALUES (?,'WORKER',NOW(3),JSON_OBJECT('pid',?,'host',?)) ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at),metadata_json=VALUES(metadata_json)",
    [workerId, process.pid, hostname()],
  );
  await db.query(
    "UPDATE job_queue SET status='READY',locked_by=NULL,locked_at=NULL WHERE status='RUNNING' AND locked_at<DATE_SUB(NOW(3),INTERVAL 15 MINUTE)",
  );
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
