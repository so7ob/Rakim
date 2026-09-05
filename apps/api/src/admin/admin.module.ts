import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RoleGuard } from "../common/role.guard.js";
import {
  AdminController,
  PublicationsController,
  ReindexController,
} from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AccessControlController } from "./access-control.controller.js";
import { AccessControlService } from "./access-control.service.js";
import { PermissionGuard } from "../common/permission.guard.js";
@Module({
  imports: [AuthModule],
  controllers: [
    AdminController,
    AccessControlController,
    PublicationsController,
    ReindexController,
  ],
  providers: [RoleGuard, PermissionGuard, AdminService, AccessControlService],
})
export class AdminModule {}
