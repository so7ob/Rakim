import { BadRequestException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types.js";
import { AccessControlService } from "./access-control.service.js";
import type { AuthorizationPolicyService } from "./authorization-policy.service.js";

const actor: AuthUser = {
  id: "actor-1",
  username: "admin",
  displayName: "مدير النظام",
  roles: [],
  permissions: ["permission.view", "role.permissions.manage"],
};

const policy = {} as AuthorizationPolicyService;

describe("AccessControlService permission scopes", () => {
  it("projects role management from the actor authority ceiling", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: "lower-role",
        isProtected: false,
        authorityLevel: 100,
      },
      {
        id: "peer-role",
        isProtected: false,
        authorityLevel: 800,
      },
      {
        id: "protected-role",
        isProtected: true,
        authorityLevel: 10,
      },
    ]);
    const authorityLevel = vi.fn().mockResolvedValue(800);
    const service = new AccessControlService(
      { query } as unknown as DataSource,
      { authorityLevel } as unknown as AuthorizationPolicyService,
    );

    const roles = await service.roles(actor);

    expect(roles.map((role: { canManage: boolean }) => role.canManage)).toEqual([
      true,
      false,
      false,
    ]);
    expect(authorityLevel).toHaveBeenCalledWith(actor.id);
  });

  it("projects user management without exposing authority levels", async () => {
    const query = vi.fn().mockResolvedValue([
      {
        id: "user-1",
        username: "managed",
        displayName: "مستخدم",
        authorityLevel: 100,
      },
    ]);
    const service = new AccessControlService(
      { query } as unknown as DataSource,
      {
        authorityLevel: vi.fn().mockResolvedValue(800),
      } as unknown as AuthorizationPolicyService,
    );

    const user = await service.user("user-1", actor);

    expect(user).toMatchObject({ id: "user-1", canManage: true });
    expect(user).not.toHaveProperty("authorityLevel");
  });

  it.each(["OWN", "ASSIGNED"] as const)(
    "rejects the unsupported %s role scope before touching the database",
    async (scope) => {
      const transaction = vi.fn();
      const service = new AccessControlService(
        {
          transaction,
        } as unknown as DataSource,
        policy,
      );

      await expect(
        service.updateRolePermissions(
          "role-1",
          [{ code: "legislation.view", scope }],
          actor,
          "اختبار النطاق",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["OWN", "ASSIGNED"] as const)(
    "rejects the unsupported %s user scope before touching the database",
    async (scope) => {
      const transaction = vi.fn();
      const service = new AccessControlService(
        {
          transaction,
        } as unknown as DataSource,
        policy,
      );

      await expect(
        service.updateUserPermissions(
          "user-1",
          [{ code: "legislation.view", effect: "ALLOW", scope }],
          actor,
          "اختبار النطاق",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
});
