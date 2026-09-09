import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { createDataSource } from "../database/config.js";
import { AuthService } from "./auth.service.js";
import { AccessControlService } from "../admin/access-control.service.js";
import { AuthorizationPolicyService } from "../admin/authorization-policy.service.js";

describe("SUPER inherits the active permission catalog", () => {
  let db: DataSource, auth: AuthService, access: AccessControlService;
  let superRoleId: string;
  const superUserId = randomUUID(),
    regularUserId = randomUUID();
  const futureCode = `future_${randomUUID().slice(0, 8)}.view`;
  beforeAll(async () => {
    db = await createDataSource().initialize();
    auth = new AuthService(db);
    access = new AccessControlService(db, new AuthorizationPolicyService(db));
    superRoleId = (await db.query("SELECT id FROM roles WHERE code='SUPER'"))[0]
      .id;
    for (const [id, role] of [
      [superUserId, "SUPER"],
      [regularUserId, "SYSTEM_ADMIN"],
    ]) {
      await db.query(
        "INSERT INTO users (id,username,display_name,password_hash) VALUES (?,?,?,'test-no-login')",
        [id, `perm_${id}`, "اختبار وراثة الصلاحيات"],
      );
      await db.query(
        "INSERT INTO user_roles (user_id,role_id) SELECT ?,id FROM roles WHERE code=?",
        [id, role],
      );
    }
  });
  afterAll(async () => {
    for (const id of [superUserId, regularUserId]) {
      await db.query("DELETE FROM user_permission_overrides WHERE user_id=?", [
        id,
      ]);
      await db.query("DELETE FROM user_roles WHERE user_id=?", [id]);
      await db.query("DELETE FROM users WHERE id=?", [id]);
    }
    await db.query("DELETE FROM permission_definitions WHERE code=?", [
      futureCode,
    ]);
    await db.destroy();
  });
  it("uses the same complete grants for authentication, role counts, role details and user permissions", async () => {
    const codes = (
      await db.query(
        "SELECT code FROM permission_definitions WHERE is_active=TRUE AND is_legacy=FALSE ORDER BY code",
      )
    )
      .map((r: { code: string }) => r.code)
      .sort();
    expect((await auth.userById(superUserId)).permissions.sort()).toEqual(
      codes,
    );
    expect(
      (await access.rolePermissions(superRoleId))
        .map((p: { code: string }) => p.code)
        .sort(),
    ).toEqual(codes);
    expect(
      Number(
        (await access.roles()).find((r: { id: string }) => r.id === superRoleId)
          .permissionCount,
      ),
    ).toBe(codes.length);
    expect(
      (await access.userPermissions(superUserId)).effectivePermissions
        .map((p: { code: string }) => p.code)
        .sort(),
    ).toEqual(codes);
    expect((await auth.userById(regularUserId)).permissions).not.toContain(
      "legislation.delete",
    );
  });
  it("inherits newly registered permissions without writes to role grants and drops inactive definitions immediately", async () => {
    await db.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,'CONTENT','future','view','اختبار إذن لاحق','اختبار مستقل','NORMAL',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [futureCode],
    );
    try {
      expect((await auth.userById(superUserId)).permissions).toContain(
        futureCode,
      );
      expect((await auth.userById(regularUserId)).permissions).not.toContain(
        futureCode,
      );
      expect(
        await db.query(
          "SELECT 1 FROM role_permissions WHERE permission_code=?",
          [futureCode],
        ),
      ).toEqual([]);
      expect(
        (await access.rolePermissions(superRoleId)).some(
          (p: { code: string }) => p.code === futureCode,
        ),
      ).toBe(true);
      await db.query(
        "UPDATE permission_definitions SET is_active=FALSE WHERE code=?",
        [futureCode],
      );
      expect((await auth.userById(superUserId)).permissions).not.toContain(
        futureCode,
      );
      expect(
        (await access.rolePermissions(superRoleId)).some(
          (p: { code: string }) => p.code === futureCode,
        ),
      ).toBe(false);
    } finally {
      await db.query("DELETE FROM permission_definitions WHERE code=?", [
        futureCode,
      ]);
    }
  });
  it("retains explicit user denials and requires the actual SUPER role assignment", async () => {
    await db.query(
      "INSERT INTO user_permission_overrides (user_id,permission_code,effect,scope_code,reason) VALUES (?,'legislation.delete','DENY','ALL','اختبار منع صريح')",
      [superUserId],
    );
    expect((await auth.userById(superUserId)).permissions).not.toContain(
      "legislation.delete",
    );
    await db.query("DELETE FROM user_permission_overrides WHERE user_id=?", [
      superUserId,
    ]);
    expect((await auth.userById(superUserId)).permissions).toContain(
      "legislation.delete",
    );
    await db.query("DELETE FROM user_roles WHERE user_id=?", [superUserId]);
    expect((await auth.userById(superUserId)).permissions).toEqual([]);
  });
});
