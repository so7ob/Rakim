import { BadRequestException } from "@nestjs/common";
import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types.js";
import { AccessControlService } from "./access-control.service.js";

const actor: AuthUser = {
  id: "actor-1",
  username: "admin",
  displayName: "مدير النظام",
  roles: [],
  permissions: ["permission.manage", "role.manage_permissions"],
};

describe("AccessControlService permission scopes", () => {
  it.each(["OWN", "ASSIGNED"] as const)(
    "rejects the unsupported %s role scope before touching the database",
    async (scope) => {
      const transaction = vi.fn();
      const service = new AccessControlService({
        transaction,
      } as unknown as DataSource);

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
      const service = new AccessControlService({
        transaction,
      } as unknown as DataSource);

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
