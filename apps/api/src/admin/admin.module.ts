import { LifecycleController } from "./lifecycle.controller.js";
import { LifecycleService } from "./lifecycle.service.js";
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
import { DeletionService } from "./deletion.service.js";
import { DeletionsController } from "./deletions.controller.js";
@Module({
  imports: [AuthModule],
  controllers: [
    AdminController,
    LifecycleController,
    AccessControlController,
    PublicationsController,
    ReindexController,
    DeletionsController,
  ],
  providers: [
    PermissionGuard,
    AuthorizationPolicyService,
    AdminService,
    LifecycleService,
    AccessControlService,
    DeletionService,
  ],
})
export class AdminModule {}
