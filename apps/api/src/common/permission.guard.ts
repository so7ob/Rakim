import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "../auth/auth.types.js";

export const PERMISSIONS_KEY = "permissions";
export const Permissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !request.user ||
      !required.some((permission) =>
        request.user!.permissions.includes(permission),
      )
    )
      throw new ForbiddenException(
        "ليست لديك الصلاحية الدقيقة المطلوبة لتنفيذ هذه العملية.",
      );
    return true;
  }
}
