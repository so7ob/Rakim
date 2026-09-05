import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
  ) {
    if (!file) throw new BadRequestException("اختر ملفًا للاستيراد.");
    if (!obtainedFrom?.trim())
      throw new BadRequestException("جهة الحصول على المصدر إلزامية.");
    const extension = extname(file.originalname).toLowerCase();
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
    const sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const duplicate = await this.db.query(
      "SELECT id,original_name originalName FROM source_documents WHERE sha256=?",
      [sha256],
    );
    if (duplicate[0])
      throw new ConflictException({
        message: "هذا الملف مستورد سابقًا بالبصمة نفسها.",
        duplicateSource: duplicate[0],
      });
    const sourceId = randomUUID();
    const importId = randomUUID();
    const jobId = randomUUID();
    const dataRoot = resolve(
      process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
    );
    const date = new Date().toISOString().slice(0, 10);
    const storageKey = `sources/inbox/${date}/${sourceId}${extension}`;
    const target = resolve(dataRoot, storageKey);
    if (!target.startsWith(`${dataRoot}${sep}`))
      throw new BadRequestException("تعذر إنشاء مسار تخزين آمن.");
    await mkdir(resolve(target, ".."), { recursive: true, mode: 0o750 });
    await writeFile(target, file.buffer, { mode: 0o640, flag: "wx" });
    await this.db.transaction(async (m) => {
      await m.query(
        `INSERT INTO source_documents
        (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,created_by)
        VALUES (?,?,?,?,?,?,NOW(3),?,'PENDING',?)`,
        [
          sourceId,
          file.originalname.slice(0, 255),
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
            originalName: file.originalname,
            size: file.size,
            sha256,
            mediaType,
          }),
        ],
      );
    });
    return {
      id: importId,
      sourceDocumentId: sourceId,
      status: "QUEUED",
      sha256,
      jobId,
    };
  }

  async list(status?: string) {
    const where = status ? "WHERE si.status=?" : "";
    return this.db.query(
      `SELECT si.id,si.status,si.detected_format detectedFormat,
    si.created_at createdAt,si.updated_at updatedAt,sd.id sourceDocumentId,sd.original_name originalName,sd.media_type mediaType,
    sd.byte_size byteSize,sd.sha256,sd.extraction_status extractionStatus,sd.ocr_confidence ocrConfidence,u.display_name uploadedBy,
    l.id legislationId,l.title_ar legislationTitle FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id
    JOIN users u ON u.id=si.uploaded_by LEFT JOIN legislations l ON l.id=si.legislation_id ${where} ORDER BY si.created_at DESC`,
      status ? [status] : [],
    );
  }

  async detail(id: string) {
    const rows = await this.db.query(
      `SELECT si.*,sd.original_name originalName,sd.media_type mediaType,sd.byte_size byteSize,
    sd.sha256,sd.obtained_from obtainedFrom,sd.page_count pageCount,sd.extraction_status extractionStatus,sd.ocr_confidence ocrConfidence,
    sd.reviewed_at reviewedAt,u.display_name uploadedBy FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id
    JOIN users u ON u.id=si.uploaded_by WHERE si.id=?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("عملية الاستيراد غير موجودة.");
    return rows[0];
  }

  async source(id: string) {
    const rows = await this.db.query(
      `SELECT sd.storage_key storageKey,sd.original_name fileName,sd.media_type mediaType FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE si.id=?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("ملف المصدر غير موجود.");
    return rows[0] as {
      storageKey: string;
      fileName: string;
      mediaType: string;
    };
  }

  async review(id: string, actor: AuthUser, notes: string) {
    return this.db.transaction(async (m) => {
      const rows = await m.query(
        `SELECT si.*,sd.extraction_status extractionStatus FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE si.id=? FOR UPDATE`,
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
        `SELECT si.*,sd.extraction_status FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE si.id=? FOR UPDATE`,
        [id],
      );
      const item = rows[0];
      if (!item) throw new NotFoundException("عملية الاستيراد غير موجودة.");
      if (item.legislation_id)
        throw new ConflictException("أنشئت مسودة من هذا الاستيراد سابقًا.");
      if (!["READY_FOR_REVIEW", "REVIEWED"].includes(item.status))
        throw new ConflictException(
          "انتظر اكتمال استخراج الملف قبل إنشاء المسودة.",
        );
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
      const parsed =
        typeof item.extraction_json === "string"
          ? JSON.parse(item.extraction_json)
          : item.extraction_json;
      await m.query(
        `INSERT INTO legislation_versions (id,legislation_id,version_no,workflow_status,content_kind,preamble_text,source_document_id,valid_from) VALUES (?, ?,1,'DRAFT','EXTRACTED',?,?,?)`,
        [
          randomUUID(),
          lawId,
          String(parsed?.preamble || "") || null,
          item.source_document_id,
          input.effectiveFrom || `${input.year}-01-01`,
        ],
      );
      const nodeId = randomUUID();
      await m.query(
        `INSERT INTO structure_nodes (id,legislation_id,node_type,label_ar,title_ar,sort_key) VALUES (?,?,'CHAPTER','النص المستخرج','مواد قيد المراجعة','001')`,
        [nodeId, lawId],
      );
      const articles =
        Array.isArray(parsed?.articles) && parsed.articles.length
          ? parsed.articles
          : [{ label: "1", text: item.extracted_text, sortKey: "00001" }];
      for (const [index, article] of articles.entries()) {
        const articleId = randomUUID();
        const label = String(article.label || index + 1);
        const text = String(article.text || "");
        await m.query(
          `INSERT INTO articles (id,legislation_id,structure_node_id,published_label,current_label,sort_key) VALUES (?,?,?,?,?,?)`,
          [
            articleId,
            lawId,
            nodeId,
            label,
            label,
            String(article.sortKey || index + 1).padStart(5, "0"),
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
        `INSERT INTO content_responsibilities (legislation_id,user_id,duty) VALUES (?,?,'IMPORT'),(?,?,'EDIT')`,
        [lawId, actor.id, lawId, actor.id],
      );
      await m.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,'CREATE_DRAFT_FROM_IMPORT','LEGISLATION',?,?,'تحويل النص المستخرج إلى مسودة قابلة للمراجعة')`,
        [randomUUID(), actor.id, lawId, JSON.stringify(input)],
      );
      return { id: lawId, status: "DRAFT" };
    });
  }
}
