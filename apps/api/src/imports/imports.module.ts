import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RoleGuard } from "../common/role.guard.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { ImportsController } from "./imports.controller.js";
import { ImportsService } from "./imports.service.js";
@Module({
  imports: [AuthModule],
  controllers: [ImportsController],
  providers: [ImportsService, RoleGuard, PermissionGuard],
})
export class ImportsModule {}
