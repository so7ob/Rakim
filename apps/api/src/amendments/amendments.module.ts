import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PermissionGuard } from "../common/permission.guard.js";
import { AmendmentsController } from "./amendments.controller.js";
import { AmendmentsService } from "./amendments.service.js";
@Module({
  imports: [AuthModule],
  controllers: [AmendmentsController],
  providers: [AmendmentsService, PermissionGuard],
})
export class AmendmentsModule {}
