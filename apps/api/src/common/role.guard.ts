import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    if ((process.env.ADMIN_AUTH_MODE ?? 'development-header') !== 'development-header') {
      throw new ForbiddenException('لم يهيأ مزود المصادقة الإداري بعد.');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const role = request.header('x-user-role');
    if (!role || !roles.includes(role)) throw new ForbiddenException('ليست لديك صلاحية تنفيذ هذه العملية.');
    return true;
  }
}
