import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import type { AuthenticatedRequest } from "./auth.types.js";
import { AuthService } from "./auth.service.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

function cookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(DATABASE) private readonly db: DataSource,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = cookie(request.headers.cookie, "ylp_session");
    if (!token) throw new UnauthorizedException("يلزم تسجيل الدخول للمتابعة.");
    const rows = await this.db.query(
      `SELECT s.id,s.user_id userId,s.csrf_hash csrfHash
      FROM user_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>NOW(3) AND u.is_active=1 AND u.deleted_at IS NULL LIMIT 1`,
      [digest(decodeURIComponent(token))],
    );
    const session = rows[0];
    if (!session)
      throw new UnauthorizedException("انتهت الجلسة أو لم تعد صالحة.");
    if (!safeMethods.has(request.method.toUpperCase())) {
      const presented = request.header("x-csrf-token") ?? "";
      const actual = Buffer.from(digest(presented));
      const expected = Buffer.from(String(session.csrfHash));
      if (
        !presented ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new ForbiddenException(
          "رمز حماية الطلب غير صالح. حدّث الصفحة ثم أعد المحاولة.",
        );
    }
    request.user = await this.auth.userById(String(session.userId));
    request.sessionId = String(session.id);
    await this.db.query(
      "UPDATE user_sessions SET last_seen_at=NOW(3) WHERE id=?",
      [session.id],
    );
    return true;
  }
}
