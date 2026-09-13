import { PasswordRecoveryService } from "./password-recovery.service.js";
import {
  PublicRecoveryController,
  AdminRecoveryController,
} from "./password-recovery.controller.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";

@Module({
  controllers: [
    AuthController,
    PublicRecoveryController,
    AdminRecoveryController,
  ],
  providers: [
    AuthService,
    SessionGuard,
    PasswordRecoveryService,
    PermissionGuard,
  ],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
