import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { DataSource } from "typeorm";
import { createDataSource } from "./config.js";

export const DATABASE = Symbol("DATABASE");

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: async (): Promise<DataSource> =>
        createDataSource().initialize(),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
