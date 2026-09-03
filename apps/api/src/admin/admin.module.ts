import { Module } from '@nestjs/common';
import { RoleGuard } from '../common/role.guard.js';
import { AdminController } from './admin.controller.js';
@Module({controllers:[AdminController],providers:[RoleGuard]}) export class AdminModule{}
