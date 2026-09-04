import {
  Body,
  Controller,
  Delete,
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
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { RoleGuard, Roles } from "../common/role.guard.js";
import { rebuildSearchIndex } from "../database/reindex.js";
import { AdminService } from "./admin.service.js";

class WorkflowDto {
  @IsIn([
    "DRAFT",
    "IN_REVIEW",
    "APPROVED_FOR_PUBLISHING",
    "PUBLISHED",
    "ARCHIVED",
  ])
  target!:
    | "DRAFT"
    | "IN_REVIEW"
    | "APPROVED_FOR_PUBLISHING"
    | "PUBLISHED"
    | "ARCHIVED";
  @IsString() @Length(3, 1000) reason!: string;
}
class PublicationDto {
  @IsString() legislationId!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateDraftDto {
  @IsOptional() @IsString() titleAr?: string;
  @IsOptional() @IsString() summaryAr?: string;
  @IsOptional() @IsString() officialNumber?: string;
  @IsOptional() @IsInt() @Min(1800) @Max(2200) year?: number;
  @IsOptional() @IsString() typeId?: string;
  @IsOptional() @IsString() authorityId?: string;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() publicationDate?: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() preambleText?: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class UserStateDto {
  @IsBoolean() active!: boolean;
  @IsString() @Length(3, 1000) reason!: string;
}
class SynonymDto {
  @IsString() @Length(2, 200) term!: string;
  @IsString() @Length(2, 200) synonym!: string;
}
class CreateUserDto {
  @IsString() @Length(3, 120) username!: string;
  @IsString() @Length(2, 200) displayName!: string;
  @IsString() @Length(12, 200) password!: string;
  @IsArray()
  @ArrayUnique()
  @IsIn(
    [
      "READER",
      "DATA_ENTRY",
      "LEGAL_REVIEWER",
      "CONTENT_MANAGER",
      "SYSTEM_ADMIN",
    ],
    { each: true },
  )
  roles!: string[];
}
class UserRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(
    [
      "READER",
      "DATA_ENTRY",
      "LEGAL_REVIEWER",
      "CONTENT_MANAGER",
      "SYSTEM_ADMIN",
    ],
    { each: true },
  )
  roles!: string[];
  @IsString() @Length(3, 1000) reason!: string;
}
class ResetPasswordDto {
  @IsString() @Length(12, 200) password!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class ReasonDto {
  @IsString() @Length(3, 1000) reason!: string;
}
class QualityResolutionDto {
  @IsIn(["RESOLVED", "IGNORED"]) status!: "RESOLVED" | "IGNORED";
  @IsString() @Length(3, 1000) note!: string;
}
class ReportStateDto {
  @IsIn(["TRIAGED", "RESOLVED", "REJECTED"]) status!:
    "TRIAGED" | "RESOLVED" | "REJECTED";
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateArticleDto {
  @IsString() @Length(1, 1000000) text!: string;
  @IsString() @Length(3, 1000) reason!: string;
}

@ApiTags("الإدارة")
@Controller("admin")
@UseGuards(SessionGuard, RoleGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}

  @Get("dashboard")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN")
  @ApiOperation({ summary: "مؤشرات لوحة الإدارة" })
  dashboard() {
    return this.service.dashboard();
  }
  @Get("references")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN")
  references() {
    return this.service.references();
  }
  @Get("legislations")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER")
  legislations(
    @Query("status") status?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
  ) {
    return this.service.legislations({ status, q, page: Number(page || 1) });
  }
  @Get("legislations/:id")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER")
  legislation(@Param("id") id: string) {
    return this.service.legislation(id);
  }
  @Patch("legislations/:id")
  @Roles("DATA_ENTRY")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.update(id, input, request.user!, reason);
  }
  @Post("legislations/:id/workflow")
  @Roles("DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER")
  workflow(
    @Param("id") id: string,
    @Body() dto: WorkflowDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.transition(id, dto.target, request.user!, dto.reason);
  }
  @Patch("articles/:id") @Roles("DATA_ENTRY") updateArticle(
    @Param("id") id: string,
    @Body() dto: UpdateArticleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateDraftArticle(
      id,
      dto.text,
      request.user!,
      dto.reason,
    );
  }
  @Get("audit") @Roles("CONTENT_MANAGER", "SYSTEM_ADMIN") audit(
    @Query("page") page?: string,
    @Query("action") action?: string,
  ) {
    return this.service.audit({ page: Number(page || 1), action });
  }
  @Get("users") @Roles("SYSTEM_ADMIN") users() {
    return this.service.users();
  }
  @Get("roles") @Roles("SYSTEM_ADMIN") roles() {
    return this.service.roles();
  }
  @Post("users") @Roles("SYSTEM_ADMIN") createUser(
    @Body() dto: CreateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createUser(dto, request.user!);
  }
  @Patch("users/:id/state")
  @Roles("SYSTEM_ADMIN")
  userState(
    @Param("id") id: string,
    @Body() dto: UserStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.setUserActive(
      id,
      dto.active,
      request.user!,
      dto.reason,
    );
  }
  @Patch("users/:id/roles") @Roles("SYSTEM_ADMIN") userRoles(
    @Param("id") id: string,
    @Body() dto: UserRolesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.setUserRoles(id, dto.roles, request.user!, dto.reason);
  }
  @Post("users/:id/reset-password") @Roles("SYSTEM_ADMIN") resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.resetPassword(
      id,
      dto.password,
      request.user!,
      dto.reason,
    );
  }
  @Get("synonyms") @Roles("CONTENT_MANAGER") synonyms() {
    return this.service.synonyms();
  }
  @Post("synonyms") @Roles("CONTENT_MANAGER") addSynonym(
    @Body() dto: SynonymDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.addSynonym(dto.term, dto.synonym, request.user!);
  }
  @Post("synonym-sets/:id/activate") @Roles("CONTENT_MANAGER") activateSynonyms(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.activateSynonymSet(id, request.user!, dto.reason);
  }
  @Delete("synonyms/:id") @Roles("CONTENT_MANAGER") deleteSynonym(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.deleteSynonym(id, request.user!);
  }
  @Get("quality")
  @Roles("LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN")
  quality() {
    return this.service.quality();
  }
  @Patch("quality/:id")
  @Roles("LEGAL_REVIEWER", "CONTENT_MANAGER")
  resolveQuality(
    @Param("id") id: string,
    @Body() dto: QualityResolutionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.resolveQuality(id, dto.status, dto.note, request.user!);
  }
  @Get("reports") @Roles("CONTENT_MANAGER") reports() {
    return this.service.reports();
  }
  @Patch("reports/:id") @Roles("CONTENT_MANAGER") reportState(
    @Param("id") id: string,
    @Body() dto: ReportStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateReport(id, dto.status, dto.reason, request.user!);
  }
  @Post("reindex")
  @Roles("CONTENT_MANAGER", "SYSTEM_ADMIN")
  @ApiOperation({ summary: "إعادة بناء فهرس البحث المشتق كاملًا" })
  async reindex() {
    const count = await rebuildSearchIndex();
    return { status: "rebuilt", count };
  }
}

@ApiTags("النشر")
@Controller("publications")
@UseGuards(SessionGuard, RoleGuard)
export class PublicationsController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Post() @Roles("CONTENT_MANAGER") publish(
    @Body() dto: PublicationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.transition(
      dto.legislationId,
      "PUBLISHED",
      request.user!,
      dto.reason,
    );
  }
}

@ApiTags("البحث")
@Controller("reindex")
@UseGuards(SessionGuard, RoleGuard)
export class ReindexController {
  @Post()
  @Roles("CONTENT_MANAGER", "SYSTEM_ADMIN")
  @ApiOperation({ summary: "إعادة بناء فهرس البحث المشتق كاملًا" })
  async rebuild() {
    const count = await rebuildSearchIndex();
    return { status: "rebuilt", count };
  }
}
