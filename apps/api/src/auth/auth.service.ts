import { CRUD_PERMISSION_CATALOG } from "../common/crud-permission-catalog.js";
import {
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import type { AuthUser } from "./auth.types.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  CANONICAL_PERMISSION_CODES,
  LEGACY_PERMISSION_ALIASES,
} from "../common/canonical-permission-catalog.js";

// Session-bound token: concurrent status reads and other tabs must not invalidate forms.
const csrfForToken = (token: string) =>
  createHmac("sha256", token).update("ylp-csrf-v1").digest("base64url");

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async sessionFromToken(token: string | undefined): Promise<{
    id: string;
    userId: string;
  } | null> {
    if (!token) return null;
    const rows = (await this.db.query(
      `SELECT s.id,s.user_id userId
      FROM user_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>NOW(3)
        AND u.is_active=1 AND u.deleted_at IS NULL LIMIT 1`,
      [digest(token)],
    )) as Array<{ id: string; userId: string }>;
    return rows[0] ?? null;
  }

  async login(
    usernameRaw: string,
    password: string,
    metadata: { ip?: string; userAgent?: string },
  ) {
    const username = usernameRaw.trim().toLowerCase();
    const rows = (await this.db.query(
      `SELECT id,username,display_name displayName,password_hash passwordHash,
      is_active isActive,failed_login_count failedLoginCount,locked_until lockedUntil
      FROM users WHERE deleted_at IS NULL AND username=? LIMIT 1`,
      [username],
    )) as Array<Record<string, unknown>>;
    const account = rows[0];
    const locked =
      account?.lockedUntil &&
      new Date(String(account.lockedUntil)).getTime() > Date.now();
    const valid =
      account &&
      account.isActive &&
      !locked &&
      (await verifyPassword(password, String(account.passwordHash)));
    if (!valid) {
      if (account && !locked) {
        await this.db.query(
          `UPDATE users SET failed_login_count=failed_login_count+1,
          locked_until=IF(failed_login_count+1>=5,DATE_ADD(NOW(3),INTERVAL 15 MINUTE),locked_until) WHERE id=?`,
          [account.id],
        );
      }
      throw new UnauthorizedException(
        locked
          ? "الحساب مقفل مؤقتًا. حاول بعد 15 دقيقة."
          : "اسم المستخدم أو كلمة المرور غير صحيحة.",
      );
    }
    await this.db.query(
      "UPDATE users SET failed_login_count=0,locked_until=NULL,last_login_at=NOW(3) WHERE id=?",
      [account.id],
    );
    const token = randomBytes(32).toString("base64url");
    const csrfToken = csrfForToken(token);
    const sessionId = randomUUID();
    const hours = Math.min(
      24,
      Math.max(1, Number(process.env.SESSION_HOURS ?? 8)),
    );
    await this.db.query(
      `INSERT INTO user_sessions
      (id,user_id,token_hash,csrf_hash,expires_at,last_seen_at,ip_address,user_agent)
      VALUES (?,?,?, ?,DATE_ADD(NOW(3),INTERVAL ? HOUR),NOW(3),?,?)`,
      [
        sessionId,
        account.id,
        digest(token),
        digest(csrfToken),
        hours,
        metadata.ip?.slice(0, 64) ?? null,
        metadata.userAgent?.slice(0, 500) ?? null,
      ],
    );
    await this.audit(
      String(account.id),
      "LOGIN",
      "USER",
      String(account.id),
      "تسجيل دخول ناجح",
    );
    return { token, csrfToken, user: await this.userById(String(account.id)) };
  }

  async userById(id: string): Promise<AuthUser> {
    const users = await this.db.query(
      "SELECT id,username,display_name displayName FROM users WHERE deleted_at IS NULL AND id=? AND is_active=1",
      [id],
    );
    if (!users[0]) throw new UnauthorizedException("الحساب غير متاح.");
    const [assignments, roleGrants, directOverrides, policyOverrides] =
      await Promise.all([
        this.db.query(
          `SELECT r.code,r.name_ar nameAr,r.description_ar descriptionAr
        FROM roles r JOIN user_roles ur ON ur.role_id=r.id
        WHERE ur.user_id=? AND r.is_active=1 ORDER BY r.code`,
          [id],
        ) as Promise<Array<{ code: string; nameAr: string }>>,
        this.db.query(
          `SELECT rp.permission_code permissionCode,rp.scope_code scopeCode,
          r.code roleCode,r.name_ar roleName,r.permission_model_version modelVersion,
          pd.is_legacy isLegacy
        FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id
        JOIN roles r ON r.id=rp.role_id
        JOIN permission_definitions pd ON pd.code=rp.permission_code
        WHERE ur.user_id=? AND r.is_active=1 ORDER BY rp.permission_code,r.code`,
          [id],
        ) as Promise<
          Array<{
            permissionCode: string;
            scopeCode: "ALL" | "OWN" | "ASSIGNED";
            roleCode: string;
            roleName: string;
            modelVersion: number;
            isLegacy: boolean | number;
          }>
        >,
        this.db.query(
          `SELECT upo.permission_code permissionCode,upo.effect,upo.scope_code scopeCode,
          pd.is_legacy isLegacy
        FROM user_permission_overrides upo
        JOIN permission_definitions pd ON pd.code=upo.permission_code
        WHERE upo.user_id=? ORDER BY upo.permission_code`,
          [id],
        ) as Promise<
          Array<{
            permissionCode: string;
            effect: "ALLOW" | "DENY";
            scopeCode: "ALL" | "OWN" | "ASSIGNED";
            isLegacy: boolean | number;
          }>
        >,
        this.db.query(
          "SELECT permission_code permissionCode FROM user_permissions WHERE user_id=? ORDER BY permission_code",
          [id],
        ) as Promise<Array<{ permissionCode: string }>>,
      ]);
    const roles = assignments.map((item) => item.code);
    const effective = new Map<
      string,
      {
        code: string;
        allowed: boolean;
        scope: "ALL";
        sources: Array<{
          type: "ROLE" | "DIRECT_ALLOW";
          code: string;
          name?: string;
        }>;
        overrides: Array<{ type: "DIRECT_ALLOW" | "DIRECT_DENY" }>;
        policyChecks: Array<{ code: string; result: "PASSED" | "FAILED" }>;
      }
    >();
    for (const grant of roleGrants) {
      if (grant.scopeCode !== "ALL") continue;
      for (const code of this.canonicalTargets(
        grant.permissionCode,
        Boolean(grant.isLegacy) && Number(grant.modelVersion) < 2,
      )) {
        const existing = effective.get(code) ?? {
          code,
          allowed: true as const,
          scope: "ALL" as const,
          sources: [],
          overrides: [],
          policyChecks: [],
        };
        existing.sources.push({
          type: "ROLE",
          code: grant.roleCode,
          name: grant.roleName,
        });
        effective.set(code, existing);
      }
    }
    const denied = new Set<string>();
    for (const override of directOverrides) {
      const targets = this.canonicalTargets(
        override.permissionCode,
        Boolean(override.isLegacy),
      );
      if (override.effect === "DENY") {
        for (const code of targets) denied.add(code);
      } else if (override.scopeCode === "ALL") {
        for (const code of targets) {
          const existing = effective.get(code) ?? {
            code,
            allowed: true as const,
            scope: "ALL" as const,
            sources: [],
            overrides: [],
            policyChecks: [],
          };
          existing.sources.push({ type: "DIRECT_ALLOW", code: "DIRECT" });
          existing.overrides.push({ type: "DIRECT_ALLOW" });
          effective.set(code, existing);
        }
      }
    }
    for (const code of denied) {
      const existing = effective.get(code) ?? {
        code,
        allowed: false,
        scope: "ALL" as const,
        sources: [],
        overrides: [],
        policyChecks: [],
      };
      existing.allowed = false;
      existing.overrides = [{ type: "DIRECT_DENY" }];
      effective.set(code, existing);
    }
    return {
      ...users[0],
      roles,
      permissions: [...effective.values()]
        .filter((item) => item.allowed)
        .map((item) => item.code),
      permissionDetails: [...effective.values()],
      policyCapabilities: policyOverrides.map((item) => item.permissionCode),
    } as AuthUser;
  }

  private canonicalTargets(code: string, legacy: boolean): string[] {
    if (
      !legacy &&
      (CANONICAL_PERMISSION_CODES.has(code) ||
        CRUD_PERMISSION_CATALOG.some((item) => item.code === code))
    )
      return [code];
    return LEGACY_PERMISSION_ALIASES[code] ?? [];
  }

  async logout(sessionId: string, actorId: string): Promise<void> {
    await this.db.query(
      "UPDATE user_sessions SET revoked_at=NOW(3) WHERE id=? AND user_id=?",
      [sessionId, actorId],
    );
    await this.audit(actorId, "LOGOUT", "USER", actorId, "تسجيل خروج");
  }

  async sessionCsrf(sessionId: string, token: string): Promise<string> {
    const csrfToken = csrfForToken(token);
    await this.db.query(
      "UPDATE user_sessions SET csrf_hash=? WHERE id=? AND token_hash=? AND revoked_at IS NULL AND expires_at>NOW(3)",
      [digest(csrfToken), sessionId, digest(token)],
    );
    return csrfToken;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (
      newPassword.length < 12 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      throw new BadRequestException(
        "يجب أن تتكون كلمة المرور الجديدة من 12 محرفًا على الأقل وتضم حروفًا ورقمًا.",
      );
    }
    const rows = await this.db.query(
      "SELECT password_hash passwordHash FROM users WHERE id=?",
      [userId],
    );
    if (
      !rows[0] ||
      !(await verifyPassword(currentPassword, String(rows[0].passwordHash)))
    )
      throw new UnauthorizedException("كلمة المرور الحالية غير صحيحة.");
    await this.db.transaction(async (manager) => {
      await manager.query(
        "UPDATE users SET password_hash=?,password_changed_at=NOW(3) WHERE id=?",
        [await hashPassword(newPassword), userId],
      );
      await manager.query(
        "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=?",
        [userId],
      );
      await manager.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,reason)
        VALUES (?,?, 'PASSWORD_CHANGE','USER',?,'غيّر المستخدم كلمة مروره')`,
        [randomUUID(), userId, userId],
      );
    });
  }

  private async audit(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    reason: string,
  ) {
    await this.db.query(
      `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,reason)
      VALUES (?,?,?,?,?,?)`,
      [randomUUID(), actorId, action, entityType, entityId, reason],
    );
  }
}
