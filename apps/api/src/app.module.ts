import { Module } from '@nestjs/common';
import { ArticlesModule } from './articles/articles.module.js';
import { AnnexesModule } from './annexes/annexes.module.js';
import { AdminModule } from './admin/admin.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health.controller.js';
import { LegislationsModule } from './legislations/legislations.module.js';
import { SearchModule } from './search/search.module.js';

@Module({ imports: [DatabaseModule, LegislationsModule, ArticlesModule, AnnexesModule, SearchModule, AdminModule], controllers: [HealthController] })
export class AppModule {}
