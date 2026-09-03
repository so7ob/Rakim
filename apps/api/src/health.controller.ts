import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DataSource } from 'typeorm';
import { DATABASE } from './database/database.module.js';

@ApiTags('الصحة')
@Controller('health')
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'فحص صحة API واتصال قاعدة البيانات' })
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', database: 'ok', service: 'yemen-legislation-api', timestamp: new Date().toISOString() };
  }
}
