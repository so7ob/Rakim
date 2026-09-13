import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsString, Length } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { LifecycleService } from "./lifecycle.service.js";
class LifecycleDto {
  @IsIn(["delete", "enable", "disable"]) action!:
    "delete" | "enable" | "disable";
  @IsString() @Length(3, 1000) reason!: string;
}
// The service checks the exact resource.action and record authority for every request.
@Controller("admin/lifecycle")
@UseGuards(SessionGuard)
export class LifecycleController {
  constructor(
    @Inject(LifecycleService) private readonly service: LifecycleService,
  ) {}
  @Get(":kind/:id") state(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.state(kind, id, req.user!);
  }
  @Patch(":kind/:id") change(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() dto: LifecycleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.change(kind, id, dto.action, req.user!, dto.reason);
  }
}
