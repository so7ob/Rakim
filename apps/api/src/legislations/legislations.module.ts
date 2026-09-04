import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RoleGuard } from "../common/role.guard.js";
import { LegislationsController } from "./legislations.controller.js";
import { LegislationsService } from "./legislations.service.js";

@Module({
  imports: [AuthModule],
  controllers: [LegislationsController],
  providers: [LegislationsService, RoleGuard],
})
export class LegislationsModule {}
