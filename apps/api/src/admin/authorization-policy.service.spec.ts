import type { DataSource, EntityManager } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types.js";
import { AuditedForbiddenException } from "../common/audited-forbidden.exception.js";
import { AuthorizationPolicyService } from "./authorization-policy.service.js";

const actor = (permissions: string[] = []): AuthUser => ({
  id: "actor-1",
  username: "actor",
  displayName: "الفاعل",
  roles: ["SYSTEM_ADMIN"],
  permissions,
});

function harness(
  managerQuery: (sql: string, parameters?: unknown[]) => unknown,
) {
  const manager = {
    query: vi.fn((sql: string, parameters?: unknown[]) =>
      Promise.resolve(managerQuery(sql, parameters)),
    ),
  } as unknown as EntityManager;
  const db = {
    manager,
  } as unknown as DataSource;
  return {
    service: new AuthorizationPolicyService(db),
    manager,
  };
}

const authorityRows = (
  sql: string,
  parameters: unknown[] | undefined,
  levels: Record<string, number>,
) => {
  if (sql.includes("MAX(r.authority_level)"))
    return [{ authorityLevel: levels[String(parameters?.[0])] ?? 0 }];
  return [];
};

describe("AuthorizationPolicyService authority ceiling", () => {
  it.each([
    ["SUPER", 1000, true],
    ["SYSTEM_ADMIN", 800, false],
  ])(
    "rejects creation with protected or higher role %s",
    async (code, level, isProtected) => {
      const { service, manager } = harness((sql, parameters) => {
        const authority = authorityRows(sql, parameters, { "actor-1": 300 });
        if (authority.length) return authority;
        if (sql.includes("FROM roles WHERE code IN"))
          return [
            {
              id: `role-${code}`,
              code,
              isSystem: true,
              isProtected,
              isActive: true,
              authorityLevel: level,
            },
          ];
        return [];
      });

      await expect(
        service.assertCanCreateWithRoles(manager, actor(), [String(code)]),
      ).rejects.toBeInstanceOf(AuditedForbiddenException);
    },
  );

  it("rejects self role assignment before evaluating requested roles", async () => {
    const { service, manager } = harness(() => []);

    await expect(
      service.assertCanChangeUserRoles(manager, actor(), "actor-1", [
        "CONTENT_MANAGER",
      ]),
    ).rejects.toBeInstanceOf(AuditedForbiddenException);
  });

  it("rejects assigning a role at the actor authority ceiling", async () => {
    const { service, manager } = harness((sql, parameters) => {
      if (sql.startsWith("SELECT id,is_active")) return [{ id: "target-1" }];
      const authority = authorityRows(sql, parameters, {
        "actor-1": 800,
        "target-1": 10,
      });
      if (authority.length) return authority;
      if (sql.includes("FROM roles WHERE code IN"))
        return [
          {
            id: "system-role",
            code: "SYSTEM_ADMIN",
            isSystem: true,
            isProtected: false,
            isActive: true,
            authorityLevel: 800,
          },
        ];
      return [];
    });

    await expect(
      service.assertCanChangeUserRoles(manager, actor(), "target-1", [
        "SYSTEM_ADMIN",
      ]),
    ).rejects.toBeInstanceOf(AuditedForbiddenException);
  });

  it("rejects role permissions outside the actor effective permissions", async () => {
    const { service, manager } = harness((sql, parameters) => {
      if (sql.includes("FROM roles WHERE id="))
        return [
          {
            id: "role-1",
            code: "CUSTOM",
            isSystem: false,
            isProtected: false,
            isActive: true,
            authorityLevel: 100,
          },
        ];
      const authority = authorityRows(sql, parameters, { "actor-1": 800 });
      if (authority.length) return authority;
      return [];
    });

    await expect(
      service.assertCanChangeRolePermissions(
        manager,
        actor(["role.permissions.manage"]),
        "role-1",
        ["legislation.publish"],
      ),
    ).rejects.toBeInstanceOf(AuditedForbiddenException);
  });

  it("rejects self direct permission escalation", async () => {
    const { service, manager } = harness(() => []);

    await expect(
      service.assertCanChangeUserPermissions(
        manager,
        actor(["user.permissions.manage"]),
        "actor-1",
        ["legislation.publish"],
      ),
    ).rejects.toBeInstanceOf(AuditedForbiddenException);
  });

  it("rejects protected role mutation even for a higher authority", async () => {
    const { service, manager } = harness((sql, parameters) => {
      if (sql.includes("FROM roles WHERE id="))
        return [
          {
            id: "super-role",
            code: "SUPER",
            isSystem: true,
            isProtected: true,
            isActive: true,
            authorityLevel: 1000,
          },
        ];
      return authorityRows(sql, parameters, { "actor-1": 1100 });
    });

    await expect(
      service.assertCanManageRole(manager, actor(), "super-role"),
    ).rejects.toBeInstanceOf(AuditedForbiddenException);
  });

  it("prevents disabling the last protected administrator", async () => {
    const { service, manager } = harness((sql, parameters) => {
      if (sql.startsWith("SELECT id,is_active")) return [{ id: "super-user" }];
      const authority = authorityRows(sql, parameters, {
        "actor-1": 1100,
        "super-user": 1000,
      });
      if (authority.length) return authority;
      if (sql.startsWith("SELECT id,code FROM roles"))
        return [{ id: "super-role", code: "SUPER" }];
      if (sql.includes("WHERE ur.user_id=? AND r.is_protected"))
        return [{ code: "SUPER" }];
      if (sql.includes("SELECT DISTINCT u.id")) return [{ id: "super-user" }];
      return [];
    });

    await expect(
      service.assertCanChangeUserState(manager, actor(), "super-user", false),
    ).rejects.toBeInstanceOf(AuditedForbiddenException);
  });
});
