import { PERMISSION_CATALOG } from "../common/permission-catalog.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { WORKFLOW_POLICIES } from "../admin/workflow-policies.js";
import {
  CANONICAL_PERMISSION_CATALOG,
  CANONICAL_ROLE_PERMISSION_MAP,
} from "../common/canonical-permission-catalog.js";
import { createDataSource } from "./config.js";

describe("canonical RBAC database migration", () => {
  let db: DataSource;

  beforeAll(async () => {
    db = await createDataSource().initialize();
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it("persists the runtime catalog while keeping the frozen baseline and legacy rows", async () => {
    const rows = await db.query(
      `SELECT
        SUM(is_active=1 AND is_legacy=0) canonicalCount,
        SUM(is_legacy=1) legacyCount,
        SUM(is_active=1 AND is_legacy=0 AND supported_scopes_json<>JSON_ARRAY('ALL')) invalidScopeCount
       FROM permission_definitions`,
    );
    expect(Number(rows[0].canonicalCount)).toBe(PERMISSION_CATALOG.length);
    expect(Number(rows[0].legacyCount)).toBeGreaterThan(0);
    expect(Number(rows[0].invalidScopeCount)).toBe(0);

    const codes = await db.query(
      `SELECT code FROM permission_definitions
       WHERE is_active=1 AND is_legacy=0 ORDER BY code`,
    );
    expect(codes.map((row: { code: string }) => row.code).sort()).toEqual(
      PERMISSION_CATALOG.map((item) => item.code).sort(),
    );
  });

  it("keeps the five workflow exception capabilities outside the RBAC catalog", async () => {
    const policyCodes = WORKFLOW_POLICIES.map(
      (policy) => policy.permissionCode,
    );
    const rows = await db.query(
      `SELECT code FROM permission_definitions WHERE code IN (${policyCodes
        .map(() => "?")
        .join(",")})`,
      policyCodes,
    );
    expect(rows).toEqual([]);
    expect(new Set(policyCodes).size).toBe(5);
  });

  it("matches every approved standard-role grant exactly", async () => {
    for (const [roleCode, expected] of Object.entries(
      CANONICAL_ROLE_PERMISSION_MAP,
    )) {
      const rows = await db.query(
        `SELECT rp.permission_code code
         FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
         WHERE r.code=? ORDER BY rp.permission_code`,
        [roleCode],
      );
      expect(rows.map((row: { code: string }) => row.code).sort()).toEqual(
        [...expected].sort(),
      );
    }
  });

  it("protects SUPER and gives it all canonical RBAC permissions only", async () => {
    const roles = await db.query(
      `SELECT is_system isSystem,is_protected isProtected,
        authority_level authorityLevel,permission_model_version modelVersion
       FROM roles WHERE code='SUPER'`,
    );
    expect(roles[0]).toEqual(
      expect.objectContaining({
        isSystem: 1,
        isProtected: 1,
        authorityLevel: 1000,
        modelVersion: 2,
      }),
    );
    const grants = await db.query(
      `SELECT COUNT(*) count FROM role_permissions rp
       JOIN roles r ON r.id=rp.role_id
       JOIN permission_definitions pd ON pd.code=rp.permission_code
       WHERE r.code='SUPER' AND pd.is_active=1 AND pd.is_legacy=0`,
    );
    expect(Number(grants[0].count)).toBe(75);
  });
});
