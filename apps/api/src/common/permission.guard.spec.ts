import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";
import { PermissionGuard } from "./permission.guard.js";

function context(permissions: string[]): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ user: { permissions } }),
    }),
  } as unknown as ExecutionContext;
}

describe("PermissionGuard", () => {
  it("allows endpoints without a granular requirement", () => {
    const reflector = { getAllAndOverride: vi.fn(() => undefined) };
    expect(
      new PermissionGuard(reflector as unknown as Reflector).canActivate(
        context([]),
      ),
    ).toBe(true);
  });

  it("allows a matching effective permission", () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => ["legislation.view"]),
    };
    expect(
      new PermissionGuard(reflector as unknown as Reflector).canActivate(
        context(["legislation.view"]),
      ),
    ).toBe(true);
  });

  it("rejects a request even if the frontend attempted it directly", () => {
    const reflector = {
      getAllAndOverride: vi.fn(() => ["legislation.publish"]),
    };
    expect(() =>
      new PermissionGuard(reflector as unknown as Reflector).canActivate(
        context(["legislation.view"]),
      ),
    ).toThrow(ForbiddenException);
  });
});
