import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service.js";

describe("AuthService effective permissions", () => {
  it("applies a direct DENY after role and direct ALLOW grants", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "user-1", username: "user", displayName: "مستخدم" },
      ])
      .mockResolvedValueOnce([
        { code: "CONTENT_MANAGER", nameAr: "مدير المحتوى" },
      ])
      .mockResolvedValueOnce([
        {
          permissionCode: "legislation.publish",
          scopeCode: "ALL",
          roleCode: "CONTENT_MANAGER",
          roleName: "مدير المحتوى",
          modelVersion: 2,
          isLegacy: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          permissionCode: "legislation.publish",
          effect: "DENY",
          scopeCode: "ALL",
          isLegacy: false,
        },
      ])
      .mockResolvedValueOnce([]);
    const service = new AuthService({ query } as unknown as DataSource);

    const user = await service.userById("user-1");

    expect(user.permissions).not.toContain("legislation.publish");
    expect(user.permissionDetails).toContainEqual(
      expect.objectContaining({
        code: "legislation.publish",
        allowed: false,
        sources: [
          expect.objectContaining({
            type: "ROLE",
            code: "CONTENT_MANAGER",
          }),
        ],
        overrides: [{ type: "DIRECT_DENY" }],
      }),
    );
  });

  it("keeps policy exceptions in a separate capability namespace", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "user-1", username: "user", displayName: "مستخدم" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          permissionCode: "workflow.legislation.self_publication.override",
        },
      ]);
    const service = new AuthService({ query } as unknown as DataSource);

    const user = await service.userById("user-1");

    expect(user.permissions).toEqual([]);
    expect(user.policyCapabilities).toEqual([
      "workflow.legislation.self_publication.override",
    ]);
  });
});
