import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SEARCH_PROVIDER, type SearchProvider } from './search.provider.js';

@ApiTags('البحث')
@Controller('search')
export class SearchController {
  constructor(@Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider) {}

  @Get() @ApiOperation({ summary: 'بحث عربي على مستوى التشريع والمادة' })
  search(@Query('q') q?: string, @Query('page') pageRaw?: string, @Query('pageSize') sizeRaw?: string,
         @Query('at') at?: string, @Query('historical') historical?: string) {
    if (!q?.trim()) throw new BadRequestException('أدخل عبارة بحث واحدة على الأقل.');
    const page = Math.max(1, Number(pageRaw ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(sizeRaw ?? 10) || 10));
    if (at && !/^\d{4}-\d{2}-\d{2}$/.test(at)) throw new BadRequestException('صيغة التاريخ المطلوبة YYYY-MM-DD.');
    return this.provider.search({ q: q.trim(), page, pageSize, at, historical: historical === 'true' });
  }
}
