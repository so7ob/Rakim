import { describe, expect, it } from "vitest";
import {
  CANONICAL_PERMISSION_CATALOG,
  CANONICAL_ROLE_PERMISSION_MAP,
} from "./canonical-permission-catalog.js";

describe("canonical permission catalog", () => {
  it("contains exactly 75 unique RBAC permissions", () => {
    const codes = CANONICAL_PERMISSION_CATALOG.map((item) => item.code);
    expect(codes).toHaveLength(75);
    expect(new Set(codes).size).toBe(75);
    expect(codes.every((code) => code.includes("."))).toBe(true);
  });

  it("keeps workflow exception capabilities outside RBAC", () => {
    expect(
      CANONICAL_PERMISSION_CATALOG.some((item) =>
        item.code.endsWith(".override"),
      ),
    ).toBe(false);
  });

  it("implements the approved standard role boundaries", () => {
    expect(CANONICAL_ROLE_PERMISSION_MAP.READER).toEqual([]);
    expect(CANONICAL_ROLE_PERMISSION_MAP.DATA_ENTRY).toEqual(
      expect.arrayContaining(["legislation.prepare", "legislation.submit"]),
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.DATA_ENTRY).not.toContain(
      "legislation.return",
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.LEGAL_REVIEWER).toContain(
      "legislation.return",
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.LEGAL_REVIEWER).not.toContain(
      "legislation.submit",
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.CONTENT_MANAGER).not.toContain(
      "relation.review",
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.SYSTEM_ADMIN).not.toContain(
      "legislation.publish",
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.SYSTEM_ADMIN).not.toContain(
      "workflow_policy.overrides.manage",
    );
    expect(CANONICAL_ROLE_PERMISSION_MAP.SUPER).toHaveLength(75);
  });
});
