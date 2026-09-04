import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RoleGuard } from "../common/role.guard.js";
import {
  AdminController,
  PublicationsController,
  ReindexController,
} from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
@Module({
  imports: [AuthModule],
  controllers: [AdminController, PublicationsController, ReindexController],
  providers: [RoleGuard, AdminService],
})
export class AdminModule {}
