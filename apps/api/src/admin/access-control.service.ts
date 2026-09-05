import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { DATABASE } from "../database/database.module.js";
import { PERMISSION_CATALOG } from "../common/permission-catalog.js";
import { WORKFLOW_POLICIES } from "./workflow-policies.js";

type Scope = "ALL" | "OWN" | "ASSIGNED";
type Effect = "ALLOW" | "DENY";

@Injectable()
export class AccessControlService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async permissionCatalog() {
    const [permissions, roles] = await Promise.all([
      this.db.query(`SELECT code,domain_code domain,resource_code resource,
        action_code action,label_ar labelAr,description_ar descriptionAr,
        sensitivity,supported_scopes_json supportedScopes,is_active isActive
        FROM permission_definitions ORDER BY domain_code,resource_code,action_code`),
      this.db
        .query(`SELECT r.id,r.code,r.name_ar nameAr,r.description_ar descriptionAr,
        r.is_system isSystem,r.is_active isActive,COUNT(DISTINCT ur.user_id) userCount,
        COUNT(DISTINCT rp.permission_code) permissionCount,r.updated_at updatedAt
        FROM roles r LEFT JOIN user_roles ur ON ur.role_id=r.id
        LEFT JOIN role_permissions rp ON rp.role_id=r.id
        GROUP BY r.id ORDER BY r.is_system DESC,r.name_ar`),
    ]);
    return {
      permissions: permissions.map((item: Record<string, unknown>) => ({
        ...item,
        supportedScopes: this.jsonArray(item.supportedScopes),
      })),
      roles,
    };
  }

  async roles() {
    return this.db
      .query(`SELECT r.id,r.code,r.name_ar nameAr,r.description_ar descriptionAr,
      r.is_system isSystem,r.is_active isActive,COUNT(DISTINCT ur.user_id) userCount,
      COUNT(DISTINCT rp.permission_code) permissionCount,r.updated_at updatedAt
      FROM roles r LEFT JOIN user_roles ur ON ur.role_id=r.id
      LEFT JOIN role_permissions rp ON rp.role_id=r.id
      GROUP BY r.id ORDER BY r.is_system DESC,r.name_ar`);
  }

  async role(id: string) {
    const roles = await this.db.query(
      `SELECT id,code,name_ar nameAr,description_ar descriptionAr,is_system isSystem,
      is_active isActive,updated_at updatedAt FROM roles WHERE id=?`,
      [id],
    );
    if (!roles[0]) throw new NotFoundException("الدور غير موجود.");
    const [permissions, users, audit] = await Promise.all([
      this.db.query(
        `SELECT pd.code,pd.domain_code domain,pd.resource_code resource,
        pd.action_code action,pd.label_ar labelAr,pd.description_ar descriptionAr,
        pd.sensitivity,rp.scope_code scope
        FROM role_permissions rp JOIN permission_definitions pd ON pd.code=rp.permission_code
        WHERE rp.role_id=? ORDER BY pd.domain_code,pd.resource_code,pd.action_code`,
        [id],
      ),
      this.db.query(
        `SELECT u.id,u.username,u.display_name displayName,u.is_active isActive,
        ur.assigned_at assignedAt,assigner.display_name assignedBy
        FROM user_roles ur JOIN users u ON u.id=ur.user_id
        LEFT JOIN users assigner ON assigner.id=ur.assigned_by
        WHERE ur.role_id=? ORDER BY u.display_name`,
        [id],
      ),
      this.db.query(
        `SELECT al.id,al.action,al.reason,al.before_json beforeValue,
        al.after_json afterValue,al.occurred_at occurredAt,u.display_name actorName
        FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_id
        WHERE al.entity_type='ROLE' AND al.entity_id=?
        ORDER BY al.occurred_at DESC LIMIT 50`,
        [id],
      ),
    ]);
    return { ...roles[0], permissions, users, audit };
  }

  async createRole(
    input: { code: string; nameAr: string; descriptionAr?: string },
    actor: AuthUser,
    reason: string,
  ) {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{2,59}$/.test(code))
      throw new BadRequestException("رمز الدور غير صالح.");
    const id = randomUUID();
    try {
      await this.db.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO roles
          (id,code,name_ar,description_ar,permissions_json,is_system,is_active)
          VALUES (?,?,?,?,JSON_ARRAY(),FALSE,TRUE)`,
          [id, code, input.nameAr.trim(), input.descriptionAr?.trim() || null],
        );
        await this.audit(
          manager,
          actor,
          "CREATE_ROLE",
          "ROLE",
          id,
          null,
          input,
          reason,
        );
      });
    } catch (error) {
      if (String(error).includes("Duplicate entry"))
        throw new ConflictException("رمز الدور مستخدم بالفعل.");
      throw error;
    }
    return this.role(id);
  }

  async updateRole(
    id: string,
    input: { nameAr: string; descriptionAr?: string; isActive: boolean },
    actor: AuthUser,
    reason: string,
  ) {
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM roles WHERE id=? FOR UPDATE",
        [id],
      );
      const role = rows[0];
      if (!role) throw new NotFoundException("الدور غير موجود.");
      if (role.is_system && !input.isActive)
        throw new ConflictException("لا يمكن تعطيل دور نظامي.");
      await manager.query(
        "UPDATE roles SET name_ar=?,description_ar=?,is_active=? WHERE id=?",
        [
          input.nameAr.trim(),
          input.descriptionAr?.trim() || null,
          input.isActive,
          id,
        ],
      );
      await this.audit(
        manager,
        actor,
        "UPDATE_ROLE",
        "ROLE",
        id,
        role,
        input,
        reason,
      );
      await this.revokeRoleSessions(manager, id);
    });
    return this.role(id);
  }

  async updateRolePermissions(
    id: string,
    grants: Array<{ code: string; scope?: Scope }>,
    actor: AuthUser,
    reason: string,
  ) {
    const normalized = this.normalizeGrants(grants);
    await this.db.transaction(async (manager) => {
      const roles = await manager.query(
        "SELECT id,code,is_system isSystem FROM roles WHERE id=? FOR UPDATE",
        [id],
      );
      if (!roles[0]) throw new NotFoundException("الدور غير موجود.");
      if (
        roles[0].code === "SYSTEM_ADMIN" &&
        [
          "permission.manage",
          "role.manage_permissions",
          "user.manage_roles",
        ].some((code) => !normalized.some((item) => item.code === code))
      )
        throw new ConflictException(
          "يجب أن يحتفظ دور مدير النظام بصلاحيات إدارة الوصول الحرجة.",
        );
      await this.assertKnownPermissions(
        manager,
        normalized.map((item) => item.code),
      );
      const before = await manager.query(
        "SELECT permission_code code,scope_code scope FROM role_permissions WHERE role_id=? ORDER BY permission_code",
        [id],
      );
      await manager.query("DELETE FROM role_permissions WHERE role_id=?", [id]);
      for (const grant of normalized)
        await manager.query(
          `INSERT INTO role_permissions (role_id,permission_code,scope_code,granted_by)
          VALUES (?,?,?,?)`,
          [id, grant.code, grant.scope, actor.id],
        );
      await manager.query("UPDATE roles SET permissions_json=? WHERE id=?", [
        JSON.stringify(normalized.map((item) => item.code)),
        id,
      ]);
      await this.audit(
        manager,
        actor,
        "UPDATE_ROLE_PERMISSIONS",
        "ROLE",
        id,
        before,
        normalized,
        reason,
      );
      await this.revokeRoleSessions(manager, id);
    });
    return this.role(id);
  }

  async deleteRole(id: string, actor: AuthUser, reason: string) {
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT r.*,COUNT(ur.user_id) userCount FROM roles r
        LEFT JOIN user_roles ur ON ur.role_id=r.id WHERE r.id=? GROUP BY r.id FOR UPDATE`,
        [id],
      );
      const role = rows[0];
      if (!role) throw new NotFoundException("الدور غير موجود.");
      if (role.is_system) throw new ConflictException("لا يمكن حذف دور نظامي.");
      if (Number(role.userCount))
        throw new ConflictException("أزل الدور من المستخدمين قبل حذفه.");
      await this.audit(
        manager,
        actor,
        "DELETE_ROLE",
        "ROLE",
        id,
        role,
        null,
        reason,
      );
      await manager.query("DELETE FROM roles WHERE id=?", [id]);
    });
    return { id, deleted: true };
  }

  async user(id: string) {
    const users = await this.db.query(
      `SELECT id,username,display_name displayName,is_active isActive,
      created_at createdAt,last_login_at lastLoginAt,failed_login_count failedLoginCount
      FROM users WHERE id=?`,
      [id],
    );
    if (!users[0]) throw new NotFoundException("المستخدم غير موجود.");
    const [roles, overrides, roleGrants, policies, sessions, activity] =
      await Promise.all([
        this.db.query(
          `SELECT r.id,r.code,r.name_ar nameAr,r.description_ar descriptionAr,
        r.is_system isSystem,r.is_active isActive,ur.assigned_at assignedAt,
        assigner.display_name assignedBy
        FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        LEFT JOIN users assigner ON assigner.id=ur.assigned_by
        WHERE ur.user_id=? ORDER BY r.name_ar`,
          [id],
        ),
        this.db.query(
          `SELECT upo.permission_code code,upo.effect,upo.scope_code scope,
        upo.reason,upo.granted_at grantedAt,g.display_name grantedBy
        FROM user_permission_overrides upo LEFT JOIN users g ON g.id=upo.granted_by
        WHERE upo.user_id=? ORDER BY upo.permission_code`,
          [id],
        ),
        this.db.query(
          `SELECT rp.permission_code code,rp.scope_code scope,r.code roleCode,r.name_ar roleName
        FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id
        JOIN roles r ON r.id=rp.role_id
        WHERE ur.user_id=? AND r.is_active=1 ORDER BY rp.permission_code,r.code`,
          [id],
        ),
        this.db.query(
          "SELECT permission_code code,grant_reason reason,granted_at grantedAt FROM user_permissions WHERE user_id=? ORDER BY permission_code",
          [id],
        ),
        this.sessions(id),
        this.activity(id, 1, 10),
      ]);
    const effective = this.effectivePermissions(roleGrants, overrides);
    return {
      ...users[0],
      roles,
      directOverrides: overrides,
      effectivePermissions: effective,
      policyOverrides: WORKFLOW_POLICIES.filter((policy) =>
        policies.some(
          (item: Record<string, unknown>) =>
            item.code === policy.permissionCode,
        ),
      ).map((policy) => ({ code: policy.code, labelAr: policy.labelAr })),
      sessionSummary: {
        total: sessions.length,
        active: sessions.filter(
          (item: Record<string, unknown>) => !item.revokedAt && !item.expired,
        ).length,
      },
      recentActivity: activity.items,
    };
  }

  async updateUserPermissions(
    userId: string,
    overrides: Array<{ code: string; effect: Effect; scope?: Scope }>,
    actor: AuthUser,
    reason: string,
  ) {
    const normalized = this.normalizeOverrides(overrides);
    if (
      userId === actor.id &&
      normalized.some(
        (item) =>
          item.effect === "DENY" &&
          [
            "user.manage_permissions",
            "role.manage_permissions",
            "permission.manage",
          ].includes(item.code),
      )
    )
      throw new ConflictException(
        "لا يمكنك رفض صلاحيات إدارة الوصول لحسابك الحالي.",
      );
    await this.db.transaction(async (manager) => {
      const users = await manager.query(
        "SELECT id FROM users WHERE id=? FOR UPDATE",
        [userId],
      );
      if (!users[0]) throw new NotFoundException("المستخدم غير موجود.");
      await this.assertKnownPermissions(
        manager,
        normalized.map((item) => item.code),
      );
      const targetRoles = await manager.query(
        `SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id
        WHERE ur.user_id=?`,
        [userId],
      );
      if (
        targetRoles.some(
          (item: { code: string }) => item.code === "SYSTEM_ADMIN",
        ) &&
        normalized.some(
          (item) =>
            item.effect === "DENY" &&
            [
              "permission.manage",
              "role.manage_permissions",
              "user.manage_roles",
            ].includes(item.code),
        )
      ) {
        const admins = await manager.query(
          `SELECT COUNT(DISTINCT u.id) total FROM users u
          JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
          WHERE u.is_active=1 AND r.code='SYSTEM_ADMIN'`,
        );
        if (Number(admins[0]?.total) <= 1)
          throw new ConflictException(
            "لا يمكن رفض صلاحيات إدارة الوصول لآخر مدير نظام نشط.",
          );
      }
      const before = await manager.query(
        "SELECT permission_code code,effect,scope_code scope FROM user_permission_overrides WHERE user_id=? ORDER BY permission_code",
        [userId],
      );
      await manager.query(
        "DELETE FROM user_permission_overrides WHERE user_id=?",
        [userId],
      );
      for (const item of normalized)
        await manager.query(
          `INSERT INTO user_permission_overrides
          (user_id,permission_code,effect,scope_code,granted_by,reason)
          VALUES (?,?,?,?,?,?)`,
          [userId, item.code, item.effect, item.scope, actor.id, reason.trim()],
        );
      await manager.query(
        "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL",
        [userId],
      );
      await this.audit(
        manager,
        actor,
        "UPDATE_USER_PERMISSIONS",
        "USER",
        userId,
        before,
        normalized,
        reason,
      );
    });
    return this.user(userId);
  }

  async updateUserProfile(
    userId: string,
    displayName: string,
    actor: AuthUser,
    reason: string,
  ) {
    return this.db.transaction(async (manager) => {
      const users = await manager.query(
        "SELECT id,username,display_name displayName FROM users WHERE id=? FOR UPDATE",
        [userId],
      );
      if (!users[0]) throw new NotFoundException("المستخدم غير موجود.");
      await manager.query("UPDATE users SET display_name=? WHERE id=?", [
        displayName.trim(),
        userId,
      ]);
      await this.audit(
        manager,
        actor,
        "UPDATE_USER_PROFILE",
        "USER",
        userId,
        users[0],
        { displayName: displayName.trim() },
        reason,
      );
      return { userId, displayName: displayName.trim() };
    });
  }

  async sessions(userId: string) {
    return this.db.query(
      `SELECT id,created_at createdAt,last_seen_at lastSeenAt,expires_at expiresAt,
      revoked_at revokedAt,(expires_at<=NOW(3)) expired
      FROM user_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    actor: AuthUser,
    reason: string,
  ) {
    await this.db.transaction(async (manager) => {
      const sessions = await manager.query(
        "SELECT id,revoked_at revokedAt FROM user_sessions WHERE id=? AND user_id=? FOR UPDATE",
        [sessionId, userId],
      );
      if (!sessions[0]) throw new NotFoundException("الجلسة غير موجودة.");
      await manager.query(
        "UPDATE user_sessions SET revoked_at=NOW(3) WHERE id=?",
        [sessionId],
      );
      await this.audit(
        manager,
        actor,
        "REVOKE_USER_SESSION",
        "USER",
        userId,
        sessions[0],
        { sessionId, revoked: true },
        reason,
      );
    });
    return { sessionId, revoked: true };
  }

  async activity(userId: string, page = 1, pageSize = 25) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const total = await this.db.query(
      "SELECT COUNT(*) total FROM audit_logs WHERE actor_id=? OR (entity_type='USER' AND entity_id=?)",
      [userId, userId],
    );
    const items = await this.db.query(
      `SELECT id,action,entity_type entityType,entity_id entityId,reason,
      occurred_at occurredAt,before_json beforeValue,after_json afterValue
      FROM audit_logs WHERE actor_id=? OR (entity_type='USER' AND entity_id=?)
      ORDER BY occurred_at DESC LIMIT ? OFFSET ?`,
      [userId, userId, safeSize, (safePage - 1) * safeSize],
    );
    return {
      items,
      meta: {
        page: safePage,
        pageSize: safeSize,
        total: Number(total[0]?.total ?? 0),
      },
    };
  }

  private effectivePermissions(roleGrants: any[], overrides: any[]) {
    const map = new Map<string, any>();
    for (const grant of roleGrants) {
      const item = map.get(grant.code) ?? {
        code: grant.code,
        allowed: true,
        scope: grant.scope,
        source: "ROLE",
        roles: [],
      };
      item.roles.push({ code: grant.roleCode, nameAr: grant.roleName });
      map.set(grant.code, item);
    }
    for (const override of overrides)
      map.set(override.code, {
        code: override.code,
        allowed: override.effect === "ALLOW",
        scope: override.scope,
        source: override.effect === "ALLOW" ? "DIRECT_ALLOW" : "DIRECT_DENY",
        roles: map.get(override.code)?.roles ?? [],
      });
    return PERMISSION_CATALOG.map((definition) => ({
      ...definition,
      ...(map.get(definition.code) ?? {
        allowed: false,
        scope: null,
        source: "NONE",
        roles: [],
      }),
    }));
  }

  private normalizeGrants(grants: Array<{ code: string; scope?: Scope }>) {
    const normalized = grants.map((item) => ({
      code: String(item.code),
      scope: this.scope(item.scope),
    }));
    if (new Set(normalized.map((item) => item.code)).size !== normalized.length)
      throw new BadRequestException("لا يجوز تكرار الصلاحية.");
    return normalized;
  }

  private normalizeOverrides(
    overrides: Array<{ code: string; effect: Effect; scope?: Scope }>,
  ) {
    if (!Array.isArray(overrides))
      throw new BadRequestException("قائمة الصلاحيات غير صالحة.");
    const normalized = overrides.map((item) => ({
      code: String(item.code),
      effect:
        item.effect === "ALLOW" || item.effect === "DENY" ? item.effect : null,
      scope: this.scope(item.scope),
    }));
    if (normalized.some((item) => !item.effect))
      throw new BadRequestException("نوع منح الصلاحية غير صالح.");
    if (new Set(normalized.map((item) => item.code)).size !== normalized.length)
      throw new BadRequestException("لا يجوز تكرار الصلاحية.");
    return normalized as Array<{ code: string; effect: Effect; scope: Scope }>;
  }

  private scope(value?: Scope): Scope {
    if (value === undefined || value === "ALL") return "ALL";
    throw new BadRequestException(
      "نطاقات OWN وASSIGNED غير مفعلة بعد؛ النطاق المدعوم حاليًا هو ALL فقط.",
    );
  }

  private async assertKnownPermissions(
    manager: EntityManager,
    codes: string[],
  ) {
    if (!codes.length) return;
    const rows = await manager.query(
      `SELECT code FROM permission_definitions WHERE is_active=1 AND code IN (${codes.map(() => "?").join(",")})`,
      codes,
    );
    if (rows.length !== codes.length)
      throw new BadRequestException(
        "تتضمن القائمة صلاحية غير معروفة أو معطلة.",
      );
  }

  private async revokeRoleSessions(manager: EntityManager, roleId: string) {
    await manager.query(
      `UPDATE user_sessions SET revoked_at=NOW(3)
      WHERE revoked_at IS NULL AND user_id IN (SELECT user_id FROM user_roles WHERE role_id=?)`,
      [roleId],
    );
  }

  private async audit(
    manager: EntityManager,
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    reason: string,
  ) {
    if (!reason?.trim()) throw new BadRequestException("سبب الإجراء إلزامي.");
    await manager.query(
      `INSERT INTO audit_logs
      (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason)
      VALUES (?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        actor.id,
        action,
        entityType,
        entityId,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        reason.trim(),
      ],
    );
  }

  private jsonArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String);
    try {
      return JSON.parse(String(value)) as string[];
    } catch {
      return ["ALL"];
    }
  }
}
