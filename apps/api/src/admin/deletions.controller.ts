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
import { IsString, Length } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { DeletionService } from "./deletion.service.js";

class DeletionReasonDto {
  @IsString() @Length(3, 1000) reason!: string;
}

@Controller("admin/deletions")
@UseGuards(SessionGuard)
export class DeletionsController {
  constructor(
    @Inject(DeletionService) private readonly service: DeletionService,
  ) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.user!);
  }

  @Get(":id")
  detail(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.service.detail(id, req.user!);
  }

  @Post(":id/restore")
  restore(
    @Param("id") id: string,
    @Body() dto: DeletionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.restore(id, req.user!, dto.reason);
  }

  @Post(":id/purge")
  purge(
    @Param("id") id: string,
    @Body() dto: DeletionReasonDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.purge(id, req.user!, dto.reason);
  }
}
