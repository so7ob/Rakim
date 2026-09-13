import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { PermissionGuard, Permissions } from "../common/permission.guard.js";
import { AccessControlService } from "./access-control.service.js";

class RoleCreateDto {
  @IsString() @Length(3, 60) code!: string;
  @IsString() @Length(2, 200) nameAr!: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsString() @Length(3, 1000) reason!: string;
}
class RoleUpdateDto {
  @IsString() @Length(2, 200) nameAr!: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsBoolean() isActive!: boolean;
  @IsString() @Length(3, 1000) reason!: string;
}
class PermissionSelectionDto {
  @IsArray()
  @ArrayUnique((item: unknown) => JSON.stringify(item))
  selections!: Array<Record<string, unknown>>;
  @IsString() @Length(3, 1000) reason!: string;
}
class ReasonDto {
  @IsString() @Length(3, 1000) reason!: string;
}
class UserProfileDto {
  @IsString() @Length(2, 200) displayName!: string;
  @IsString() @Length(3, 1000) reason!: string;
}

@Controller("admin")
@UseGuards(SessionGuard, PermissionGuard)
export class AccessControlController {
  constructor(
    @Inject(AccessControlService)
    private readonly service: AccessControlService,
  ) {}

  @Get("permissions") @Permissions("permission.view") permissions() {
    return this.service.permissionCatalog();
  }
  @Get("access-roles") @Permissions("role.view") roles(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.roles(request.user!);
  }
  @Post("access-roles") @Permissions("role.create") createRole(
    @Body() dto: RoleCreateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.createRole(input, request.user!, reason);
  }
  @Get("access-roles/:id") @Permissions("role.view") role(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.role(id, request.user!);
  }
  @Get("access-roles/:id/permissions")
  @Permissions("permission.view")
  rolePermissionList(@Param("id") id: string) {
    return this.service.rolePermissions(id);
  }
  @Get("access-roles/:id/users")
  @Permissions("user.view")
  roleUsers(@Param("id") id: string) {
    return this.service.roleUsers(id);
  }
  @Get("access-roles/:id/audit")
  @Permissions("audit.view")
  roleAudit(@Param("id") id: string) {
    return this.service.roleAudit(id);
  }
  @Patch("access-roles/:id") @Permissions("role.update") updateRole(
    @Param("id") id: string,
    @Body() dto: RoleUpdateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const { reason, ...input } = dto;
    return this.service.updateRole(id, input, request.user!, reason);
  }
  @Patch("access-roles/:id/permissions")
  @Permissions("role.permissions.manage")
  rolePermissions(
    @Param("id") id: string,
    @Body() dto: PermissionSelectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateRolePermissions(
      id,
      dto.selections as Array<{
        code: string;
        scope?: "ALL" | "OWN" | "ASSIGNED";
      }>,
      request.user!,
      dto.reason,
    );
  }
  @Delete("access-roles/:id") @Permissions("role.delete") deleteRole(
    @Param("id") id: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.deleteRole(id, request.user!, dto.reason);
  }
  @Get("users/:id/access") @Permissions("user.view") user(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.user(id, request.user!);
  }
  @Get("users/:id/roles") @Permissions("role.view") userRoles(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.userRoles(id, request.user!);
  }
  @Get("users/:id/permissions")
  @Permissions("permission.view")
  userPermissionList(@Param("id") id: string) {
    return this.service.userPermissions(id);
  }
  @Patch("users/:id/profile") @Permissions("user.update") userProfile(
    @Param("id") id: string,
    @Body() dto: UserProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateUserProfile(
      id,
      dto.displayName,
      request.user!,
      dto.reason,
    );
  }
  @Patch("users/:id/granular-permissions")
  @Permissions("user.permissions.manage")
  userPermissions(
    @Param("id") id: string,
    @Body() dto: PermissionSelectionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateUserPermissions(
      id,
      dto.selections as Array<{
        code: string;
        effect: "ALLOW" | "DENY";
        scope?: "ALL" | "OWN" | "ASSIGNED";
      }>,
      request.user!,
      dto.reason,
    );
  }
  @Get("users/:id/activity") @Permissions("user.activity.view") activity(
    @Param("id") id: string,
    @Query("page") page?: string,
  ) {
    return this.service.activity(id, Number(page || 1));
  }
  @Get("users/:id/sessions") @Permissions("user.sessions.view") sessions(
    @Param("id") id: string,
  ) {
    return this.service.sessions(id);
  }
  @Post("users/:id/sessions/:sessionId/revoke")
  @Permissions("user.sessions.revoke")
  revokeSession(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.revokeSession(id, sessionId, request.user!, dto.reason);
  }
}
