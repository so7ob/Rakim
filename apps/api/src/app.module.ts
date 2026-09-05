import { Module } from "@nestjs/common";
import { ArticlesModule } from "./articles/articles.module.js";
import { AnnexesModule } from "./annexes/annexes.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { LegislationsModule } from "./legislations/legislations.module.js";
import { SearchModule } from "./search/search.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ImportsModule } from "./imports/imports.module.js";
import { UserToolsModule } from "./users/user-tools.module.js";
import { AmendmentsModule } from "./amendments/amendments.module.js";
import { SiteModule } from "./site/site.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    LegislationsModule,
    ArticlesModule,
    AnnexesModule,
    SearchModule,
    AdminModule,
    ImportsModule,
    UserToolsModule,
    AmendmentsModule,
    SiteModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
