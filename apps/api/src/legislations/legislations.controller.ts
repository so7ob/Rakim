import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RoleGuard, Roles } from "../common/role.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
import { CreateLegislationDto } from "./create-legislation.dto.js";
import { LegislationsService } from "./legislations.service.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { resolve, sep } from "node:path";

@ApiTags("التشريعات")
@Controller("legislations")
export class LegislationsController {
  constructor(
    @Inject(LegislationsService) private readonly service: LegislationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "قائمة التشريعات المنشورة مع التصفية والترقيم" })
  list(@Query() query: Record<string, string | undefined>) {
    return this.service.list(query);
  }

  @Get("suggestions")
  @ApiOperation({ summary: "اقتراحات البحث أثناء الكتابة" })
  suggestions(@Query("q") q = "") {
    return this.service.suggestions(q);
  }

  @Get("latest-modifications")
  @ApiOperation({ summary: "أحدث التعديلات المنشورة في جميع التشريعات" })
  latestModifications(@Query("limit") limit?: string) {
    return this.service.latestModifications(limit);
  }

  @Get(":id/source")
  @ApiOperation({ summary: "تنزيل المصدر العام المدقق دون كشف مساره" })
  async source(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const source = await this.service.source(id);
    const root = resolve(
      process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data"),
    );
    const path = resolve(root, source.storageKey);
    if (!path.startsWith(`${root}${sep}`))
      throw new Error("UNSAFE_SOURCE_PATH");
    response.setHeader("Content-Type", source.mediaType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(source.fileName)}`,
    );
    return new StreamableFile(createReadStream(path));
  }

  @Post()
  @UseGuards(SessionGuard, PermissionGuard, RoleGuard)
  @Permissions("legislation.create")
  @Roles("DATA_ENTRY")
  @ApiOperation({ summary: "إنشاء مسودة تشريع وتسجيلها في التدقيق" })
  create(
    @Body() dto: CreateLegislationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.create(dto, request.user!);
  }

  @Get(":id")
  @ApiOperation({ summary: "بيانات تشريع منشور" })
  detail(@Param("id") id: string) {
    return this.service.detail(id);
  }

  @Get(":id/structure")
  @ApiOperation({ summary: "الهيكل البنيوي للتشريع" })
  structure(@Param("id") id: string) {
    return this.service.structure(id);
  }

  @Get(":id/articles")
  @ApiOperation({ summary: "مواد التشريع النافذة في تاريخ" })
  articles(@Param("id") id: string, @Query("at") at?: string) {
    return this.service.articles(id, at);
  }

  @Get(":id/modifications")
  @ApiOperation({ summary: "تعديلات التشريع مجمعة حسب السنة والعملية" })
  modifications(@Param("id") id: string) {
    return this.service.modifications(id);
  }

  @Get(":id/annexes")
  @ApiOperation({ summary: "لوائح التشريع وجداوله وملاحقه وإصداراتها" })
  annexes(@Param("id") id: string) {
    return this.service.annexes(id);
  }

  @Get(":id/relations")
  @ApiOperation({ summary: "العلاقات القانونية الموجهة للتشريع" })
  relations(@Param("id") id: string) {
    return this.service.relations(id);
  }
}
