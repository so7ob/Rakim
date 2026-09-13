import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { createDataSource } from "../database/config.js";
import { AdminService } from "./admin.service.js";
import { SiteService } from "../site/site.service.js";
import { AuthorizationPolicyService } from "./authorization-policy.service.js";
import { AuthService } from "../auth/auth.service.js";
import { LifecycleService } from "./lifecycle.service.js";
import type { AuthUser } from "../auth/auth.types.js";
describe("optimistic edit revisions and decision integrity", () => {
  let db: DataSource,
    admin: AdminService,
    site: SiteService,
    lifecycle: LifecycleService,
    actor: AuthUser;
  const actorId = randomUUID(),
    prefix = randomUUID().slice(0, 8),
    records: Array<[string, string]> = [];
  const revision = async (table: string, id: string) =>
    Number(
      (await db.query(`SELECT edit_revision FROM ${table} WHERE id=?`, [id]))[0]
        .edit_revision,
    );
  beforeAll(async () => {
    db = await createDataSource().initialize();
    const policy = new AuthorizationPolicyService(db);
    admin = new AdminService(db, policy);
    site = new SiteService(db);
    lifecycle = new LifecycleService(db, policy);
    await db.query(
      "INSERT INTO users(id,username,display_name,password_hash) VALUES (?,?,?,'unused')",
      [actorId, `edits_${prefix}`, "اختبار تعارض"],
    );
    await db.query(
      "INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='SUPER'",
      [actorId],
    );
    actor = await new AuthService(db).userById(actorId);
  });
  afterAll(async () => {
    const q = db.createQueryRunner();
    await q.connect();
    try {
      await q.query("SET @ylp_maintenance=1");
      for (const [table, id] of records.reverse())
        await q.query(
          `DELETE FROM ${table} WHERE ${table === "platform_settings" ? "setting_key" : "id"}=?`,
          [id],
        );
      await q.query("DELETE FROM audit_logs WHERE actor_id=?", [actorId]);
      await q.query("DELETE FROM user_roles WHERE user_id=?", [actorId]);
      await q.query("DELETE FROM users WHERE id=?", [actorId]);
    } finally {
      await q.query("SET @ylp_maintenance=0");
      await q.release();
      await db.destroy();
    }
  });
  it("allows only one of concurrent gazette editors and returns current values without overwriting", async () => {
    const input = {
      issueNumber: `conflict_${prefix}`,
      publisher: "قبل",
      reason: "اختبار",
    };
    const { id } = await admin.saveGazette(input, actor);
    records.push(["gazette_issues", id]);
    const versions = await Promise.allSettled(
      ["الأول", "الثاني"].map((publisher) =>
        admin.saveGazette({ ...input, publisher, editRevision: 1 }, actor, id),
      ),
    );
    expect(versions.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const error = (
      versions.find((r) => r.status === "rejected") as PromiseRejectedResult
    ).reason;
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse().conflict.revision).toBe(2);
    expect(["الأول", "الثاني"]).toContain(
      error.getResponse().conflict.current.publisher,
    );
    await expect(admin.saveGazette(input, actor, id)).rejects.toThrow(
      /نسخة التحرير/,
    );
    await lifecycle.change("gazettes", id, "disable", actor, "تعطيل اختبار");
    expect(await revision("gazette_issues", id)).toBe(3);
    await expect(
      admin.saveGazette({ ...input, editRevision: 2 }, actor, id),
    ).rejects.toThrow(/عُدّل/);
  });
  it("protects all reference entities including edits via administrative state", async () => {
    for (const [kind, table] of [
      ["types", "legislation_types"],
      ["subjects", "subjects"],
      ["authorities", "authorities"],
    ]) {
      const input = {
        code: `E_${prefix}_${kind}`.toUpperCase(),
        nameAr: "مرجع اختبار",
        isActive: true,
      };
      const { id } = await admin.createReference(
        kind!,
        input,
        actor,
        "إضافة اختبار",
      );
      records.push([table!, id]);
      await admin.updateReference(
        kind!,
        id,
        { ...input, nameAr: "أحدث", editRevision: 1 },
        actor,
        "تعديل",
      );
      await expect(
        admin.updateReference(
          kind!,
          id,
          { ...input, editRevision: 1 },
          actor,
          "تعارض",
        ),
      ).rejects.toThrow(/عُدّل/);
      expect(await revision(table!, id)).toBe(2);
    }
  });
  it("protects public pages and navigation while preserving published permissions", async () => {
    const p = await site.createPage(
      {
        slug: `revision-${prefix}`,
        titleAr: "صفحة",
        introAr: "مقدمة",
        sectionTitle: "قسم",
        sectionBody: "نص",
        reason: "اختبار",
      },
      actor,
    );
    records.push(["public_pages", p.id]);
    const values = {
      eyebrowAr: "",
      titleAr: "أحدث",
      introAr: "",
      sections: [{ title: "عنوان", body: "نص" }],
      status: "DRAFT" as const,
      editRevision: 1,
    };
    await site.updatePage(p.id, values, actor, "تعديل");
    await expect(site.updatePage(p.id, values, actor, "تعارض")).rejects.toThrow(
      /عُدّل/,
    );
    const nav = {
      location: "FOOTER" as const,
      labelAr: "اختبار",
      path: `/ar/revision-${prefix}`,
      sortOrder: 42,
      isVisible: false,
    };
    const n = await site.createNavigation(nav, actor, "إنشاء");
    records.push(["navigation_items", n.id]);
    await site.updateNavigation(
      n.id,
      { ...nav, editRevision: 1 },
      actor,
      "تعديل",
    );
    await expect(
      site.updateNavigation(n.id, { ...nav, editRevision: 1 }, actor, "تعارض"),
    ).rejects.toThrow(/عُدّل/);
  });
  it("checks the whole settings batch before changing any member", async () => {
    const keys = [`test.${prefix}.a`, `test.${prefix}.b`];
    for (const key of keys) {
      records.push(["platform_settings", key]);
      await db.query(
        "INSERT INTO platform_settings(setting_key,group_code,label_ar,input_type,value_json,is_public) VALUES (?,'BRANDING','اختبار','TEXT','\"قديم\"',FALSE)",
        [key],
      );
    }
    const values = Object.fromEntries(keys.map((k) => [k, "جديد"]));
    const revisions = Object.fromEntries(keys.map((k) => [k, 1]));
    await db.query(
      "UPDATE platform_settings SET value_json='\"متزامن\"' WHERE setting_key=?",
      [keys[1]],
    );
    await expect(
      site.updateSettings(values, actor, "تعارض", revisions),
    ).rejects.toThrow(/تغيرت/);
    const [untouched] = await db.query(
      "SELECT value_json value FROM platform_settings WHERE setting_key=?",
      [keys[0]],
    );
    expect(String(untouched.value)).toContain("قديم");
    await site.updateSettings(values, actor, "حفظ متوافق", {
      [keys[0]!]: 1,
      [keys[1]!]: 2,
    });
  });
  it("requires real decision reasons and rejects stale or terminal report transitions", async () => {
    const id = randomUUID();
    records.push(["reports", id]);
    await db.query(
      "INSERT INTO reports(id,entity_type,entity_id,category,details) VALUES (?,'LEGISLATION',?,'اختبار','بلاغ اختبار')",
      [id, randomUUID()],
    );
    await expect(
      admin.updateReport(id, "REJECTED", " ", actor, "OPEN"),
    ).rejects.toThrow(/سبب/);
    await admin.updateReport(
      id,
      "TRIAGED",
      "بدء التحقق من المصدر",
      actor,
      "OPEN",
    );
    await expect(
      admin.updateReport(id, "RESOLVED", "سبب كاف", actor, "OPEN"),
    ).rejects.toThrow(/تغيرت/);
    await admin.updateReport(
      id,
      "RESOLVED",
      "قورنت البيانات بالمصدر",
      actor,
      "TRIAGED",
    );
    await expect(
      admin.updateReport(id, "REJECTED", "طلب متأخر", actor, "RESOLVED"),
    ).rejects.toThrow(/غير مسموح/);
    const history = await admin.decisionHistory("reports", id, actor);
    expect(history).toHaveLength(2);
    expect(history.map((x: { reason: string }) => x.reason)).toContain(
      "قورنت البيانات بالمصدر",
    );
  });
});
