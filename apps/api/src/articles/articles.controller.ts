import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";

@ApiTags("المواد")
@Controller("articles")
export class ArticlesController {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  @Get(":id")
  @ApiOperation({ summary: "المادة ونسختها النافذة الآن" })
  async article(@Param("id") id: string) {
    return this.at(id);
  }

  @Get(":id/at")
  @ApiOperation({ summary: "نسخة المادة النافذة في تاريخ محدد" })
  async at(@Param("id") id: string, @Query("date") date?: string) {
    const at = /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
      ? date!
      : new Date().toISOString().slice(0, 10);
    const rows = await this.db.query(
      `SELECT a.id, a.legislation_id legislationId, a.current_label currentLabel,
      av.id versionId, av.version_no versionNo, av.text_original textOriginal,
      DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom, DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo, av.status
      FROM articles a JOIN article_versions av ON av.article_id=a.id
      JOIN legislations l ON l.id=a.legislation_id
      WHERE a.id=? AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')
      AND av.valid_from <= ? AND (av.valid_to IS NULL OR av.valid_to > ?) LIMIT 1`,
      [id, at, at],
    );
    if (!rows[0])
      throw new NotFoundException(
        "لا توجد نسخة نافذة للمادة في التاريخ المحدد.",
      );
    return { at, ...rows[0] };
  }

  @Get(":id/versions")
  @ApiOperation({ summary: "كل نسخ المادة التاريخية" })
  async versions(@Param("id") id: string) {
    return this.db.query(
      `SELECT av.id, av.version_no versionNo, av.text_original textOriginal,
      DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom, DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo,
      av.status, av.ending_reason endingReason, sd.original_name sourceName
      FROM article_versions av JOIN source_documents sd ON sd.id=av.source_document_id
      WHERE av.article_id=? ORDER BY av.valid_from DESC`,
      [id],
    );
  }

  @Get(":id/previous-texts")
  @ApiOperation({ summary: "النصوص السابقة للمادة" })
  async previous(@Param("id") id: string) {
    return this.db.query(
      `SELECT av.id, av.version_no versionNo, av.text_original AS \`fullText\`,
      DATE_FORMAT(av.valid_from,'%Y-%m-%d') validFrom, DATE_FORMAT(av.valid_to,'%Y-%m-%d') validTo,
      av.ending_reason endingReason, sd.original_name sourceName
      FROM article_versions av JOIN source_documents sd ON sd.id=av.source_document_id
      WHERE av.article_id=? AND av.valid_to IS NOT NULL AND av.valid_to <= CURRENT_DATE()
      ORDER BY av.valid_from DESC`,
      [id],
    );
  }
}
