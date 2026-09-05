import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RoleGuard } from "../common/role.guard.js";
import { AdminSiteController, SiteController } from "./site.controller.js";
import { SiteService } from "./site.service.js";

@Module({
  imports: [AuthModule],
  controllers: [SiteController, AdminSiteController],
  providers: [SiteService, RoleGuard],
})
export class SiteModule {}
