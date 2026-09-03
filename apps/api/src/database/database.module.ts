import { Global, Module } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { createDataSource } from './config.js';

export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [{
    provide: DATABASE,
    useFactory: async (): Promise<DataSource> => createDataSource().initialize(),
  }],
  exports: [DATABASE],
})
export class DatabaseModule {}
