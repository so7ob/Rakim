import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import { annexTypeOption } from "./annex-content.js";

@ApiTags("الملحقات")
@Controller("annexes")
export class AnnexesController {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  @Get(":id")
  @ApiOperation({ summary: "بيانات ملحق وإصداراته" })
  async detail(@Param("id") id: string) {
    const rows = await this.db.query(
      `SELECT ax.id,ax.legislation_id legislationId,ax.annex_type annexType,ax.title_ar titleAr,ax.status,
      av.id versionId,av.version_no versionNo,DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom,DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo,
      av.content_format contentFormat,av.text_content textContent,av.structured_table_json structuredTable,
      CASE WHEN av.content_format='FILE' THEN COALESCE(af.id,sd.id) END fileId,
      CASE WHEN av.content_format='FILE' THEN COALESCE(af.original_name,sd.original_name) END fileName,
      CASE WHEN av.content_format='FILE' THEN COALESCE(af.media_type,sd.media_type) END mediaType,
      CASE WHEN av.content_format='FILE' THEN COALESCE(af.byte_size,sd.byte_size) END byteSize,
      CASE WHEN av.content_format='FILE' THEN COALESCE(af.page_count,sd.page_count) END pageCount,
      af.ocr_status ocrStatus,af.id attachmentId,af.original_name attachmentName,af.media_type attachmentMediaType,
      sd.id sourceId,sd.original_name sourceName,sd.media_type sourceMediaType,sd.byte_size sourceByteSize,sd.page_count sourcePageCount
      FROM annexes ax JOIN annex_versions av ON av.annex_id=ax.id
      LEFT JOIN annex_files af ON af.annex_version_id=CASE WHEN EXISTS (
        SELECT 1 FROM content_corrections c WHERE c.target_kind='ANNEX' AND c.published_version_id=av.id AND c.status='PUBLISHED'
      ) THEN (SELECT file_version.id FROM annex_versions file_version
        WHERE file_version.annex_id=av.annex_id AND file_version.version_no<=av.version_no
        AND file_version.source_document_id=av.source_document_id
        AND EXISTS(SELECT 1 FROM annex_files existing_file WHERE existing_file.annex_version_id=file_version.id)
        ORDER BY file_version.version_no DESC LIMIT 1) ELSE av.id END
      JOIN source_documents sd ON sd.id=av.source_document_id AND sd.is_active=TRUE AND sd.deleted_at IS NULL JOIN legislations l ON l.id=ax.legislation_id
      WHERE ax.id=? AND l.is_active=TRUE AND l.deleted_at IS NULL AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
        AND ax.is_active=TRUE AND ax.deleted_at IS NULL AND ax.status IN ('PUBLISHED','REPLACED','REPEALED')
        AND av.valid_from<=CURRENT_DATE()
      ORDER BY av.valid_from DESC`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException("الملحق غير موجود أو غير منشور.");
    return {
      id,
      titleAr: rows[0].titleAr,
      annexType: rows[0].annexType,
      annexTypeLabel: annexTypeOption(rows[0].annexType).labelAr,
      status: rows[0].status,
      versions: rows,
    };
  }

  @Get(":id/file")
  @ApiOperation({ summary: "عرض أو تنزيل ملف الملحق دون كشف مساره المحلي" })
  async file(
    @Param("id") id: string,
    @Query("version") version: string | undefined,
    @Query("download") download: string | undefined,
    @Res({ passthrough: true }) response: Response,
    @Query("role") role?: string,
  ) {
    const rows = await this.db.query(
      `SELECT
      CASE WHEN ?='source' THEN sd.storage_key WHEN ?='attachment' THEN af.storage_key WHEN av.content_format='FILE' THEN COALESCE(af.storage_key,sd.storage_key) END storageKey,
      CASE WHEN ?='source' THEN sd.original_name WHEN ?='attachment' THEN af.original_name WHEN av.content_format='FILE' THEN COALESCE(af.original_name,sd.original_name) END fileName,
      CASE WHEN ?='source' THEN sd.media_type WHEN ?='attachment' THEN af.media_type WHEN av.content_format='FILE' THEN COALESCE(af.media_type,sd.media_type) END mediaType
      FROM annex_versions av JOIN source_documents sd ON sd.id=av.source_document_id AND sd.is_active=TRUE AND sd.deleted_at IS NULL
      LEFT JOIN annex_files af ON af.annex_version_id=CASE WHEN EXISTS (
        SELECT 1 FROM content_corrections c WHERE c.target_kind='ANNEX' AND c.published_version_id=av.id AND c.status='PUBLISHED'
      ) THEN (SELECT file_version.id FROM annex_versions file_version
        WHERE file_version.annex_id=av.annex_id AND file_version.version_no<=av.version_no
        AND file_version.source_document_id=av.source_document_id
        AND EXISTS(SELECT 1 FROM annex_files existing_file WHERE existing_file.annex_version_id=file_version.id)
        ORDER BY file_version.version_no DESC LIMIT 1) ELSE av.id END
      JOIN annexes ax ON ax.id=av.annex_id
      JOIN legislations l ON l.id=ax.legislation_id WHERE ax.id=? AND l.is_active=TRUE AND l.deleted_at IS NULL AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
      AND ax.is_active=TRUE AND ax.deleted_at IS NULL AND ax.status IN ('PUBLISHED','REPLACED','REPEALED') AND av.valid_from<=CURRENT_DATE()
      AND (? IS NULL OR av.id=?)
      ORDER BY av.valid_from DESC LIMIT 1`,
      [
        role ?? "content",
        role ?? "content",
        role ?? "content",
        role ?? "content",
        role ?? "content",
        role ?? "content",
        id,
        version ?? null,
        version ?? null,
      ],
    );
    if (!rows[0]?.storageKey)
      throw new NotFoundException("لا يوجد ملف منشور لهذا الملحق.");
    const root = resolve(
      process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
    );
    const target = resolve(root, String(rows[0].storageKey));
    if (!target.startsWith(`${root}${sep}`))
      throw new NotFoundException("مسار الملف غير صالح.");
    response.setHeader("Content-Type", String(rows[0].mediaType));
    response.setHeader(
      "Content-Disposition",
      `${download === "1" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(String(rows[0].fileName))}`,
    );
    return new StreamableFile(createReadStream(target));
  }
}
