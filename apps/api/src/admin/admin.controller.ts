import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleGuard, Roles } from '../common/role.guard.js';
import { rebuildSearchIndex } from '../database/reindex.js';

@ApiTags('الإدارة')
@Controller()
export class AdminController{
  @Post('reindex') @HttpCode(200) @UseGuards(RoleGuard) @Roles('CONTENT_MANAGER','SYSTEM_ADMIN')
  @ApiHeader({name:'x-user-role',required:true}) @ApiOperation({summary:'إعادة بناء فهرس البحث المشتق كاملًا'})
  async reindex(){const count=await rebuildSearchIndex();return{status:'rebuilt',count};}
}

