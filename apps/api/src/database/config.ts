import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { InitialSchema1700000000000 } from './migrations/1700000000000-initial-schema.js';
import { ImmutabilityHardening1700000000001 } from './migrations/1700000000001-immutability-hardening.js';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });

export const createDataSource = () => new DataSource({
  type: 'mariadb',
  host: process.env.DATABASE_HOST ?? '127.0.0.1',
  port: Number(process.env.DATABASE_PORT ?? 3306),
  username: process.env.DATABASE_USER ?? 'legislation_app',
  password: process.env.DATABASE_PASSWORD ?? '',
  database: process.env.DATABASE_NAME ?? 'yemen_legislation',
  charset: 'utf8mb4',
  timezone: 'Z',
  logging: process.env.DATABASE_LOGGING === 'true',
  migrations: [InitialSchema1700000000000, ImmutabilityHardening1700000000001],
  migrationsTableName: 'schema_migrations',
});
