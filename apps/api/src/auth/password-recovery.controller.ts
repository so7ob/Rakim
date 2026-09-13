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
import { IsBoolean, IsIn, IsString, Length, Matches } from "class-validator";
import { PasswordRecoveryService } from "./password-recovery.service.js";
import { SessionGuard } from "./session.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
import type { AuthenticatedRequest } from "./auth.types.js";
class RequestDto {
  @IsString() @Length(2, 120) username!: string;
}
class CompleteDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
  @IsString()
  @Length(12, 200)
  @Matches(/[A-Za-z]/)
  @Matches(/\d/)
  password!: string;
}
class HandleDto {
  @IsIn(["issue", "reject"]) action!: "issue" | "reject";
  @IsString() @Length(3, 1000) reason!: string;
  @IsBoolean() identityVerified!: boolean;
}
@Controller("auth/password-recovery")
export class PublicRecoveryController {
  constructor(
    @Inject(PasswordRecoveryService)
    private readonly service: PasswordRecoveryService,
  ) {}
  @Post() request(@Body() dto: RequestDto) {
    return this.service.request(dto.username);
  }
  @Post("complete") complete(@Body() dto: CompleteDto) {
    return this.service.complete(dto.token, dto.password);
  }
}
@Controller("admin/recovery-requests")
@UseGuards(SessionGuard, PermissionGuard)
export class AdminRecoveryController {
  constructor(
    @Inject(PasswordRecoveryService)
    private readonly service: PasswordRecoveryService,
  ) {}
  @Get() @Permissions("user.reset_password") list(
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.list(req.user!);
  }
  @Post(":id") @Permissions("user.reset_password") handle(
    @Param("id") id: string,
    @Body() dto: HandleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.handle(
      id,
      dto.action,
      dto.reason,
      dto.identityVerified,
      req.user!,
    );
  }
}
