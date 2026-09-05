import type { MigrationInterface, QueryRunner } from "typeorm";
import {
  CANONICAL_PERMISSION_CATALOG,
  CANONICAL_PERMISSION_CODES,
  CANONICAL_ROLE_PERMISSION_MAP,
  LEGACY_PERMISSION_ALIASES,
  ROLE_AUTHORITY_LEVELS,
} from "../../common/canonical-permission-catalog.js";

const LEGACY_ONLY_CODES = Object.keys(LEGACY_PERMISSION_ALIASES).filter(
  (code) => !CANONICAL_PERMISSION_CODES.has(code),
);

const POLICY_CAPABILITY_RENAMES: Readonly<Record<string, string>> = {
  "workflow:import-review-separation:override":
    "workflow.source_import.self_review.override",
  "workflow:approval-separation:override":
    "workflow.legislation.self_approval.override",
  "workflow:publication-separation:override":
    "workflow.legislation.self_publication.override",
  "workflow:amendment-review-separation:override":
    "workflow.amendment.self_review.override",
  "workflow:amendment-publication-separation:override":
    "workflow.amendment.self_publication.override",
};

type ExistingGrant = {
  roleId: string;
  roleCode: string;
  code: string;
  scope: "ALL" | "OWN" | "ASSIGNED";
};
type ExistingOverride = {
  userId: string;
  code: string;
  effect: "ALLOW" | "DENY";
  scope: "ALL" | "OWN" | "ASSIGNED";
  grantedBy: string | null;
  reason: string;
};

export class CanonicalRbacSecurity1700000000012 implements MigrationInterface {
  name = "CanonicalRbacSecurity1700000000012";

  async up(q: QueryRunner): Promise<void> {
    if (CANONICAL_PERMISSION_CATALOG.length !== 75)
      throw new Error("Canonical permission catalog count must be 75.");

    await this.createRollbackSnapshot(q);

    await q.query(`ALTER TABLE permission_definitions
      ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT TRUE AFTER is_active,
      ADD COLUMN is_legacy BOOLEAN NOT NULL DEFAULT FALSE AFTER is_system,
      ADD KEY idx_permission_catalog_state (is_legacy,is_active)`);
    await q.query(`ALTER TABLE roles
      ADD COLUMN is_protected BOOLEAN NOT NULL DEFAULT FALSE AFTER is_system,
      ADD COLUMN authority_level SMALLINT UNSIGNED NOT NULL DEFAULT 100 AFTER is_protected,
      ADD COLUMN permission_model_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER authority_level,
      ADD KEY idx_role_authority (authority_level,is_protected,is_active)`);

    if (LEGACY_ONLY_CODES.length)
      await q.query(
        `UPDATE permission_definitions SET is_legacy=TRUE
         WHERE code IN (${LEGACY_ONLY_CODES.map(() => "?").join(",")})`,
        LEGACY_ONLY_CODES,
      );

    for (const item of CANONICAL_PERMISSION_CATALOG)
      await q.query(
        `INSERT INTO permission_definitions
        (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,
         supported_scopes_json,is_active,is_system,is_legacy)
        VALUES (?,?,?,?,?,?,?,JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)
        ON DUPLICATE KEY UPDATE domain_code=VALUES(domain_code),
          resource_code=VALUES(resource_code),action_code=VALUES(action_code),
          label_ar=VALUES(label_ar),description_ar=VALUES(description_ar),
          sensitivity=VALUES(sensitivity),supported_scopes_json=JSON_ARRAY('ALL'),
          is_active=TRUE,is_system=TRUE,is_legacy=FALSE`,
        [
          item.code,
          item.domain,
          item.resource,
          item.action,
          item.labelAr,
          item.descriptionAr,
          item.sensitivity,
        ],
      );

    for (const [code, level] of Object.entries(ROLE_AUTHORITY_LEVELS))
      await q.query(
        `UPDATE roles SET authority_level=?,is_system=TRUE,
         is_protected=IF(code='SUPER',TRUE,is_protected) WHERE code=?`,
        [level, code],
      );

    const grants = (await q.query(
      `SELECT rp.role_id roleId,r.code roleCode,rp.permission_code code,
       rp.scope_code scope
       FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
       ORDER BY r.code,rp.permission_code`,
    )) as ExistingGrant[];
    const roleRows = (await q.query(
      "SELECT id,code FROM roles ORDER BY code",
    )) as Array<{ id: string; code: string }>;

    for (const role of roleRows) {
      const existing = new Set(
        grants
          .filter((grant) => grant.roleId === role.id && grant.scope === "ALL")
          .map((grant) => grant.code),
      );
      const canonical = new Set(
        CANONICAL_ROLE_PERMISSION_MAP[role.code] ??
          this.conservativeCustomRoleMapping(existing),
      );
      if (CANONICAL_ROLE_PERMISSION_MAP[role.code]) {
        const disallowedCanonical = CANONICAL_PERMISSION_CATALOG.map(
          (item) => item.code,
        ).filter((code) => !canonical.has(code));
        if (disallowedCanonical.length)
          await q.query(
            `DELETE FROM role_permissions WHERE role_id=?
             AND permission_code IN (${disallowedCanonical.map(() => "?").join(",")})`,
            [role.id, ...disallowedCanonical],
          );
      }
      for (const code of canonical) {
        if (!CANONICAL_PERMISSION_CODES.has(code))
          throw new Error(`Unknown canonical permission in role map: ${code}`);
        await q.query(
          `INSERT IGNORE INTO role_permissions
           (role_id,permission_code,scope_code) VALUES (?,?,'ALL')`,
          [role.id, code],
        );
      }
      await q.query(
        "UPDATE roles SET permissions_json=?,permission_model_version=2 WHERE id=?",
        [JSON.stringify([...canonical].sort()), role.id],
      );
    }

    await this.migrateDirectOverrides(q);
    await this.migratePolicyCapabilities(q);

    const canonicalCount = await q.query(
      "SELECT COUNT(*) total FROM permission_definitions WHERE is_active=TRUE AND is_legacy=FALSE",
    );
    if (Number(canonicalCount[0]?.total) !== 75)
      throw new Error(
        `Expected 75 canonical permissions, found ${String(canonicalCount[0]?.total)}.`,
      );
    const superRoles = await q.query(
      "SELECT id FROM roles WHERE code='SUPER' LIMIT 1",
    );
    if (superRoles[0]) {
      const superCount = await q.query(
        `SELECT COUNT(DISTINCT rp.permission_code) total
         FROM role_permissions rp JOIN permission_definitions pd ON pd.code=rp.permission_code
         WHERE rp.role_id=? AND pd.is_legacy=FALSE AND pd.is_active=TRUE`,
        [superRoles[0].id],
      );
      if (Number(superCount[0]?.total) !== 75)
        throw new Error("SUPER must receive all 75 canonical permissions.");
    }
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DELETE FROM role_permissions");
    await q.query("DELETE FROM user_permission_overrides");
    await q.query("DELETE FROM permission_definitions");
    await q.query(`INSERT INTO permission_definitions
      (code,domain_code,resource_code,action_code,label_ar,description_ar,
       sensitivity,supported_scopes_json,is_active,created_at,updated_at)
      SELECT code,domain_code,resource_code,action_code,label_ar,description_ar,
       sensitivity,supported_scopes_json,is_active,created_at,updated_at
      FROM rbac_migration_0012_permission_definitions_backup`);
    await q.query(`INSERT INTO role_permissions
      (role_id,permission_code,scope_code,granted_by,granted_at)
      SELECT role_id,permission_code,scope_code,granted_by,granted_at
      FROM rbac_migration_0012_role_permissions_backup`);
    await q.query(`INSERT INTO user_permission_overrides
      (user_id,permission_code,effect,scope_code,granted_by,reason,granted_at)
      SELECT user_id,permission_code,effect,scope_code,granted_by,reason,granted_at
      FROM rbac_migration_0012_user_overrides_backup`);
    await q.query("DELETE FROM user_permissions");
    await q.query(`INSERT INTO user_permissions
      (user_id,permission_code,granted_by,grant_reason,granted_at)
      SELECT user_id,permission_code,granted_by,grant_reason,granted_at
      FROM rbac_migration_0012_policy_capabilities_backup`);
    await q.query(`UPDATE roles r
      JOIN rbac_migration_0012_roles_backup b ON b.id=r.id
      SET r.permissions_json=b.permissions_json,r.is_system=b.is_system`);
    await q.query(`ALTER TABLE roles
      DROP INDEX idx_role_authority,
      DROP COLUMN permission_model_version,
      DROP COLUMN authority_level,
      DROP COLUMN is_protected`);
    await q.query(`ALTER TABLE permission_definitions
      DROP INDEX idx_permission_catalog_state,
      DROP COLUMN is_legacy,
      DROP COLUMN is_system`);
    await q.query("DROP TABLE rbac_migration_0012_policy_capabilities_backup");
    await q.query("DROP TABLE rbac_migration_0012_user_overrides_backup");
    await q.query("DROP TABLE rbac_migration_0012_role_permissions_backup");
    await q.query(
      "DROP TABLE rbac_migration_0012_permission_definitions_backup",
    );
    await q.query("DROP TABLE rbac_migration_0012_roles_backup");
  }

  private async createRollbackSnapshot(q: QueryRunner) {
    await q.query(
      "CREATE TABLE rbac_migration_0012_permission_definitions_backup LIKE permission_definitions",
    );
    await q.query(
      "INSERT INTO rbac_migration_0012_permission_definitions_backup SELECT * FROM permission_definitions",
    );
    await q.query(
      "CREATE TABLE rbac_migration_0012_role_permissions_backup LIKE role_permissions",
    );
    await q.query(
      "INSERT INTO rbac_migration_0012_role_permissions_backup SELECT * FROM role_permissions",
    );
    await q.query(
      "CREATE TABLE rbac_migration_0012_user_overrides_backup LIKE user_permission_overrides",
    );
    await q.query(
      "INSERT INTO rbac_migration_0012_user_overrides_backup SELECT * FROM user_permission_overrides",
    );
    await q.query(
      "CREATE TABLE rbac_migration_0012_policy_capabilities_backup LIKE user_permissions",
    );
    await q.query(
      "INSERT INTO rbac_migration_0012_policy_capabilities_backup SELECT * FROM user_permissions",
    );
    await q.query("CREATE TABLE rbac_migration_0012_roles_backup LIKE roles");
    await q.query(
      "INSERT INTO rbac_migration_0012_roles_backup SELECT * FROM roles",
    );
  }

  private conservativeCustomRoleMapping(existing: Set<string>): string[] {
    const result = new Set<string>();
    for (const code of existing) {
      if (CANONICAL_PERMISSION_CODES.has(code)) result.add(code);
      for (const canonical of LEGACY_PERMISSION_ALIASES[code] ?? [])
        result.add(canonical);
    }
    if (existing.has("annex.manage") && existing.has("legislation.publish"))
      for (const code of ["annex.publish", "annex.replace", "annex.repeal"])
        result.add(code);
    if (existing.has("relation.manage") && existing.has("legislation.approve"))
      result.add("relation.review");
    return [...result];
  }

  private async migrateDirectOverrides(q: QueryRunner) {
    const rows = (await q.query(
      `SELECT user_id userId,permission_code code,effect,scope_code scope,
       granted_by grantedBy,reason FROM user_permission_overrides`,
    )) as ExistingOverride[];
    const grouped = new Map<string, Map<string, ExistingOverride>>();
    for (const row of rows) {
      if (row.scope !== "ALL" && row.effect === "ALLOW") continue;
      const targets = CANONICAL_PERMISSION_CODES.has(row.code)
        ? [row.code]
        : (LEGACY_PERMISSION_ALIASES[row.code] ?? []);
      for (const code of targets) {
        const user = grouped.get(row.userId) ?? new Map();
        const existing = user.get(code);
        if (!existing || row.effect === "DENY")
          user.set(code, { ...row, code });
        grouped.set(row.userId, user);
      }
    }
    for (const [userId, overrides] of grouped)
      for (const item of overrides.values())
        await q.query(
          `INSERT INTO user_permission_overrides
           (user_id,permission_code,effect,scope_code,granted_by,reason)
           VALUES (?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             effect=IF(effect='DENY' OR VALUES(effect)='DENY','DENY','ALLOW'),
             scope_code='ALL'`,
          [userId, item.code, item.effect, "ALL", item.grantedBy, item.reason],
        );
  }

  private async migratePolicyCapabilities(q: QueryRunner) {
    for (const [oldCode, newCode] of Object.entries(
      POLICY_CAPABILITY_RENAMES,
    )) {
      await q.query(
        `INSERT IGNORE INTO user_permissions
         (user_id,permission_code,granted_by,granted_at,grant_reason)
         SELECT user_id,?,granted_by,granted_at,grant_reason
         FROM user_permissions WHERE permission_code=?`,
        [newCode, oldCode],
      );
      await q.query("DELETE FROM user_permissions WHERE permission_code=?", [
        oldCode,
      ]);
    }
  }
}
