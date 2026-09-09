import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
import { SiteService } from "./site.service.js";

class CreatePageDto {
  @IsString() @Length(2, 120) slug!: string;
  @IsString() @Length(1, 500) titleAr!: string;
  @IsString() @Length(0, 10000) introAr!: string;
  @IsString() @Length(1, 500) sectionTitle!: string;
  @IsString() @Length(1, 100000) sectionBody!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class SettingsDto {
  @IsObject() values!: Record<string, string | boolean>;
  @IsString() @Length(3, 1000) reason!: string;
}
class NavigationDto {
  @IsIn(["HEADER", "FOOTER"]) location!: "HEADER" | "FOOTER";
  @IsString() @Length(1, 160) labelAr!: string;
  @IsString() @Length(1, 500) path!: string;
  @IsInt() @Min(0) @Max(10000) sortOrder!: number;
  @IsBoolean() isVisible!: boolean;
  @IsString() @Length(3, 1000) reason!: string;
}
class PageSectionDto {
  @IsString() @Length(1, 500) title!: string;
  @IsString() @Length(1, 100000) body!: string;
}
class PageDto {
  @IsString() @Length(0, 200) eyebrowAr!: string;
  @IsString() @Length(1, 500) titleAr!: string;
  @IsString() @Length(0, 10000) introAr!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PageSectionDto)
  sections!: PageSectionDto[];
  @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"]) status!:
    "DRAFT" | "PUBLISHED" | "ARCHIVED";
  @IsString() @Length(3, 1000) reason!: string;
}

@ApiTags("إعدادات المنصة العامة")
@Controller("site")
export class SiteController {
  constructor(@Inject(SiteService) private readonly service: SiteService) {}
  @Get("config")
  @ApiOperation({ summary: "الهوية والألوان وروابط التنقل العامة" })
  config() {
    return this.service.config();
  }
  @Get("pages") @ApiOperation({ summary: "صفحة محتوى عامة منشورة" }) page(
    @Query("slug") slug = "",
  ) {
    return this.service.page(slug);
  }
}

@ApiTags("إدارة إعدادات المنصة")
@Controller("admin/site")
@UseGuards(SessionGuard, PermissionGuard)
export class AdminSiteController {
  constructor(@Inject(SiteService) private readonly service: SiteService) {}
  @Get()
  @Permissions("settings.view")
  state() {
    return this.service.adminState();
  }
  @Patch("settings")
  @Permissions(
    "settings.general.update",
    "settings.appearance.update",
    "settings.header.update",
    "settings.footer.update",
    "settings.legislation_page.update",
  )
  settings(@Body() dto: SettingsDto, @Req() req: AuthenticatedRequest) {
    return this.service.updateSettings(dto.values, req.user!, dto.reason);
  }
  @Post("navigation")
  @Permissions("navigation.create")
  createNavigation(
    @Body() dto: NavigationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.createNavigation(input, req.user!, reason);
  }
  @Patch("navigation/:id")
  @Permissions("navigation.update")
  navigation(
    @Param("id") id: string,
    @Body() dto: NavigationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateNavigation(id, input, req.user!, reason);
  }
  @Post("pages")
  @Permissions("public_page.create")
  createPage(@Body() dto: CreatePageDto, @Req() req: AuthenticatedRequest) {
    return this.service.createPage(dto, req.user!);
  }
  @Patch("pages/:id")
  @Permissions(
    "public_page.update",
    "public_page.publish",
    "public_page.archive",
  )
  page(
    @Param("id") id: string,
    @Body() dto: PageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updatePage(id, input, req.user!, reason);
  }
}
