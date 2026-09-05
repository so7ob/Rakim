import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";
import type { Response } from "express";
import { SessionGuard } from "../auth/session.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
import { ImportsService } from "./imports.service.js";

class UploadMetaDto {
  @IsString() @Length(2, 255) obtainedFrom!: string;
}
class ReviewImportDto {
  @IsString() @Length(3, 1000) notes!: string;
}
class DraftFromImportDto {
  @IsString() @Length(3, 1000) titleAr!: string;
  @IsOptional() @IsString() officialNumber?: string;
  @IsInt() @Min(1800) @Max(2200) year!: number;
  @IsString() typeId!: string;
  @IsString() authorityId!: string;
  @IsOptional() @IsString() effectiveFrom?: string;
}

@ApiTags("الاستيراد")
@Controller("imports")
@UseGuards(SessionGuard, PermissionGuard)
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly service: ImportsService,
  ) {}
  @Post()
  @Permissions("source.upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "file", maxCount: 1 },
        { name: "referencePdf", maxCount: 1 },
      ],
      {
        limits: {
          fileSize: Number(process.env.MAX_IMPORT_BYTES ?? 30 * 1024 * 1024),
          files: 2,
        },
      },
    ),
  )
  @ApiOperation({
    summary: "رفع مصدر استخراج ونسخة PDF رسمية اختيارية للتشريع نفسه",
  })
  upload(
    @UploadedFiles()
    files:
      | {
          file?: Express.Multer.File[];
          referencePdf?: Express.Multer.File[];
        }
      | undefined,
    @Body() dto: UploadMetaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.upload(
      files?.file?.[0],
      dto.obtainedFrom,
      request.user!,
      files?.referencePdf?.[0],
    );
  }
  @Get()
  @Permissions("source.view")
  list() {
    return this.service.list();
  }
  @Get(":id")
  @Permissions("source.view")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }
  @Get(":id/source")
  @Permissions("source.view")
  async source(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.source(id);
    const root = resolve(
      process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
    );
    const target = resolve(root, file.storageKey);
    if (!target.startsWith(`${root}${sep}`))
      throw new NotFoundException("مسار المصدر غير صالح.");
    response.setHeader("Content-Type", file.mediaType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    return new StreamableFile(createReadStream(target));
  }
  @Get(":id/attachments/:sourceDocumentId")
  @Permissions("source.view")
  async attachment(
    @Param("id") id: string,
    @Param("sourceDocumentId") sourceDocumentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.service.attachment(id, sourceDocumentId);
    const root = resolve(
      process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
    );
    const target = resolve(root, file.storageKey);
    if (!target.startsWith(`${root}${sep}`))
      throw new NotFoundException("مسار المصدر غير صالح.");
    response.setHeader("Content-Type", file.mediaType);
    response.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    return new StreamableFile(createReadStream(target));
  }
  @Post(":id/review")
  @HttpCode(200)
  @Permissions("source.review")
  review(
    @Param("id") id: string,
    @Body() dto: ReviewImportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.review(id, request.user!, dto.notes);
  }
  @Post(":id/draft")
  @Permissions("source.draft.create")
  draft(
    @Param("id") id: string,
    @Body() dto: DraftFromImportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createDraft(id, dto, request.user!);
  }
}
