import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import type { AuthUser } from "./auth.types.js";
import { hashPassword } from "./password.js";
import { AuthorizationPolicyService } from "../admin/authorization-policy.service.js";
import { requireExactPermission } from "../admin/lifecycle.service.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const recoveryMessage =
  "إذا كان الحساب مؤهلاً فقد سُجل طلب الاستعادة. تواصل مع مسؤول النظام للتحقق من هويتك واستلام رابط الاستعادة.";
@Injectable()
export class PasswordRecoveryService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}
  private policy() {
    return new AuthorizationPolicyService(this.db);
  }
  async request(username: string) {
    await this.db.transaction(async (m) => {
      const [user] = await m.query(
        "SELECT id FROM users WHERE username=? AND is_active=TRUE AND deleted_at IS NULL FOR UPDATE",
        [username.trim()],
      );
      if (!user) return;
      await m.query(
        "UPDATE password_recovery_requests SET status='EXPIRED',token_hash=NULL WHERE user_id=? AND status='ISSUED' AND expires_at<=NOW(3)",
        [user.id],
      );
      const recent = await m.query(
        "SELECT id FROM password_recovery_requests WHERE user_id=? AND (status IN ('PENDING','ISSUED') OR created_at>DATE_SUB(NOW(3),INTERVAL 1 HOUR)) LIMIT 1",
        [user.id],
      );
      if (recent.length) return;
      const id = randomUUID();
      await m.query(
        "INSERT INTO password_recovery_requests (id,user_id) VALUES (?,?)",
        [id, user.id],
      );
      await this.audit(
        m,
        null,
        id,
        "REQUEST_PASSWORD_RECOVERY",
        "طلب استعادة وصول؛ هوية مقدم الطلب لم تتحقق بعد",
      );
    });
    return { message: recoveryMessage };
  }
  async list(actor: AuthUser) {
    requireExactPermission(actor, "user.reset_password");
    const level = await this.policy().authorityLevel(actor.id);
    return this.db.query(
      `SELECT pr.id,pr.user_id userId,u.username,u.display_name displayName,
      CASE WHEN pr.status='ISSUED' AND pr.expires_at<=NOW(3) THEN 'EXPIRED' ELSE pr.status END status,
      pr.created_at createdAt,pr.handled_at handledAt,pr.reason,handler.display_name handledBy
      FROM password_recovery_requests pr JOIN users u ON u.id=pr.user_id
      LEFT JOIN users handler ON handler.id=pr.handled_by
      WHERE u.deleted_at IS NULL AND u.id<>? AND
      COALESCE((SELECT MAX(r.authority_level) FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.is_active=TRUE),0)<?
      ORDER BY pr.created_at DESC LIMIT 200`,
      [actor.id, level],
    );
  }
  async handle(
    id: string,
    action: "issue" | "reject",
    reason: string,
    identityVerified: boolean,
    actor: AuthUser,
  ) {
    requireExactPermission(actor, "user.reset_password");
    if (reason.trim().length < 3)
      throw new BadRequestException("اكتب سبباً واضحاً لمعالجة الطلب.");
    if (action === "issue" && !identityVerified)
      throw new BadRequestException(
        "تحقق من هوية صاحب الحساب قبل إصدار الرابط.",
      );
    return this.db.transaction(async (m) => {
      // Lock the user before its request, consistently with public creation and completion.
      const [lookup] = await m.query(
        "SELECT user_id FROM password_recovery_requests WHERE id=?",
        [id],
      );
      if (!lookup) throw new NotFoundException("طلب الاستعادة غير موجود.");
      await this.policy().assertCanManageUser(m, actor, lookup.user_id);
      const [user] = await m.query(
        "SELECT password_hash,is_active,deleted_at FROM users WHERE id=? FOR UPDATE",
        [lookup.user_id],
      );
      const [request] = await m.query(
        "SELECT status FROM password_recovery_requests WHERE id=? FOR UPDATE",
        [id],
      );
      if (request.status !== "PENDING")
        throw new ConflictException("عولج الطلب بالفعل؛ حدّث القائمة.");
      if (action === "issue" && (!user.is_active || user.deleted_at))
        throw new ConflictException(
          "الحساب معطل أو محذوف؛ لا يمكن إصدار رابط له.",
        );
      const token = action === "issue" ? randomBytes(32).toString("hex") : null;
      await m.query(
        `UPDATE password_recovery_requests SET status=?,handled_by=?,handled_at=NOW(3),reason=?,token_hash=?,password_fingerprint=?,expires_at=IF(?,DATE_ADD(NOW(3),INTERVAL 15 MINUTE),NULL) WHERE id=?`,
        [
          action === "issue" ? "ISSUED" : "REJECTED",
          actor.id,
          reason.trim(),
          token ? digest(token) : null,
          token ? digest(user.password_hash) : null,
          Boolean(token),
          id,
        ],
      );
      await this.audit(
        m,
        actor.id,
        id,
        action === "issue"
          ? "ISSUE_PASSWORD_RECOVERY"
          : "REJECT_PASSWORD_RECOVERY",
        reason.trim(),
      );
      // Return once to the authorized administrator; never audit the token or URL.
      return token ? { token, expiresInMinutes: 15 } : { status: "REJECTED" };
    });
  }
  async complete(token: string, password: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new BadRequestException(
        "رابط الاستعادة غير صالح أو انتهت صلاحيته.",
      );
    if (
      password.length < 12 ||
      password.length > 200 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    )
      throw new BadRequestException(
        "استخدم كلمة مرور من 12 محرفاً على الأقل تشمل أحرفاً لاتينية وأرقاماً.",
      );
    const tokenHash = digest(token);
    const [lookup] = await this.db.query(
      "SELECT user_id FROM password_recovery_requests WHERE token_hash=? AND status='ISSUED' AND expires_at>NOW(3)",
      [tokenHash],
    );
    if (!lookup)
      throw new BadRequestException(
        "رابط الاستعادة غير صالح أو انتهت صلاحيته.",
      );
    const passwordHash = await hashPassword(password);
    await this.db.transaction(async (m) => {
      const [user] = await m.query(
        "SELECT * FROM users WHERE id=? FOR UPDATE",
        [lookup.user_id],
      );
      const [request] = await m.query(
        "SELECT * FROM password_recovery_requests WHERE token_hash=? AND status='ISSUED' AND expires_at>NOW(3) FOR UPDATE",
        [tokenHash],
      );
      if (
        !request ||
        !user?.is_active ||
        user.deleted_at ||
        request.password_fingerprint !== digest(user.password_hash)
      )
        throw new BadRequestException(
          "رابط الاستعادة غير صالح أو انتهت صلاحيته.",
        );
      await m.query(
        "UPDATE users SET password_hash=?,password_changed_at=NOW(3),failed_login_count=0,locked_until=NULL WHERE id=?",
        [passwordHash, user.id],
      );
      await m.query(
        "UPDATE user_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL",
        [user.id],
      );
      await m.query(
        "UPDATE password_recovery_requests SET status='COMPLETED',completed_at=NOW(3),token_hash=NULL,password_fingerprint=NULL WHERE id=?",
        [request.id],
      );
      await this.audit(
        m,
        user.id,
        request.id,
        "COMPLETE_PASSWORD_RECOVERY",
        "إتمام الاستعادة برابط مؤقت وإبطال الجلسات السابقة",
      );
    });
    return {
      message:
        "حُدّثت كلمة المرور وأُغلقت الجلسات السابقة. يمكنك تسجيل الدخول الآن.",
    };
  }
  private audit(
    m: EntityManager,
    actorId: string | null,
    id: string,
    action: string,
    reason: string,
  ) {
    return m.query(
      "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,reason) VALUES (?,?,?,'PASSWORD_RECOVERY',?,?)",
      [randomUUID(), actorId, action, id, reason],
    );
  }
}
