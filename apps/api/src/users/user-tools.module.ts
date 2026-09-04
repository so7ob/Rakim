import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { UserToolsController } from "./user-tools.controller.js";
import { UserToolsService } from "./user-tools.service.js";
@Module({
  imports: [AuthModule],
  controllers: [UserToolsController],
  providers: [UserToolsService],
})
export class UserToolsModule {}
