import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { createDataSource } from "../database/config.js";
import {
  PasswordRecoveryService,
  recoveryMessage,
} from "./password-recovery.service.js";
import { AuthService } from "./auth.service.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { AuthUser } from "./auth.types.js";
describe("password recovery with verified administrator and single use token", () => {
  let db: DataSource,
    service: PasswordRecoveryService,
    auth: AuthService,
    actor: AuthUser;
  const ids: string[] = [];
  const prefix = `recovery_${randomUUID().slice(0, 8)}`;
  const user = async (role = "READER") => {
    const id = randomUUID();
    ids.push(id);
    await db.query(
      "INSERT INTO users(id,username,display_name,password_hash) VALUES (?,?,?,?)",
      [
        id,
        `${prefix}_${ids.length}`,
        "اختبار استعادة",
        await hashPassword("RecoveryOld!1234"),
      ],
    );
    await db.query(
      "INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?",
      [id, role],
    );
    return { id, username: `${prefix}_${ids.length}` };
  };
  beforeAll(async () => {
    db = await createDataSource().initialize();
    service = new PasswordRecoveryService(db);
    auth = new AuthService(db);
    actor = await auth.userById((await user("SUPER")).id);
  });
  afterAll(async () => {
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await q.query("SET @ylp_maintenance=1");
      for (const id of ids)
        await q.query(
          "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM password_recovery_requests WHERE user_id=?) OR actor_id=?",
          [id, id],
        );
      for (const id of ids)
        await q.query(
          "DELETE FROM password_recovery_requests WHERE user_id=?",
          [id],
        );
      for (const id of [...ids].reverse()) {
        await q.query("DELETE FROM user_sessions WHERE user_id=?", [id]);
        await q.query("DELETE FROM user_roles WHERE user_id=?", [id]);
        await q.query("DELETE FROM users WHERE id=?", [id]);
      }
    } finally {
      await q.query("SET @ylp_maintenance=0");
      await q.release();
      await db.destroy();
    }
  });
  it("returns the same response for unknown accounts and deduplicates simultaneous requests", async () => {
    const u = await user();
    const expected = { message: recoveryMessage };
    expect(await service.request("unknown_" + prefix)).toEqual(expected);
    expect(await service.request(u.username)).toEqual(expected);
    await Promise.all([
      service.request(u.username),
      service.request(u.username),
    ]);
    expect(
      await db.query(
        "SELECT id FROM password_recovery_requests WHERE user_id=?",
        [u.id],
      ),
    ).toHaveLength(1);
  });
  it("requires exact permission, authority and explicit identity verification", async () => {
    const u = await user();
    await service.request(u.username);
    const [r] = await db.query(
      "SELECT id FROM password_recovery_requests WHERE user_id=?",
      [u.id],
    );
    await expect(service.list({ ...actor, permissions: [] })).rejects.toThrow();
    await expect(
      service.handle(r.id, "issue", "سبب اختبار", false, actor),
    ).rejects.toThrow(/هوية/);
    await expect(
      service.handle(
        r.id,
        "issue",
        "سبب اختبار",
        true,
        await auth.userById(u.id),
      ),
    ).rejects.toThrow();
    const peer = await user("SUPER");
    await service.request(peer.username);
    const [p] = await db.query(
      "SELECT id FROM password_recovery_requests WHERE user_id=?",
      [peer.id],
    );
    await expect(
      service.handle(p.id, "issue", "سبب اختبار", true, actor),
    ).rejects.toThrow(/سلطة/);
    expect(
      (await service.list(actor)).some((x: { id: string }) => x.id === p.id),
    ).toBe(false);
  });
  it("issues only once, stores no plaintext token, completes once and revokes sessions", async () => {
    const u = await user();
    const login = await auth.login(u.username, "RecoveryOld!1234", {});
    await service.request(u.username);
    const [r] = await db.query(
      "SELECT id FROM password_recovery_requests WHERE user_id=?",
      [u.id],
    );
    const result = await service.handle(
      r.id,
      "issue",
      "تحقق مستقل من الهوية",
      true,
      actor,
    );
    const token = result.token!;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      service.handle(r.id, "issue", "طلب مكرر", true, actor),
    ).rejects.toThrow();
    const raw = await db.query(
      "SELECT * FROM password_recovery_requests WHERE id=?",
      [r.id],
    );
    expect(JSON.stringify(raw)).not.toContain(token);
    await service.complete(token, "RecoveryNew!5678");
    await expect(service.complete(token, "AnotherPass!5678")).rejects.toThrow(
      /غير صالح/,
    );
    expect(await auth.sessionFromToken(login.token)).toBeNull();
    const [saved] = await db.query(
      "SELECT password_hash FROM users WHERE id=?",
      [u.id],
    );
    expect(await verifyPassword("RecoveryNew!5678", saved.password_hash)).toBe(
      true,
    );
    const audit = JSON.stringify(
      await db.query("SELECT * FROM audit_logs WHERE entity_id=?", [r.id]),
    );
    expect(audit).not.toContain(token);
    expect(audit).not.toContain("RecoveryNew");
    expect(audit).toContain("COMPLETE_PASSWORD_RECOVERY");
  });
  it("rejects expired and rejected links and invalidates a link after another password change", async () => {
    for (const mode of ["expired", "changed", "rejected"]) {
      const u = await user();
      await service.request(u.username);
      const [r] = await db.query(
        "SELECT id FROM password_recovery_requests WHERE user_id=?",
        [u.id],
      );
      if (mode === "rejected") {
        await service.handle(
          r.id,
          "reject",
          "تعذر التحقق من الهوية",
          false,
          actor,
        );
        await expect(
          service.handle(r.id, "issue", "طلب لاحق", true, actor),
        ).rejects.toThrow();
        continue;
      }
      const { token } = await service.handle(
        r.id,
        "issue",
        "تم التحقق من الهوية",
        true,
        actor,
      );
      if (mode === "expired")
        await db.query(
          "UPDATE password_recovery_requests SET expires_at=DATE_SUB(NOW(3),INTERVAL 1 MINUTE) WHERE id=?",
          [r.id],
        );
      else
        await db.query("UPDATE users SET password_hash=? WHERE id=?", [
          await hashPassword("ChangedElsewhere!12"),
          u.id,
        ]);
      await expect(
        service.complete(token!, "RecoveryNew!5678"),
      ).rejects.toThrow(/غير صالح/);
    }
  });
});
