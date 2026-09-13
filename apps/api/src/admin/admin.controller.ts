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
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
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
  @IsOptional() @IsString() displayCode?: string;
  @IsOptional() @IsString() titleAr?: string;
  @IsOptional() @IsString() summaryAr?: string;
  @IsOptional() @IsString() officialNumber?: string;
  @IsOptional() @IsInt() @Min(1800) @Max(2200) year?: number;
  @IsOptional() @IsString() typeId?: string;
  @IsOptional() @IsString() authorityId?: string;
  @IsOptional() @IsString() issueDate?: string;
  @IsOptional() @IsString() publicationDate?: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() repealDate?: string;
  @IsOptional()
  @IsIn([
    "IN_FORCE",
    "AMENDED",
    "PARTIALLY_REPEALED",
    "REPEALED",
    "SUSPENDED",
    "UNKNOWN",
  ])
  legalStatus?: string;
  @IsOptional() @IsIn(["A", "B", "C", "D"]) verificationLevel?: string;
  @IsOptional() @IsString() gazetteIssueNumber?: string;
  @IsOptional() @IsString() gazettePublicationDate?: string;
  @IsOptional() @IsString() gazettePublisher?: string;
  @IsOptional() @IsString() gazetteNotes?: string;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  subjectIds?: string[];
  @IsOptional() @IsString() preambleText?: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class GazetteDto {
  @IsOptional() @IsInt() @Min(1) editRevision?: number;
  @IsString() @Length(1, 80) issueNumber!: string;
  @IsOptional() @IsString() publicationDate?: string;
  @IsOptional() @IsString() @Length(0, 200) publisher?: string;
  @IsOptional() @IsString() @Length(0, 10000) notes?: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class LinkSourceDto {
  @IsString() sourceDocumentId!: string;
  @IsIn(["EXTRACTION", "OFFICIAL_PDF", "SUPPORTING"]) sourceRole!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class CreateArticleDto {
  @IsString() @Length(1, 120) currentLabel!: string;
  @IsString() @Length(1, 120) sortKey!: string;
  @IsOptional() @IsString() structureNodeId?: string;
  @IsString() sourceDocumentId!: string;
  @IsDateString() validFrom!: string;
  @IsString() @Length(1, 100000) text!: string;
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
  @IsString({ each: true })
  roles!: string[];
}
class UserRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roles!: string[];
  @IsString() @Length(3, 1000) reason!: string;
}
class WorkflowPolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @Length(3, 1000) reason!: string;
}
class WorkflowPolicyOverridesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  userIds!: string[];
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
  @IsIn(["OPEN", "TRIAGED"]) expectedStatus!: string;
  @IsIn(["TRIAGED", "RESOLVED", "REJECTED"]) status!:
    "TRIAGED" | "RESOLVED" | "REJECTED";
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateArticleDto {
  @IsString() @Length(1, 1000000) text!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateArticleMetadataDto {
  @IsString() @Length(1, 120) currentLabel!: string;
  @IsString() @Length(1, 120) publishedLabel!: string;
  @IsString() @Length(1, 120) sortKey!: string;
  @IsOptional() @IsString() structureNodeId?: string;
  @IsDateString() validFrom!: string;
  @IsString() @Length(1, 1000000) text!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateArticleAssignmentsDto {
  @IsUUID("4") legislationId!: string;
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  assign!: string[];
  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  unassign!: string[];
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateSourceDto {
  @IsString() @Length(1, 255) obtainedFrom!: string;
  @IsOptional() @IsInt() @Min(1) pageCount?: number;
  @IsIn([
    "PENDING",
    "EXTRACTED",
    "OCR_REQUIRED",
    "OCR_UNREVIEWED",
    "REVIEWED",
    "FAILED",
  ])
  extractionStatus!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateStructureDto {
  @IsIn([
    "PREAMBLE",
    "BOOK",
    "PART",
    "TITLE",
    "CHAPTER",
    "SECTION",
    "SUBSECTION",
  ])
  nodeType!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsString() labelAr?: string;
  @IsString() @Length(1, 500) titleAr!: string;
  @IsString() @Length(1, 120) sortKey!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class UpdateAnnexDto {
  @IsIn([
    "EXECUTIVE_REGULATION",
    "TABLE",
    "FORM",
    "ANNEX",
    "MAP",
    "TARIFF",
    "LIST",
    "CORRECTION",
  ])
  annexType!: string;
  @IsString() @Length(1, 1000) titleAr!: string;
  @IsIn(["DRAFT", "PUBLISHED", "REPLACED", "REPEALED"]) status!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class CreateAnnexDto extends UpdateAnnexDto {
  @IsString() sourceDocumentId!: string;
  @IsString() validFrom!: string;
  @IsOptional() @IsString() structuredTableJson?: string;
}
class UpdateRelationDto {
  @IsIn([
    "AMENDS",
    "REPEALS",
    "IMPLEMENTS",
    "BASED_ON",
    "REFERS_TO",
    "CORRECTS",
    "TOPICALLY_RELATED",
  ])
  relationType!: string;
  @IsString() targetLegislationId!: string;
  @IsOptional() @IsString() scopeText?: string;
  @IsOptional() @IsString() effectiveFrom?: string;
  @IsOptional() @IsString() sourceDocumentId?: string;
  @IsIn(["UNREVIEWED", "REVIEWED", "REJECTED"]) reviewStatus!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class ReferenceItemDto {
  @IsOptional() @IsInt() @Min(1) editRevision?: number;
  @IsString() @Length(2, 60) code!: string;
  @IsString() @Length(1, 200) nameAr!: string;
  @IsBoolean() isActive!: boolean;
  @IsOptional() @IsString() parentId?: string;
  @IsString() @Length(3, 1000) reason!: string;
}

@ApiTags("الإدارة")
@Controller("admin")
@UseGuards(SessionGuard, PermissionGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}

  @Get("dashboard")
  @Permissions("dashboard.view")
  @ApiOperation({ summary: "مؤشرات لوحة الإدارة" })
  dashboard() {
    return this.service.dashboard();
  }
  @Post("legislations/:id/sources")
  @Permissions("source.update")
  linkSource(
    @Param("id") id: string,
    @Body() dto: LinkSourceDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.linkSource(id, dto, req.user!);
  }
  @Delete("legislations/:id/sources/:sourceId")
  @Permissions("source.delete")
  unlinkSource(
    @Param("id") id: string,
    @Param("sourceId") sourceId: string,
    @Body() dto: ReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.unlinkSource(id, sourceId, req.user!, dto.reason);
  }
  @Get("gazette-issues") @Permissions("reference.view") gazettes() {
    return this.service.gazettes();
  }
  @Post("gazette-issues") @Permissions("reference.create") createGazette(
    @Body() dto: GazetteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveGazette(dto, req.user!);
  }
  @Patch("gazette-issues/:id") @Permissions("reference.update") updateGazette(
    @Param("id") id: string,
    @Body() dto: GazetteDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.saveGazette(dto, req.user!, id);
  }
  @Post("synonym-sets")
  @Permissions("search.synonym_set.create")
  createSynonymSet(@Body() dto: ReasonDto, @Req() req: AuthenticatedRequest) {
    return this.service.createSynonymSet(req.user!, dto.reason);
  }
  @Get("source-options")
  @Permissions("source.view")
  sourceOptions() {
    return this.service.sourceOptions();
  }
  @Get("references")
  @Permissions("reference.view")
  references() {
    return this.service.references();
  }
  @Get("reference-data")
  @Permissions("reference.view")
  referenceData() {
    return this.service.referenceData();
  }
  @Post("reference-data/:kind")
  @Permissions("reference.create")
  createReference(
    @Param("kind") kind: string,
    @Body() dto: ReferenceItemDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.createReference(kind, input, request.user!, reason);
  }
  @Patch("reference-data/:kind/:id")
  @Permissions("reference.update")
  updateReference(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() dto: ReferenceItemDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateReference(kind, id, input, request.user!, reason);
  }
  @Get("legislations")
  @Permissions("legislation.view")
  legislations(
    @Query("status") status?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
  ) {
    return this.service.legislations({ status, q, page: Number(page || 1) });
  }
  @Get("legislations/:id")
  @Permissions("legislation.view")
  legislation(
    @Param("id") id: string,
    @Query("articleContent") articleContent?: string,
  ) {
    return this.service.legislation(id, articleContent === "full");
  }
  @Patch("legislations/:id")
  @Permissions("legislation.update", "legislation.published_metadata.update")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.update(id, input, request.user!, reason);
  }
  @Post("legislations/:id/workflow")
  @Permissions(
    "legislation.prepare",
    "legislation.submit",
    "legislation.return",
    "legislation.approve",
    "legislation.publish",
    "legislation.archive",
  )
  workflow(
    @Param("id") id: string,
    @Body() dto: WorkflowDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.transition(id, dto.target, request.user!, dto.reason);
  }
  @Post("legislations/:id/articles")
  @Permissions("article.create")
  createArticle(
    @Param("id") id: string,
    @Body() dto: CreateArticleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.createArticle(id, dto, req.user!);
  }
  @Patch("articles/:id")
  @Permissions("article.update")
  updateArticle(
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
  @Patch("articles/:id/metadata")
  @Permissions("article.update")
  updateArticleMetadata(
    @Param("id") id: string,
    @Body() dto: UpdateArticleMetadataDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateDraftArticleMetadata(
      id,
      input,
      request.user!,
      reason,
    );
  }
  @Patch("sources/:id")
  @Permissions("source.update")
  updateSource(
    @Param("id") id: string,
    @Body() dto: UpdateSourceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateSource(id, input, request.user!, reason);
  }
  @Patch("structure/:id")
  @Permissions("structure.update")
  updateStructure(
    @Param("id") id: string,
    @Body() dto: UpdateStructureDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateStructure(id, input, request.user!, reason);
  }
  @Get("structure/:id/articles")
  @Permissions("legislation.view")
  @ApiOperation({ summary: "قائمة مواد خفيفة لإدارة ربط عقدة بنيوية" })
  structureArticles(
    @Param("id") id: string,
    @Query("q") q?: string,
    @Query("state") state?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.service.structureArticles(id, {
      q,
      state,
      page: Number(page || 1),
      pageSize: Number(pageSize || 100),
    });
  }
  @Patch("structure/:id/articles")
  @Permissions("article.update")
  @ApiOperation({ summary: "ربط أو فك أو نقل مواد جماعيًا وبصورة ذرية" })
  updateArticleAssignments(
    @Param("id") id: string,
    @Body() dto: UpdateArticleAssignmentsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateArticleAssignments(
      id,
      input,
      request.user!,
      reason,
    );
  }
  @Post("legislations/:id/structure")
  @Permissions("structure.create")
  createStructure(
    @Param("id") id: string,
    @Body() dto: UpdateStructureDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.createStructure(id, input, request.user!, reason);
  }
  @Patch("annexes/:id")
  @Permissions("annex.update", "annex.publish", "annex.replace", "annex.repeal")
  updateAnnex(
    @Param("id") id: string,
    @Body() dto: UpdateAnnexDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateAnnex(id, input, request.user!, reason);
  }
  @Post("legislations/:id/annexes")
  @Permissions("annex.create", "annex.publish", "annex.replace", "annex.repeal")
  createAnnex(
    @Param("id") id: string,
    @Body() dto: CreateAnnexDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.createAnnex(id, input, request.user!, reason);
  }
  @Patch("relations/:id")
  @Permissions("relation.update", "relation.review")
  updateRelation(
    @Param("id") id: string,
    @Body() dto: UpdateRelationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateRelation(id, input, request.user!, reason);
  }
  @Post("legislations/:id/relations")
  @Permissions("relation.create", "relation.review")
  createRelation(
    @Param("id") id: string,
    @Body() dto: UpdateRelationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.createRelation(id, input, request.user!, reason);
  }
  @Get("audit")
  @Permissions("audit.view")
  audit(@Query("page") page?: string, @Query("action") action?: string) {
    return this.service.audit({ page: Number(page || 1), action });
  }
  @Get("users") @Permissions("user.view") users(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.users(request.user!);
  }
  @Get("roles") @Permissions("role.view") roles(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.roles(request.user!);
  }
  @Get("workflow-policies")
  @Permissions("workflow_policy.view")
  workflowPolicies(@Req() request: AuthenticatedRequest) {
    return this.service.workflowPolicies(request.user!);
  }
  @Patch("workflow-policies/:code")
  @Permissions("workflow_policy.update")
  workflowPolicy(
    @Param("code") code: string,
    @Body() dto: WorkflowPolicyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateWorkflowPolicy(
      code,
      dto.enabled,
      request.user!,
      dto.reason,
    );
  }
  @Patch("workflow-policies/:code/overrides")
  @Permissions("workflow_policy.overrides.manage")
  workflowPolicyOverrides(
    @Param("code") code: string,
    @Body() dto: WorkflowPolicyOverridesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateWorkflowPolicyOverrides(
      code,
      dto.userIds,
      request.user!,
      dto.reason,
    );
  }
  @Post("users") @Permissions("user.create") createUser(
    @Body() dto: CreateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createUser(dto, request.user!);
  }
  @Patch("users/:id/state")
  @Permissions("user.enable", "user.disable")
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
  @Patch("users/:id/roles")
  @Permissions("user.roles.manage")
  userRoles(
    @Param("id") id: string,
    @Body() dto: UserRolesDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.setUserRoles(id, dto.roles, request.user!, dto.reason);
  }
  @Post("users/:id/reset-password")
  @Permissions("user.reset_password")
  resetPassword(
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
  @Get("synonyms")
  @Permissions("search.synonym.view")
  synonyms() {
    return this.service.synonyms();
  }
  @Post("synonyms")
  @Permissions("search.synonym.create")
  addSynonym(@Body() dto: SynonymDto, @Req() request: AuthenticatedRequest) {
    return this.service.addSynonym(dto.term, dto.synonym, request.user!);
  }
  @Patch("synonyms/:id")
  @Permissions("search.synonym.update")
  updateSynonym(
    @Param("id") id: string,
    @Body() dto: SynonymDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.updateSynonym(id, dto.term, dto.synonym, req.user!);
  }
  @Post("synonym-sets/:id/activate")
  @Permissions("search.synonym_set.activate")
  activateSynonyms(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.activateSynonymSet(id, request.user!, dto.reason);
  }
  @Delete("synonyms/:id")
  @Permissions("search.synonym.delete")
  deleteSynonym(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.service.deleteSynonym(id, request.user!);
  }
  @Get("quality/:id/history") @Permissions("quality.view") qualityHistory(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.decisionHistory("quality", id, req.user!);
  }
  @Get("reports/:id/history") @Permissions("report.view") reportHistory(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.decisionHistory("reports", id, req.user!);
  }
  @Get("quality")
  @Permissions("quality.view")
  quality(@Query("status") status?: string) {
    return this.service.quality(status);
  }
  @Patch("quality/:id")
  @Permissions("quality.resolve")
  resolveQuality(
    @Param("id") id: string,
    @Body() dto: QualityResolutionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.resolveQuality(id, dto.status, dto.note, request.user!);
  }
  @Get("reports")
  @Permissions("report.view")
  reports() {
    return this.service.reports();
  }
  @Patch("reports/:id")
  @Permissions("report.update")
  reportState(
    @Param("id") id: string,
    @Body() dto: ReportStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateReport(
      id,
      dto.status,
      dto.reason,
      request.user!,
      dto.expectedStatus,
    );
  }
  @Post("reindex")
  @Permissions("search.index.rebuild")
  @ApiOperation({ summary: "إعادة بناء فهرس البحث المشتق كاملًا" })
  async reindex() {
    const count = await rebuildSearchIndex();
    return { status: "rebuilt", count };
  }
}

@ApiTags("النشر")
@Controller("publications")
@UseGuards(SessionGuard, PermissionGuard)
export class PublicationsController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Post() @Permissions("legislation.publish") publish(
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
@UseGuards(SessionGuard, PermissionGuard)
export class ReindexController {
  @Post()
  @Permissions("search.index.rebuild")
  @ApiOperation({ summary: "إعادة بناء فهرس البحث المشتق كاملًا" })
  async rebuild() {
    const count = await rebuildSearchIndex();
    return { status: "rebuilt", count };
  }
}
