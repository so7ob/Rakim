import { assertActiveReference } from "../admin/record-validation.js";
import { requireExactPermission } from "../admin/lifecycle.service.js";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { assertWorkflowPolicy } from "../admin/workflow-policies.js";
import { DATABASE } from "../database/database.module.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";

const formats: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const structureNodeTypes = new Set(["TITLE", "CHAPTER", "SECTION"]);

export function normalizeUploadedFilename(value: string) {
  if (!/[ÃÂØÙ]/u.test(value)) return value;
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return decoded.includes("\uFFFD") ? value : decoded;
}

function parseExtractionJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function analysisPreview(parsed: Record<string, unknown>) {
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const articles = Array.isArray(parsed.articles) ? parsed.articles : [];
  if (parsed.schemaVersion === 2)
    return {
      schemaVersion: 2,
      parser: parsed.parser,
      nodes,
      articles: articles.map((article) => {
        const item = article as Record<string, unknown>;
        return {
          key: item.key,
          label: item.label,
          number: item.number,
          headingLabel: item.headingLabel,
          title: item.title,
          structureNodeKey: item.structureNodeKey,
          sortKey: item.sortKey,
          documentOrder: item.documentOrder,
          sourceLine: item.sourceLine,
          status: item.status,
          confidence: item.confidence,
          textExcerpt: String(item.text ?? "").slice(0, 140),
        };
      }),
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      summary: parsed.summary,
    };
  return {
    schemaVersion: 1,
    parser: "legacy-article-splitter",
    nodes: [
      {
        key: "legacy-extracted-node",
        kind: "FASL",
        nodeType: "CHAPTER",
        label: "النص المستخرج",
        title: "مواد قيد المراجعة",
        parentKey: null,
        sortKey: "000001",
        documentOrder: 1,
        status: "REVIEW_REQUIRED",
        confidence: 0.5,
      },
    ],
    articles: articles.map((article, index) => {
      const item = article as Record<string, unknown>;
      return {
        key: `legacy-article-${index + 1}`,
        label: String(item.label ?? index + 1),
        number: String(item.label ?? index + 1),
        headingLabel: `المادة ${String(item.label ?? index + 1)}`,
        structureNodeKey: "legacy-extracted-node",
        sortKey: item.sortKey,
        documentOrder: index + 2,
        status: "REVIEW_REQUIRED",
        confidence: 0.5,
        textExcerpt: String(item.text ?? "").slice(0, 140),
      };
    }),
    issues: [
      {
        code: "LEGACY_EXTRACTION",
        message:
          "هذه نتيجة تحليل قديمة؛ ستستخدم عقدة «مواد قيد المراجعة» عند إنشاء المسودة.",
      },
    ],
    summary: {
      babs: 0,
      fasls: 1,
      qisms: 0,
      articles: articles.length,
      rootArticles: 0,
      reviewRequired: 1,
    },
  };
}

function validSignature(extension: string, buffer: Buffer): boolean {
  if (extension === ".pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
  if (extension === ".png")
    return buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === ".jpg" || extension === ".jpeg")
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === ".docx" || extension === ".xlsx")
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  return !buffer.includes(0);
}

@Injectable()
export class ImportsService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async upload(
    file: Express.Multer.File | undefined,
    obtainedFrom: string,
    actor: AuthUser,
    referencePdf?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("اختر ملفًا للاستيراد.");
    if (!obtainedFrom?.trim())
      throw new BadRequestException("جهة الحصول على المصدر إلزامية.");
    const originalName = normalizeUploadedFilename(file.originalname).slice(
      0,
      255,
    );
    const extension = extname(originalName).toLowerCase();
    const mediaType = formats[extension];
    if (!mediaType)
      throw new BadRequestException(
        "الصيغة غير مدعومة. الصيغ: TXT, Markdown, DOCX, PDF, PNG, JPG, CSV, XLSX.",
      );
    if (
      !file.size ||
      file.size > Number(process.env.MAX_IMPORT_BYTES ?? 30 * 1024 * 1024)
    )
      throw new BadRequestException(
        "حجم الملف غير مسموح. الحد الافتراضي 30 ميجابايت.",
      );
    if (!validSignature(extension, file.buffer))
      throw new BadRequestException(
        "محتوى الملف لا يطابق امتداده أو يحتوي بيانات غير صالحة.",
      );
    const referenceName = referencePdf
      ? normalizeUploadedFilename(referencePdf.originalname).slice(0, 255)
      : null;
    if (referencePdf && extname(referenceName!).toLowerCase() !== ".pdf")
      throw new BadRequestException("ملف المقارنة يجب أن يكون بصيغة PDF.");
    if (
      referencePdf &&
      (!referencePdf.size ||
        referencePdf.size >
          Number(process.env.MAX_IMPORT_BYTES ?? 30 * 1024 * 1024))
    )
      throw new BadRequestException(
        "حجم ملف PDF غير مسموح. الحد الافتراضي 30 ميجابايت.",
      );
    if (referencePdf && !validSignature(".pdf", referencePdf.buffer))
      throw new BadRequestException("محتوى ملف المقارنة لا يطابق صيغة PDF.");
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const referenceSha256 = referencePdf
      ? createHash("sha256").update(referencePdf.buffer).digest("hex")
      : null;
    if (referenceSha256 === sha256)
      throw new BadRequestException("لا يمكن إرفاق الملف نفسه مرتين.");
    const duplicate = await this.db.query(
      `SELECT id,original_name originalName FROM source_documents
       WHERE sha256 IN (${referenceSha256 ? "?,?" : "?"}) LIMIT 1`,
      referenceSha256 ? [sha256, referenceSha256] : [sha256],
    );
    if (duplicate[0])
      throw new ConflictException({
        message: "هذا الملف مستورد سابقًا بالبصمة نفسها.",
        duplicateSource: duplicate[0],
      });
    const sourceId = randomUUID();
    const referenceSourceId = referencePdf ? randomUUID() : null;
    const importId = randomUUID();
    const jobId = randomUUID();
    const dataRoot = resolve(
      process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
    );
    const date = new Date().toISOString().slice(0, 10);
    const storageKey = `sources/inbox/${date}/${sourceId}${extension}`;
    const target = resolve(dataRoot, storageKey);
    const referenceStorageKey = referenceSourceId
      ? `sources/inbox/${date}/${referenceSourceId}.pdf`
      : null;
    const referenceTarget = referenceStorageKey
      ? resolve(dataRoot, referenceStorageKey)
      : null;
    if (!target.startsWith(`${dataRoot}${sep}`))
      throw new BadRequestException("تعذر إنشاء مسار تخزين آمن.");
    if (referenceTarget && !referenceTarget.startsWith(`${dataRoot}${sep}`))
      throw new BadRequestException("تعذر إنشاء مسار تخزين PDF آمن.");
    await mkdir(resolve(target, ".."), { recursive: true, mode: 0o750 });
    try {
      await writeFile(target, file.buffer, { mode: 0o640, flag: "wx" });
      if (referencePdf && referenceTarget)
        await writeFile(referenceTarget, referencePdf.buffer, {
          mode: 0o640,
          flag: "wx",
        });
      await this.db.transaction(async (m) => {
        await m.query(
          `INSERT INTO source_documents
        (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
        VALUES (?,?,?,?,?,?,NOW(3),?,'PENDING',?)`,
          [
            sourceId,
            originalName,
            storageKey,
            mediaType,
            file.size,
            sha256,
            obtainedFrom.trim(),
            actor.id,
          ],
        );
        await m.query(
          `INSERT INTO source_imports (id,source_document_id,uploaded_by,status,detected_format) VALUES (?,?,?,'QUEUED',?)`,
          [importId, sourceId, actor.id, extension.slice(1).toUpperCase()],
        );
        if (
          referencePdf &&
          referenceSourceId &&
          referenceStorageKey &&
          referenceName &&
          referenceSha256
        ) {
          await m.query(
            `INSERT INTO source_documents
             (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
              obtained_from,extraction_status,created_by)
             VALUES (?,?,?,'application/pdf',?,?,NOW(3),?,'PENDING',?)`,
            [
              referenceSourceId,
              referenceName,
              referenceStorageKey,
              referencePdf.size,
              referenceSha256,
              obtainedFrom.trim(),
              actor.id,
            ],
          );
          await m.query(
            `INSERT INTO source_import_attachments
             (source_import_id,source_document_id,attachment_role)
             VALUES (?,?,'OFFICIAL_PDF')`,
            [importId, referenceSourceId],
          );
        }
        await m.query(
          `INSERT INTO job_queue (id,job_type,payload_json,priority) VALUES (?,'IMPORT_SOURCE',?,10)`,
          [
            jobId,
            JSON.stringify({
              importId,
              sourceDocumentId: sourceId,
              storageKey,
              mediaType,
            }),
          ],
        );
        await m.query(
          `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,'IMPORT_SOURCE','SOURCE_IMPORT',?,?,'رفع مصدر وحساب بصمته وإرساله للاستخراج')`,
          [
            randomUUID(),
            actor.id,
            importId,
            JSON.stringify({
              originalName,
              size: file.size,
              sha256,
              mediaType,
              referencePdf: referencePdf
                ? {
                    originalName: referenceName,
                    size: referencePdf.size,
                    sha256: referenceSha256,
                    mediaType: "application/pdf",
                  }
                : null,
            }),
          ],
        );
      });
    } catch (error) {
      await Promise.allSettled(
        [target, referenceTarget]
          .filter((path): path is string => Boolean(path))
          .map((path) => unlink(path)),
      );
      throw error;
    }
    return {
      id: importId,
      sourceDocumentId: sourceId,
      status: "QUEUED",
      sha256,
      jobId,
      attachments: referenceSourceId
        ? [{ sourceDocumentId: referenceSourceId, role: "OFFICIAL_PDF" }]
        : [],
    };
  }

  async changeAttachment(
    id: string,
    sourceId: string,
    remove: boolean,
    actor: AuthUser,
    reason: string,
  ) {
    requireExactPermission(actor, remove ? "source.delete" : "source.update");
    return this.db.transaction(async (m) => {
      const [bundle] = await m.query(
        "SELECT si.*,sd.deleted_at,sd.is_active FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE si.id=? FOR UPDATE",
        [id],
      );
      if (!bundle || bundle.deleted_at || !bundle.is_active)
        throw new NotFoundException("حزمة المصدر غير موجودة أو معطلة.");
      if (["QUEUED", "EXTRACTING", "OCR_RUNNING"].includes(bundle.status))
        throw new ConflictException(
          "انتظر انتهاء الاستخراج قبل تغيير المرفقات.",
        );
      if (bundle.legislation_id) {
        const [law] = await m.query(
          "SELECT status,deleted_at FROM legislations WHERE id=? FOR UPDATE",
          [bundle.legislation_id],
        );
        if (!law || law.deleted_at || !["INBOX", "DRAFT"].includes(law.status))
          throw new ConflictException("مصادر تشريع غير مسودة محفوظة ولا تعدل.");
      }
      const [source] = await m.query(
        "SELECT id,original_name,media_type,is_active,deleted_at,extraction_status FROM source_documents WHERE id=? FOR UPDATE",
        [sourceId],
      );
      if (!source || source.deleted_at || (!remove && !source.is_active))
        throw new BadRequestException("المرفق غير موجود أو معطل.");
      if (remove) {
        const links = await m.query(
          "SELECT legislation_id FROM legislation_source_documents WHERE source_document_id=?",
          [sourceId],
        );
        if (links.length)
          throw new ConflictException(
            "المرفق مرتبط بنسخة تشريع؛ فك الارتباط المسموح أولاً من تبويب المصادر.",
          );
        const result = await m.query(
          "DELETE FROM source_import_attachments WHERE source_import_id=? AND source_document_id=?",
          [id, sourceId],
        );
        if (!result.affectedRows)
          throw new NotFoundException("المرفق لا يتبع هذه الحزمة.");
      } else {
        if (
          sourceId === bundle.source_document_id ||
          source.media_type !== "application/pdf" ||
          source.extraction_status !== "REVIEWED"
        )
          throw new BadRequestException(
            "اختر ملف PDF مستقلاً ومدققاً للمرفق الرسمي.",
          );
        await m.query(
          "INSERT INTO source_import_attachments (source_import_id,source_document_id,attachment_role) VALUES (?,?,'OFFICIAL_PDF')",
          [id, sourceId],
        );
        if (bundle.legislation_id)
          await m.query(
            "INSERT INTO legislation_source_documents (legislation_id,source_document_id,source_role) VALUES (?,?,'OFFICIAL_PDF')",
            [bundle.legislation_id, sourceId],
          );
      }
      await m.query(
        "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,?,'SOURCE_IMPORT',?,?,?,?)",
        [
          randomUUID(),
          actor.id,
          remove ? "REMOVE_IMPORT_ATTACHMENT" : "ADD_IMPORT_ATTACHMENT",
          id,
          remove ? JSON.stringify({ sourceId }) : null,
          remove ? null : JSON.stringify({ sourceId }),
          reason.trim(),
        ],
      );
      return { id, sourceId, removed: remove };
    });
  }

  async list(status?: string) {
    const where =
      "WHERE sd.deleted_at IS NULL" + (status ? " AND si.status=?" : "");
    return this.db.query(
      `SELECT si.id,si.status,si.detected_format detectedFormat,
    si.created_at createdAt,si.updated_at updatedAt,sd.id sourceDocumentId,sd.original_name originalName,sd.media_type mediaType,
    sd.obtained_from obtainedFrom,sd.page_count pageCount,sd.byte_size byteSize,sd.sha256,sd.extraction_status extractionStatus,sd.ocr_confidence ocrConfidence,u.display_name uploadedBy,
    l.id legislationId,l.title_ar legislationTitle,
    (SELECT COUNT(*) FROM source_import_attachments sia WHERE sia.source_import_id=si.id) attachmentCount,
    (SELECT attached.original_name FROM source_import_attachments sia
      JOIN source_documents attached ON attached.id=sia.source_document_id
      WHERE sia.source_import_id=si.id AND sia.attachment_role='OFFICIAL_PDF' LIMIT 1) referencePdfName
    FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id
    JOIN users u ON u.id=si.uploaded_by LEFT JOIN legislations l ON l.id=si.legislation_id ${where} ORDER BY si.created_at DESC`,
      status ? [status] : [],
    );
  }

  async detail(id: string) {
    const rows = await this.db.query(
      `SELECT si.*,sd.original_name originalName,sd.media_type mediaType,sd.byte_size byteSize,
    sd.sha256,sd.obtained_from obtainedFrom,sd.page_count pageCount,sd.extraction_status extractionStatus,sd.ocr_confidence ocrConfidence,
    sd.reviewed_at reviewedAt,u.display_name uploadedBy FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id
    JOIN users u ON u.id=si.uploaded_by WHERE sd.deleted_at IS NULL AND si.id=?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("عملية الاستيراد غير موجودة.");
    const { extraction_json: extractionJson, ...item } = rows[0] as Record<
      string,
      unknown
    >;
    const attachments = await this.db.query(
      `SELECT sd.id sourceDocumentId,sd.original_name originalName,
       sd.media_type mediaType,sd.byte_size byteSize,sd.sha256,
       sd.obtained_from obtainedFrom,sd.page_count pageCount,sd.ocr_confidence ocrConfidence,sd.extraction_status extractionStatus,sia.attachment_role role
       FROM source_import_attachments sia
       JOIN source_documents sd ON sd.id=sia.source_document_id
       WHERE sd.deleted_at IS NULL AND sia.source_import_id=? ORDER BY sia.created_at,sd.id`,
      [id],
    );
    return {
      ...item,
      attachments,
      analysis: extractionJson
        ? analysisPreview(parseExtractionJson(extractionJson))
        : null,
    };
  }

  async source(id: string) {
    const rows = await this.db.query(
      `SELECT sd.storage_key storageKey,sd.original_name fileName,sd.media_type mediaType FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE sd.deleted_at IS NULL AND si.id=?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("ملف المصدر غير موجود.");
    return rows[0] as {
      storageKey: string;
      fileName: string;
      mediaType: string;
    };
  }

  async attachment(id: string, sourceDocumentId: string) {
    const rows = await this.db.query(
      `SELECT sd.storage_key storageKey,sd.original_name fileName,
       sd.media_type mediaType
       FROM source_import_attachments sia
       JOIN source_documents sd ON sd.id=sia.source_document_id
       WHERE sia.source_import_id=? AND sia.source_document_id=?`,
      [id, sourceDocumentId],
    );
    if (!rows[0]) throw new NotFoundException("ملف المصدر المرفق غير موجود.");
    return rows[0] as {
      storageKey: string;
      fileName: string;
      mediaType: string;
    };
  }

  async review(id: string, actor: AuthUser, notes: string) {
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT si.*,sd.extraction_status extractionStatus FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE sd.deleted_at IS NULL AND sd.is_active=TRUE AND si.id=? FOR UPDATE`,
        [id],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException("عملية الاستيراد غير موجودة.");
      const workflowPolicy = await assertWorkflowPolicy(
        m,
        "SOURCE_IMPORT_SELF_REVIEW",
        actor,
        item.uploaded_by === actor.id,
      );
      if (!["READY_FOR_REVIEW", "OCR_REQUIRED"].includes(item.status))
        throw new ConflictException("المصدر لم يصل إلى حالة قابلة للمراجعة.");
      if (!item.extracted_text?.trim())
        throw new ConflictException("لا يوجد نص مستخرج لمراجعته.");
      await m.query(
        "UPDATE source_documents SET extraction_status='REVIEWED',reviewed_at=NOW(3) WHERE id=?",
        [item.source_document_id],
      );
      await m.query(
        `UPDATE source_documents sd
         JOIN source_import_attachments sia ON sia.source_document_id=sd.id
         SET sd.extraction_status='REVIEWED',sd.reviewed_at=NOW(3)
         WHERE sia.source_import_id=?`,
        [id],
      );
      await m.query("UPDATE source_imports SET status='REVIEWED' WHERE id=?", [
        id,
      ]);
      await m.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,'REVIEW_IMPORT','SOURCE_IMPORT',?,JSON_OBJECT('status',?),JSON_OBJECT('status','REVIEWED','workflowPolicy',?),?)`,
        [randomUUID(), actor.id, id, item.status, workflowPolicy, notes],
      );
      return { id, status: "REVIEWED", workflowPolicy };
    });
  }

  async createDraft(
    id: string,
    input: {
      titleAr: string;
      officialNumber?: string;
      year: number;
      typeId: string;
      authorityId: string;
      effectiveFrom?: string;
    },
    actor: AuthUser,
  ) {
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT si.*,sd.extraction_status,l.status legislation_status
         FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id
         LEFT JOIN legislations l ON l.id=si.legislation_id WHERE sd.deleted_at IS NULL AND sd.is_active=TRUE AND si.id=? FOR UPDATE`,
        [id],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException("عملية الاستيراد غير موجودة.");
      if (item.legislation_id)
        return {
          id: item.legislation_id as string,
          status: String(item.legislation_status ?? "DRAFT"),
          idempotentReplay: true,
        };
      if (!["READY_FOR_REVIEW", "REVIEWED"].includes(item.status))
        throw new ConflictException(
          "انتظر اكتمال استخراج الملف قبل إنشاء المسودة.",
        );
      await assertActiveReference(m, "legislation_types", input.typeId);
      await assertActiveReference(m, "authorities", input.authorityId);
      if (!input.titleAr.trim())
        throw new BadRequestException("عنوان التشريع مطلوب.");
      const lawId = randomUUID();
      await m.query(
        `INSERT INTO legislations (id,type_id,authority_id,official_number,year,title_ar,status,legal_status,verification_level,effective_from) VALUES (?,?,?,?,?,?,'DRAFT','UNKNOWN','D',?)`,
        [
          lawId,
          input.typeId,
          input.authorityId,
          input.officialNumber || null,
          input.year,
          input.titleAr,
          input.effectiveFrom || null,
        ],
      );
      const parsed = parseExtractionJson(item.extraction_json);
      await m.query(
        `INSERT INTO legislation_versions (id,legislation_id,version_no,workflow_status,content_kind,preamble_text,source_document_id,valid_from) VALUES (?, ?,1,'DRAFT','EXTRACTED',?,?,?)`,
        [
          randomUUID(),
          lawId,
          String(parsed.preamble || "") || null,
          item.source_document_id,
          input.effectiveFrom || `${input.year}-01-01`,
        ],
      );
      const isStructuredV2 = parsed.schemaVersion === 2;
      const nodeIds = new Map<string, { id: string; nodeType: string }>();
      if (isStructuredV2) {
        const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        for (const rawNode of nodes) {
          const node = rawNode as Record<string, unknown>;
          const key = String(node.key ?? "");
          const nodeType = String(node.nodeType ?? "");
          const parentKey = node.parentKey ? String(node.parentKey) : null;
          if (!key || nodeIds.has(key) || !structureNodeTypes.has(nodeType))
            throw new BadRequestException(
              "نتيجة تحليل البنية غير صالحة أو تحتوي عقدة مكررة.",
            );
          const parent = parentKey ? nodeIds.get(parentKey) : undefined;
          if (parentKey && !parent)
            throw new BadRequestException(
              "نتيجة تحليل البنية تشير إلى أب غير موجود أو متأخر.",
            );
          const legalParent =
            (nodeType === "TITLE" && !parent) ||
            (nodeType === "CHAPTER" &&
              (!parent || parent.nodeType === "TITLE")) ||
            (nodeType === "SECTION" &&
              (!parent ||
                parent.nodeType === "TITLE" ||
                parent.nodeType === "CHAPTER"));
          if (!legalParent)
            throw new BadRequestException(
              "نتيجة تحليل البنية تحتوي علاقة أب/ابن غير قانونية.",
            );
          const nodeId = randomUUID();
          await m.query(
            `INSERT INTO structure_nodes
            (id,legislation_id,parent_id,node_type,label_ar,title_ar,sort_key)
            VALUES (?,?,?,?,?,?,?)`,
            [
              nodeId,
              lawId,
              parent?.id ?? null,
              nodeType,
              String(node.label ?? "").slice(0, 120) || null,
              String(node.title ?? node.label ?? "عنصر مستخرج").slice(0, 500),
              String(node.sortKey ?? node.documentOrder ?? nodeIds.size + 1)
                .slice(0, 120)
                .padStart(6, "0"),
            ],
          );
          nodeIds.set(key, { id: nodeId, nodeType });
        }
      } else {
        const nodeId = randomUUID();
        await m.query(
          `INSERT INTO structure_nodes (id,legislation_id,node_type,label_ar,title_ar,sort_key) VALUES (?,?,'CHAPTER','النص المستخرج','مواد قيد المراجعة','000001')`,
          [nodeId, lawId],
        );
        nodeIds.set("legacy-extracted-node", {
          id: nodeId,
          nodeType: "CHAPTER",
        });
      }
      const articles =
        Array.isArray(parsed.articles) && parsed.articles.length
          ? parsed.articles
          : [{ label: "1", number: "1", text: item.extracted_text }];
      for (const [index, article] of articles.entries()) {
        const parsedArticle = article as Record<string, unknown>;
        const articleId = randomUUID();
        const label = String(
          parsedArticle.number || parsedArticle.label || index + 1,
        ).slice(0, 120);
        const text = String(parsedArticle.text || "");
        const structureNodeKey = isStructuredV2
          ? parsedArticle.structureNodeKey
            ? String(parsedArticle.structureNodeKey)
            : null
          : "legacy-extracted-node";
        const structureNode = structureNodeKey
          ? nodeIds.get(structureNodeKey)
          : undefined;
        if (structureNodeKey && !structureNode)
          throw new BadRequestException(
            "نتيجة تحليل المادة تشير إلى عقدة بنية غير موجودة.",
          );
        await m.query(
          `INSERT INTO articles (id,legislation_id,structure_node_id,published_label,current_label,sort_key) VALUES (?,?,?,?,?,?)`,
          [
            articleId,
            lawId,
            structureNode?.id ?? null,
            label,
            label,
            String(parsedArticle.sortKey || index + 1)
              .slice(0, 120)
              .padStart(6, "0"),
          ],
        );
        await m.query(
          `INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,status,source_document_id) VALUES (?,?,1,?,?,?,?, 'DRAFT',?)`,
          [
            randomUUID(),
            articleId,
            text,
            text,
            normalizeArabic(text),
            input.effectiveFrom || `${input.year}-01-01`,
            item.source_document_id,
          ],
        );
      }
      await m.query("UPDATE source_imports SET legislation_id=? WHERE id=?", [
        lawId,
        id,
      ]);
      await m.query(
        `INSERT INTO legislation_source_documents
         (legislation_id,source_document_id,source_role)
         VALUES (?,?,'EXTRACTION')`,
        [lawId, item.source_document_id],
      );
      await m.query(
        `INSERT INTO legislation_source_documents
         (legislation_id,source_document_id,source_role)
         SELECT ?,source_document_id,'OFFICIAL_PDF'
         FROM source_import_attachments WHERE source_import_id=?`,
        [lawId, id],
      );
      await m.query(
        `INSERT INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'IMPORT'),(?,?,'EDIT')`,
        [lawId, actor.id, lawId, actor.id],
      );
      await m.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,'CREATE_DRAFT_FROM_IMPORT','LEGISLATION',?,?,'تحويل النص المستخرج إلى مسودة قابلة للمراجعة')`,
        [
          randomUUID(),
          actor.id,
          lawId,
          JSON.stringify({
            ...input,
            sourceImportId: id,
            parser: parsed.parser ?? "legacy-article-splitter",
            summary: parsed.summary ?? {
              nodes: nodeIds.size,
              articles: articles.length,
            },
          }),
        ],
      );
      return { id: lawId, status: "DRAFT" };
    });
  }
}
