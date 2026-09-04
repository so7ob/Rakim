import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RoleGuard } from "../common/role.guard.js";
import { AmendmentsController } from "./amendments.controller.js";
import { AmendmentsService } from "./amendments.service.js";
@Module({
  imports: [AuthModule],
  controllers: [AmendmentsController],
  providers: [AmendmentsService, RoleGuard],
})
export class AmendmentsModule {}
