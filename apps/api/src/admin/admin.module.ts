import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import {
  AdminController,
  PublicationsController,
  ReindexController,
} from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AccessControlController } from "./access-control.controller.js";
import { AccessControlService } from "./access-control.service.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { AuthorizationPolicyService } from "./authorization-policy.service.js";
@Module({
  imports: [AuthModule],
  controllers: [
    AdminController,
    AccessControlController,
    PublicationsController,
    ReindexController,
  ],
  providers: [
    PermissionGuard,
    AuthorizationPolicyService,
    AdminService,
    AccessControlService,
  ],
})
export class AdminModule {}
