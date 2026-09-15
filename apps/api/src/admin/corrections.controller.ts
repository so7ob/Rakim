import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsObject, IsString, Length, Matches } from "class-validator";
import { SessionGuard } from "../auth/session.guard.js";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import {
  CorrectionsService,
  type CorrectionKind,
} from "./corrections.service.js";
class CreateCorrectionDto {
  @IsObject() payload!: Record<string, unknown>;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveFrom!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class CorrectionActionDto {
  @IsIn(["approve", "publish", "cancel"]) action!:
    "approve" | "publish" | "cancel";
  @IsString() @Length(3, 1000) reason!: string;
}
@Controller("admin/corrections")
@UseGuards(SessionGuard)
export class CorrectionsController {
  constructor(
    @Inject(CorrectionsService) private readonly service: CorrectionsService,
  ) {}
  @Get("policies") policies(@Req() req: AuthenticatedRequest) {
    return this.service.decisions(req.user!);
  }
  @Get("legislations/:id") list(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.list(id, req.user!);
  }
  @Get("legislations/:id/available") available(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.available(id, req.user!);
  }
  @Post(":kind/:id") create(
    @Param("kind") kind: CorrectionKind,
    @Param("id") id: string,
    @Body() dto: CreateCorrectionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create(
      kind,
      id,
      dto.payload,
      dto.effectiveFrom,
      req.user!,
      dto.reason,
    );
  }
  @Post(":id") transition(
    @Param("id") id: string,
    @Body() dto: CorrectionActionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.transition(id, dto.action, req.user!, dto.reason);
  }
}
