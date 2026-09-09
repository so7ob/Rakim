import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AdminService } from "../../apps/api/dist/admin/admin.service.js";
import { AuthorizationPolicyService } from "../../apps/api/dist/admin/authorization-policy.service.js";
import { LifecycleService } from "../../apps/api/dist/admin/lifecycle.service.js";
import { createDataSource } from "../../apps/api/dist/database/config.js";

// Provision an EMPTY disposable database before running. This script never drops a database.
const database = process.env.MIGRATION_TEST_DATABASE;
if (
  !database ||
  database === process.env.DATABASE_NAME ||
  !/^[a-zA-Z0-9_]+(?:test|migration)$/.test(database)
)
  throw new Error(
    "MIGRATION_TEST_DATABASE must name a separate empty test database",
  );
process.env.DATABASE_NAME = database;
const db = createDataSource();
await db.initialize();
try {
  assert.equal(
    (await db.query("SHOW TABLES")).length,
    0,
    "Requires an empty database",
  );
  const migrations = db.migrations;
  db.migrations = migrations.filter(
    (m) =>
      !m.name.endsWith("1700000000015") && !m.name.endsWith("1700000000016"),
  );
  await db.runMigrations();
  const typeId = randomUUID(),
    authorityId = randomUUID(),
    lawId = randomUUID(),
    roleId = randomUUID();
  await db.query(
    "INSERT INTO legislation_types (id,code,name_ar) VALUES (?,'MIGRATION_TEST','نوع اختبار')",
    [typeId],
  );
  await db.query(
    "INSERT INTO authorities (id,code,name_ar,is_active) VALUES (?,'MIGRATION_TEST','جهة اختبار',FALSE)",
    [authorityId],
  );
  await db.query(
    "INSERT INTO legislations (id,type_id,authority_id,year,title_ar,status,legal_status) VALUES (?,?,?,2026,'تشريع سابق للترحيلة','PUBLISHED','IN_FORCE')",
    [lawId, typeId, authorityId],
  );
  await db.query(
    "INSERT INTO roles (id,code,name_ar,permissions_json) VALUES (?,'MIGRATION_TEST','دور موجود',JSON_ARRAY())",
    [roleId],
  );
  await db.query(
    "INSERT INTO role_permissions (role_id,permission_code,scope_code) VALUES (?,'legislation.view','ALL')",
    [roleId],
  );
  const before = await db.query(
    "SELECT * FROM role_permissions ORDER BY role_id,permission_code",
  );
  db.migrations = migrations;
  await db.runMigrations();
  assert.deepEqual(
    await db.query(
      "SELECT * FROM role_permissions ORDER BY role_id,permission_code",
    ),
    before,
  );
  assert.equal(
    (
      await db.query("SELECT is_active FROM authorities WHERE id=?", [
        authorityId,
      ])
    )[0].is_active,
    0,
    "Preserves existing inactive references",
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT status,legal_status,is_active,deleted_at FROM legislations WHERE id=?",
        [lawId],
      )
    )[0],
    {
      status: "PUBLISHED",
      legal_status: "IN_FORCE",
      is_active: 1,
      deleted_at: null,
    },
  );
  await db.undoLastMigration();
  await db.undoLastMigration();
  assert.equal(
    (
      await db.query("SELECT legal_status FROM legislations WHERE id=?", [
        lawId,
      ])
    )[0].legal_status,
    "IN_FORCE",
  );
  await db.runMigrations();
  assert.deepEqual(
    await db.query(
      "SELECT * FROM role_permissions ORDER BY role_id,permission_code",
    ),
    before,
  );
  // An initially empty dictionary permits the complete group-creation path without
  // modifying a seeded or shared dictionary used by another test suite.
  const actorId = randomUUID();
  await db.query(
    "INSERT INTO users (id,username,display_name,password_hash) VALUES (?,'migration_fixture','مستخدم اختبار ترحيلات','unusable-fixture-hash')",
    [actorId],
  );
  const actor = {
    id: actorId,
    username: "migration_fixture",
    displayName: "اختبار",
    roles: [],
    permissions: (
      await db.query("SELECT code FROM permission_definitions")
    ).map((p) => p.code),
  };
  const policy = new AuthorizationPolicyService(db),
    admin = new AdminService(db, policy),
    lifecycle = new LifecycleService(db, policy);
  const set = await admin.createSynonymSet(actor, "إنشاء مجموعة اختبار مستقلة");
  await assert.rejects(() => admin.createSynonymSet(actor, "مسودة مكررة"));
  await lifecycle.change(
    "synonym-sets",
    set.id,
    "disable",
    actor,
    "دورة مجموعة معزولة",
  );
  await assert.rejects(
    () => admin.addSynonym("لفظ اختبار", "مرادف اختبار", actor),
    /تفعيل مجموعة/,
  );
  for (const action of ["enable", "delete"])
    await lifecycle.change(
      "synonym-sets",
      set.id,
      action,
      actor,
      "دورة مجموعة معزولة",
    );
  assert.ok(
    (
      await db.query("SELECT deleted_at FROM search_synonym_sets WHERE id=?", [
        set.id,
      ])
    )[0].deleted_at,
  );
  const next = await admin.createSynonymSet(actor, "مجموعة تالية مستقلة");
  await db.query("DELETE FROM search_synonym_sets WHERE id IN (?,?)", [
    set.id,
    next.id,
  ]);
  const synonymEditor = { ...actor, permissions: ["search.synonym.create"] };
  await assert.rejects(() =>
    admin.createSynonymSet(synonymEditor, "مجموعة فارغة بلا إذن"),
  );
  const firstTerm = await admin.addSynonym(
    "مصطلح اختبار أول",
    "مرادف اختبار أول",
    synonymEditor,
  );
  assert.ok(
    firstTerm.setId,
    "The established synonym.create action creates its missing draft container",
  );
  await db.query("DELETE FROM search_synonyms WHERE id=?", [firstTerm.id]);
  await db.query("DELETE FROM search_synonym_sets WHERE id=?", [
    firstTerm.setId,
  ]);
  // Only this disposable fixture is removed; audit evidence and actor remain.

  // Verify the refusal happens before any DDL / permission deletion.
  await db.undoLastMigration();
  await db.query("UPDATE legislations SET is_active=FALSE WHERE id=?", [lawId]);
  await assert.rejects(
    () => db.undoLastMigration(),
    /LIFECYCLE_ROLLBACK_REQUIRES_SNAPSHOT/,
  );
  assert.equal(
    (
      await db.query("SELECT is_active FROM legislations WHERE id=?", [lawId])
    )[0].is_active,
    0,
  );
  console.log(
    "PASS: 0015/0016 up, down, up; existing data and grants preserved; synonym group lifecycle passed; unsafe rollback rejected",
  );
} finally {
  await db.destroy();
}
