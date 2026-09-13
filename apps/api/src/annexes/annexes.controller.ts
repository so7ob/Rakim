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
      COALESCE(af.id,sd.id) fileId,COALESCE(af.original_name,sd.original_name) fileName,COALESCE(af.media_type,sd.media_type) mediaType,COALESCE(af.byte_size,sd.byte_size) byteSize,COALESCE(af.page_count,sd.page_count) pageCount,af.ocr_status ocrStatus,
      av.structured_table_json structuredTable FROM annexes ax JOIN annex_versions av ON av.annex_id=ax.id
      LEFT JOIN annex_files af ON af.annex_version_id=av.id JOIN source_documents sd ON sd.id=av.source_document_id AND sd.is_active=TRUE AND sd.deleted_at IS NULL JOIN legislations l ON l.id=ax.legislation_id
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
  ) {
    const rows = await this.db.query(
      `SELECT COALESCE(af.storage_key,sd.storage_key) storageKey,COALESCE(af.original_name,sd.original_name) fileName,COALESCE(af.media_type,sd.media_type) mediaType
      FROM annex_versions av JOIN source_documents sd ON sd.id=av.source_document_id AND sd.is_active=TRUE AND sd.deleted_at IS NULL LEFT JOIN annex_files af ON af.annex_version_id=av.id JOIN annexes ax ON ax.id=av.annex_id
      JOIN legislations l ON l.id=ax.legislation_id WHERE ax.id=? AND l.is_active=TRUE AND l.deleted_at IS NULL AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
      AND ax.is_active=TRUE AND ax.deleted_at IS NULL AND ax.status IN ('PUBLISHED','REPLACED','REPEALED') AND av.valid_from<=CURRENT_DATE()
      AND (? IS NULL OR av.id=?)
      ORDER BY av.valid_from DESC LIMIT 1`,
      [id, version ?? null, version ?? null],
    );
    if (!rows[0]) throw new NotFoundException("لا يوجد ملف منشور لهذا الملحق.");
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
