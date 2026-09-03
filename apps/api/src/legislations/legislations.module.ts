import { Module } from '@nestjs/common';
import { RoleGuard } from '../common/role.guard.js';
import { LegislationsController } from './legislations.controller.js';
import { LegislationsService } from './legislations.service.js';

@Module({ controllers: [LegislationsController], providers: [LegislationsService, RoleGuard] })
export class LegislationsModule {}
