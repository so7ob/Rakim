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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";
import type { Response } from "express";
import { SessionGuard } from "../auth/session.guard.js";
import { RoleGuard, Roles } from "../common/role.guard.js";
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
@UseGuards(SessionGuard, RoleGuard)
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly service: ImportsService,
  ) {}
  @Post()
  @Roles("DATA_ENTRY")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: Number(process.env.MAX_IMPORT_BYTES ?? 30 * 1024 * 1024),
        files: 1,
      },
    }),
  )
  @ApiOperation({ summary: "رفع مصدر وحساب SHA-256 وإنشاء مهمة استخراج" })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadMetaDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.upload(file, dto.obtainedFrom, request.user!);
  }
  @Get()
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN")
  list() {
    return this.service.list();
  }
  @Get(":id")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN")
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }
  @Get(":id/source")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN")
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
  @Post(":id/review") @HttpCode(200) @Roles("LEGAL_REVIEWER") review(
    @Param("id") id: string,
    @Body() dto: ReviewImportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.review(id, request.user!, dto.notes);
  }
  @Post(":id/draft") @Roles("DATA_ENTRY") draft(
    @Param("id") id: string,
    @Body() dto: DraftFromImportDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createDraft(id, dto, request.user!);
  }
}
