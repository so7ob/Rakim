import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { DataSource, EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { AuditedForbiddenException } from "../common/audited-forbidden.exception.js";
import { DATABASE } from "../database/database.module.js";

interface RoleAuthority {
  id: string;
  code: string;
  isSystem: boolean | number;
  isProtected: boolean | number;
  isActive: boolean | number;
  authorityLevel: number;
}

@Injectable()
export class AuthorizationPolicyService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async assignableRoles(actor: AuthUser) {
    const level = await this.actorAuthority(this.db.manager, actor.id);
    return this.db.query(
      `SELECT id,code,name_ar nameAr,description_ar descriptionAr,
       is_system isSystem,is_protected isProtected,is_active isActive,
       authority_level authorityLevel
       FROM roles WHERE is_active=TRUE AND is_protected=FALSE AND authority_level<?
       ORDER BY authority_level,code`,
      [level],
    );
  }

  async assertCanCreateWithRoles(
    manager: EntityManager,
    actor: AuthUser,
    requestedRoleCodes: string[],
  ) {
    await this.assertRequestedRolesAssignable(
      manager,
      actor,
      requestedRoleCodes,
    );
  }

  async assertCanChangeUserRoles(
    manager: EntityManager,
    actor: AuthUser,
    targetUserId: string,
    requestedRoleCodes: string[],
  ) {
    await this.assertCanManageUser(manager, actor, targetUserId);
    await this.assertRequestedRolesAssignable(
      manager,
      actor,
      requestedRoleCodes,
    );
    await this.assertProtectedAdministratorRemains(
      manager,
      actor,
      targetUserId,
      requestedRoleCodes,
      true,
    );
  }

  async assertCanManageUser(
    manager: EntityManager,
    actor: AuthUser,
    targetUserId: string,
  ) {
    if (actor.id === targetUserId)
      await this.deny(
        actor,
        "DENY_SELF_ACCESS_CHANGE",
        "USER",
        targetUserId,
        "لا يمكن تعديل صلاحيات أو أدوار الحساب الحالي.",
      );
    const targetRows = await manager.query(
      "SELECT id,is_active isActive FROM users WHERE id=? FOR UPDATE",
      [targetUserId],
    );
    if (!targetRows[0]) throw new NotFoundException("المستخدم غير موجود.");
    const actorLevel = await this.actorAuthority(manager, actor.id);
    const targetLevel = await this.userAuthority(manager, targetUserId);
    if (actorLevel <= targetLevel)
      await this.deny(
        actor,
        "DENY_HIGHER_AUTHORITY_USER_CHANGE",
        "USER",
        targetUserId,
        "لا يمكن إدارة مستخدم ذي مستوى سلطة مساوٍ أو أعلى.",
      );
  }

  async assertCanChangeUserState(
    manager: EntityManager,
    actor: AuthUser,
    targetUserId: string,
    active: boolean,
  ) {
    await this.assertCanManageUser(manager, actor, targetUserId);
    if (!active)
      await this.assertProtectedAdministratorRemains(
        manager,
        actor,
        targetUserId,
        [],
        false,
      );
  }

  async assertCanManageRole(
    manager: EntityManager,
    actor: AuthUser,
    roleId: string,
  ): Promise<RoleAuthority> {
    const role = await this.roleAuthority(manager, roleId, true);
    const actorLevel = await this.actorAuthority(manager, actor.id);
    if (Boolean(role.isProtected) || actorLevel <= Number(role.authorityLevel))
      await this.deny(
        actor,
        "DENY_PROTECTED_ROLE_CHANGE",
        "ROLE",
        roleId,
        "لا يمكن إدارة دور محمي أو ذي مستوى سلطة مساوٍ أو أعلى.",
      );
    return role;
  }

  async assertCanChangeRolePermissions(
    manager: EntityManager,
    actor: AuthUser,
    roleId: string,
    requestedCodes: string[],
  ) {
    await this.assertCanManageRole(manager, actor, roleId);
    const current = (await manager.query(
      `SELECT rp.permission_code code FROM role_permissions rp
       JOIN permission_definitions pd ON pd.code=rp.permission_code
       WHERE rp.role_id=? AND pd.is_legacy=FALSE`,
      [roleId],
    )) as Array<{ code: string }>;
    await this.assertGrantablePermissions(
      actor,
      [...requestedCodes, ...current.map((item) => item.code)],
      "ROLE",
      roleId,
    );
  }

  async assertCanChangeUserPermissions(
    manager: EntityManager,
    actor: AuthUser,
    targetUserId: string,
    requestedCodes: string[],
  ) {
    await this.assertCanManageUser(manager, actor, targetUserId);
    await this.assertGrantablePermissions(
      actor,
      requestedCodes,
      "USER",
      targetUserId,
    );
  }

  private async assertGrantablePermissions(
    actor: AuthUser,
    codes: string[],
    entityType: string,
    entityId: string,
  ) {
    const grantable = new Set(actor.permissions);
    const forbidden = [...new Set(codes)].filter(
      (code) => !grantable.has(code),
    );
    if (forbidden.length)
      await this.deny(
        actor,
        "DENY_PERMISSION_CEILING_BYPASS",
        entityType,
        entityId,
        "لا يمكن منح أو إدارة صلاحية خارج السقف الفعلي للفاعل.",
      );
  }

  async customRoleAuthority(actor: AuthUser): Promise<number> {
    const level = await this.actorAuthority(this.db.manager, actor.id);
    return Math.max(10, Math.min(100, level - 1));
  }

  authorityLevel(userId: string): Promise<number> {
    return this.actorAuthority(this.db.manager, userId);
  }

  private async assertRequestedRolesAssignable(
    manager: EntityManager,
    actor: AuthUser,
    roleCodes: string[],
  ) {
    if (!roleCodes.length) return;
    const actorLevel = await this.actorAuthority(manager, actor.id);
    const rows = (await manager.query(
      `SELECT id,code,is_system isSystem,is_protected isProtected,
       is_active isActive,authority_level authorityLevel
       FROM roles WHERE code IN (${roleCodes.map(() => "?").join(",")})
       FOR UPDATE`,
      roleCodes,
    )) as RoleAuthority[];
    if (rows.length !== new Set(roleCodes).size)
      throw new NotFoundException("يتضمن الطلب دورًا غير معروف.");
    if (
      rows.some(
        (role) =>
          !Boolean(role.isActive) ||
          Boolean(role.isProtected) ||
          Number(role.authorityLevel) >= actorLevel,
      )
    )
      await this.deny(
        actor,
        "DENY_ROLE_AUTHORITY_CEILING_BYPASS",
        "ROLE_SET",
        roleCodes.sort().join(",").slice(0, 36) || "EMPTY",
        "يتضمن الطلب دورًا غير قابل للإسناد ضمن سقف الفاعل.",
      );
  }

  private async assertProtectedAdministratorRemains(
    manager: EntityManager,
    actor: AuthUser,
    targetUserId: string,
    requestedRoleCodes: string[],
    changingRoles: boolean,
  ) {
    const protectedRoles = (await manager.query(
      "SELECT id,code FROM roles WHERE is_protected=TRUE FOR UPDATE",
    )) as Array<{ id: string; code: string }>;
    if (!protectedRoles.length) return;
    const targetProtected = await manager.query(
      `SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
       WHERE ur.user_id=? AND r.is_protected=TRUE FOR UPDATE`,
      [targetUserId],
    );
    if (!targetProtected.length) return;
    if (
      changingRoles &&
      targetProtected.every((item: { code: string }) =>
        requestedRoleCodes.includes(item.code),
      )
    )
      return;
    const protectedUsers = await manager.query(
      `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
       WHERE u.is_active=TRUE AND r.is_protected=TRUE FOR UPDATE`,
    );
    if (protectedUsers.length <= 1)
      await this.deny(
        actor,
        "DENY_LAST_PROTECTED_ADMIN_REMOVAL",
        "USER",
        targetUserId,
        "لا يمكن إزالة أو تعطيل آخر مدير محمي ذي سلطة عليا.",
      );
  }

  private async deny(
    actor: Pick<AuthUser, "id">,
    action: string,
    entityType: string,
    entityId: string,
    reason: string,
  ): Promise<never> {
    throw new AuditedForbiddenException({
      actorId: actor.id,
      action,
      entityType,
      entityId,
      reason,
    });
  }

  private async actorAuthority(
    manager: EntityManager,
    actorId: string,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT COALESCE(MAX(r.authority_level),0) authorityLevel
       FROM user_roles ur JOIN roles r ON r.id=ur.role_id
       WHERE ur.user_id=? AND r.is_active=TRUE`,
      [actorId],
    );
    return Number(rows[0]?.authorityLevel ?? 0);
  }

  private async userAuthority(
    manager: EntityManager,
    userId: string,
  ): Promise<number> {
    const rows = await manager.query(
      `SELECT COALESCE(MAX(r.authority_level),0) authorityLevel
       FROM user_roles ur JOIN roles r ON r.id=ur.role_id
       WHERE ur.user_id=? AND r.is_active=TRUE`,
      [userId],
    );
    return Number(rows[0]?.authorityLevel ?? 0);
  }

  private async roleAuthority(
    manager: EntityManager,
    roleId: string,
    lock: boolean,
  ): Promise<RoleAuthority> {
    const rows = (await manager.query(
      `SELECT id,code,is_system isSystem,is_protected isProtected,
       is_active isActive,authority_level authorityLevel
       FROM roles WHERE id=?${lock ? " FOR UPDATE" : ""}`,
      [roleId],
    )) as RoleAuthority[];
    if (!rows[0]) throw new NotFoundException("الدور غير موجود.");
    return rows[0];
  }
}
