import { Body, Controller, Get, Headers, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleGuard, Roles } from '../common/role.guard.js';
import { CreateLegislationDto } from './create-legislation.dto.js';
import { LegislationsService } from './legislations.service.js';

@ApiTags('التشريعات')
@Controller('legislations')
export class LegislationsController {
  constructor(@Inject(LegislationsService) private readonly service: LegislationsService) {}

  @Get() @ApiOperation({ summary: 'قائمة التشريعات المنشورة مع التصفية والترقيم' })
  list(@Query() query: Record<string, string | undefined>) { return this.service.list(query); }

  @Post() @UseGuards(RoleGuard) @Roles('DATA_ENTRY','LEGAL_REVIEWER','CONTENT_MANAGER','SYSTEM_ADMIN')
  @ApiHeader({ name: 'x-user-role', required: true }) @ApiHeader({ name: 'x-user-name', required: false })
  @ApiOperation({ summary: 'إنشاء مسودة تشريع وتسجيلها في التدقيق' })
  create(@Body() dto: CreateLegislationDto, @Headers('x-user-role') role: string, @Headers('x-user-name') username?: string) {
    return this.service.create(dto, role, username);
  }

  @Get(':id') @ApiOperation({ summary: 'بيانات تشريع منشور' })
  detail(@Param('id') id: string) { return this.service.detail(id); }

  @Get(':id/structure') @ApiOperation({ summary: 'الهيكل البنيوي للتشريع' })
  structure(@Param('id') id: string) { return this.service.structure(id); }

  @Get(':id/articles') @ApiOperation({ summary: 'مواد التشريع النافذة في تاريخ' })
  articles(@Param('id') id: string, @Query('at') at?: string) { return this.service.articles(id, at); }

  @Get(':id/modifications') @ApiOperation({ summary: 'تعديلات التشريع مجمعة حسب السنة والعملية' })
  modifications(@Param('id') id:string){return this.service.modifications(id);}

  @Get(':id/annexes') @ApiOperation({ summary: 'لوائح التشريع وجداوله وملاحقه وإصداراتها' })
  annexes(@Param('id') id:string){return this.service.annexes(id);}

  @Get(':id/relations') @ApiOperation({ summary: 'العلاقات القانونية الموجهة للتشريع' })
  relations(@Param('id') id:string){return this.service.relations(id);}
}
