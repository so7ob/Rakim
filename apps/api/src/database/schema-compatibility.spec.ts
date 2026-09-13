import { describe, expect, it } from "vitest";
import {
  expectedMigrations,
  assertSchemaCompatible,
} from "../../../../scripts/database/schema-contract.mjs";
import { createDataSource } from "./config.js";
const fields = [
  ["users", "deleted_at"],
  ["password_recovery_requests", "token_hash"],
  ["source_documents", "active_sha256"],
  ["source_imports", "deleted_at"],
  ["job_queue", "cancel_requested_at"],
  ["deletion_batches", "id"],
  ["deletion_batch_items", "batch_id"],
  ...[
    "legislation_types",
    "subjects",
    "authorities",
    "gazette_issues",
    "platform_settings",
    "navigation_items",
    "public_pages",
  ].map((t) => [t, "edit_revision"]),
].map(([tableName, columnName]) => ({ tableName, columnName }));
const query =
  (names = expectedMigrations, columns = fields) =>
  async (sql: string) =>
    sql.includes("information_schema.tables")
      ? [{ name: "schema_migrations" }]
      : sql.includes("information_schema.columns")
        ? columns
        : names.map((name) => ({ name }));
describe("startup schema compatibility", () => {
  it("keeps the worker/API contract aligned with the complete migration registry", () => {
    const migrationClasses = createDataSource().options.migrations as Array<
      new () => { name?: string }
    >;
    expect(migrationClasses.map((c) => new c().name ?? c.name)).toEqual(
      expectedMigrations,
    );
  });
  it("accepts a matching schema", async () => {
    await expect(assertSchemaCompatible(query())).resolves.toBeUndefined();
  });
  it("accepts the historical permission synchronization alongside all required migrations", async () => {
    await expect(
      assertSchemaCompatible(
        query([...expectedMigrations, "PermissionCatalogSync1700000000011"]),
      ),
    ).resolves.toBeUndefined();
  });
  it("does not treat the historical migration as a replacement for required migrations", async () => {
    for (const required of [
      "ReferenceThemeDefaults1700000000011",
      "CanonicalRbacSecurity1700000000012",
    ])
      await expect(
        assertSchemaCompatible(
          query([
            ...expectedMigrations.filter((name) => name !== required),
            "PermissionCatalogSync1700000000011",
          ]),
        ),
      ).rejects.toThrow(required);
  });
  it("still checks physical columns when historical migrations are present", async () => {
    await expect(
      assertSchemaCompatible(
        query(
          [...expectedMigrations, "PermissionCatalogSync1700000000011"],
          fields.slice(1),
        ),
      ),
    ).rejects.toThrow(/users.deleted_at/);
  });
  it("rejects pending migrations with actionable diagnostic", async () => {
    await expect(
      assertSchemaCompatible(query(expectedMigrations.slice(0, -1))),
    ).rejects.toMatchObject({
      message: expect.stringContaining("npm run db:migrate"),
    });
  });
  it("rejects a database newer than the application", async () => {
    await expect(
      assertSchemaCompatible(
        query([...expectedMigrations, "UnknownFutureMigration"]),
      ),
    ).rejects.toThrow(/UnknownFutureMigration/);
  });
  it("rejects missing columns despite a completed migration history", async () => {
    await expect(
      assertSchemaCompatible(query(expectedMigrations, fields.slice(1))),
    ).rejects.toThrow(/users.deleted_at/);
  });
});
