import { Type } from "class-transformer";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  Min,
  ValidateNested,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
import { AmendmentsService } from "./amendments.service.js";

class OperationDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() articleId?: string;
  @IsIn(["ADD", "REPLACE", "DELETE", "REPEAL", "RENUMBER", "CORRECT"])
  operationType!:
    "ADD" | "REPLACE" | "DELETE" | "REPEAL" | "RENUMBER" | "CORRECT";
  @IsString() @Length(3, 5000) citationText!: string;
  @IsOptional() @IsString() @Length(0, 100000) newText?: string;
  @IsOptional() @IsString() @Length(0, 120) newLabel?: string;
  @IsOptional() @IsString() @Length(0, 120) sortKey?: string;
  @IsOptional() @IsString() @Length(0, 160) paragraphLocator?: string;
  @IsOptional() @IsString() @Length(0, 10000) replacementFrom?: string;
}
class CreateAmendmentDto {
  @IsOptional() @IsString() legislationId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OperationDto)
  operations?: OperationDto[];
  @IsOptional() @IsString() articleId?: string;
  @IsString() sourceDocumentId!: string;
  @IsOptional() @IsString() instrumentLegislationId?: string;
  @IsString() @Length(3, 1000) titleAr!: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) issueDate?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsOptional()
  @IsIn(["ADD", "REPLACE", "DELETE", "REPEAL", "RENUMBER", "CORRECT"])
  operationType?:
    "ADD" | "REPLACE" | "DELETE" | "REPEAL" | "RENUMBER" | "CORRECT";
  @IsOptional() @IsString() paragraphLocator?: string;
  @IsOptional() @IsString() @Length(3, 5000) citationText?: string;
  @IsOptional() @IsString() newText?: string;
  @IsOptional() @IsString() newLabel?: string;
}
class UpdateAmendmentDto extends CreateAmendmentDto {
  @IsInt() @Min(1) revision!: number;
  @IsString() @Length(3, 1000) reason!: string;
}
class ReasonDto {
  @IsString() @Length(3, 1000) reason!: string;
}

@ApiTags("التعديلات الإدارية")
@Controller("admin/amendments")
@UseGuards(SessionGuard, PermissionGuard)
export class AmendmentsController {
  constructor(
    @Inject(AmendmentsService) private readonly service: AmendmentsService,
  ) {}
  @Get("candidates")
  @Permissions("amendment.create", "amendment.update")
  candidates() {
    return this.service.candidates();
  }
  @Get()
  @Permissions("amendment.view")
  list() {
    return this.service.list();
  }
  @Post()
  @Permissions("amendment.create")
  @ApiOperation({ summary: "إنشاء مسودة عملية تعديل بمصدر صريح" })
  create(
    @Body() dto: CreateAmendmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.create(dto, request.user!);
  }
  @Patch(":id")
  @Permissions("amendment.update")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateAmendmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.update(id, dto, req.user!, dto.reason);
  }
  @Post(":id/review")
  @Permissions("amendment.review")
  review(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.review(id, request.user!, dto.reason);
  }
  @Post(":id/publish")
  @Permissions("amendment.publish")
  publish(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.publish(id, request.user!, dto.reason);
  }
}
