import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

const password = "DevOnly!ChangeMe2026";
let username: string, userId: string, roleId: string, sourceId: string;
const laws: string[] = [],
  personalIds: string[] = [];
test.beforeAll(async () => {
  const db = await createDataSource().initialize();
  userId = randomUUID();
  sourceId = randomUUID();
  roleId = randomUUID();
  username = "crud_" + userId.slice(0, 8);
  try {
    await db.query(
      "INSERT INTO roles (id,code,name_ar,permissions_json,is_system,is_protected,authority_level,permission_model_version) VALUES (?,?,?,JSON_ARRAY(),FALSE,FALSE,700,2)",
      [roleId, "CRUD_" + roleId.slice(0, 8), "دور اختبار CRUD معزول"],
    );
    await db.query(
      "INSERT INTO role_permissions (role_id,permission_code,scope_code) SELECT ?,code,'ALL' FROM permission_definitions WHERE is_active=TRUE AND is_legacy=FALSE",
      [roleId],
    );
    await db.query(
      "INSERT INTO users (id,username,display_name,password_hash,is_active) SELECT ?,?,?,password_hash,TRUE FROM users WHERE username='super'",
      [userId, username, "مستخدم اختبار CRUD"],
    );
    await db.query("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)", [
      userId,
      roleId,
    ]);
    await db.query(
      "INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,reviewed_at,created_by) VALUES (?,?,?,'text/plain',1,?,NOW(3),'مصدر اختبار مستقل','REVIEWED',NOW(3),?)",
      [
        sourceId,
        "crud-fixture.txt",
        "tests/" + sourceId,
        createHash("sha256").update(sourceId).digest("hex"),
        userId,
      ],
    );
  } finally {
    await db.destroy();
  }
});
test.afterAll(async () => {
  const db = await createDataSource().initialize();
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await q.query("SET @ylp_maintenance=1");
    for (const id of laws) {
      await q.query(
        "DELETE FROM previous_text_snapshots WHERE article_version_id IN (SELECT av.id FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?)",
        [id],
      );
      await q.query(
        "DELETE FROM article_modifications WHERE article_id IN (SELECT id FROM articles WHERE legislation_id=?)",
        [id],
      );
      await q.query("DELETE FROM amendments WHERE amended_legislation_id=?", [
        id,
      ]);
      await q.query(
        "UPDATE article_versions av JOIN articles a ON a.id=av.article_id SET av.previous_version_id=NULL WHERE a.legislation_id=?",
        [id],
      );
      await q.query(
        "DELETE av FROM article_versions av JOIN articles a ON a.id=av.article_id WHERE a.legislation_id=?",
        [id],
      );
      await q.query("DELETE FROM articles WHERE legislation_id=?", [id]);
      for (const table of [
        "legislation_versions",
        "legislation_source_documents",
        "workflow_events",
        "content_responsibilities",
      ])
        await q.query(`DELETE FROM ${table} WHERE legislation_id=?`, [id]);
      await q.query("DELETE FROM search_documents WHERE legislation_id=?", [
        id,
      ]);
      await q.query(
        "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
        [id],
      );
      await q.query("DELETE FROM legislations WHERE id=?", [id]);
    }
    for (const table of [
      "favorites",
      "saved_searches",
      "user_notes",
      "user_sessions",
      "user_permission_overrides",
      "user_roles",
    ])
      await q.query(`DELETE FROM ${table} WHERE user_id=?`, [userId]);
    await q.query("DELETE FROM source_documents WHERE id=?", [sourceId]);
    await q.query("DELETE FROM audit_logs WHERE actor_id=?", [userId]);
    await q.query("DELETE FROM users WHERE id=?", [userId]);
    await q.query("DELETE FROM roles WHERE id=?", [roleId]);
  } finally {
    await q.query("SET @ylp_maintenance=0");
    await q.release();
    await db.destroy();
  }
});
async function login(
  request: import("@playwright/test").APIRequestContext,
  name = username,
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { username: name, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return { "x-csrf-token": body.csrfToken };
}
async function draft(
  request: import("@playwright/test").APIRequestContext,
  headers: Record<string, string>,
) {
  const refs = await (await request.get("/api/v1/admin/references")).json();
  const source = (
    await (await request.get("/api/v1/admin/amendments/candidates")).json()
  ).sources.find((source: { id: string }) => source.id === sourceId);
  const title = "تشريع CRUD " + randomUUID();
  const response = await request.post("/api/v1/legislations", {
    headers,
    data: {
      titleAr: title,
      typeId: refs.types[0].id,
      authorityId: refs.authorities[0].id,
      year: 2026,
    },
  });
  expect(response.ok()).toBeTruthy();
  const { id } = await response.json();
  laws.push(id);
  return { id, title, source };
}

test("draft article UI persists edits and administrative state after reload and deletes safely", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const headers = await login(page.request);
  const fixture = await draft(page.request, headers);
  await page.goto(`/ar/admin/content/${fixture.id}/articles`);
  await page.getByRole("button", { name: "+ إضافة مادة", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("رقم المادة", { exact: true }).fill("1 مكرر");
  await dialog.getByLabel("مفتاح الترتيب", { exact: true }).fill("000001");
  await dialog
    .getByLabel("المصدر", { exact: true })
    .selectOption(fixture.source.id);
  await dialog.getByLabel("بداية النفاذ").fill("2026-01-01");
  await dialog
    .getByLabel("نص المادة", { exact: true })
    .fill("نص أول محفوظ من الواجهة");
  await dialog.getByLabel("سبب الإضافة").fill("إضافة بيانات اختبار معزولة");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "المادة 1 مكرر", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("نص أول محفوظ من الواجهة", { exact: true }),
  ).toBeVisible();
  const card = page.locator("article.admin-list-card").filter({
    has: page.getByRole("heading", { name: "المادة 1 مكرر", exact: true }),
  });
  await card.getByRole("button", { name: "تعديل المادة", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator('textarea[name="text"]')
    .fill("نص معدل وثابت بعد إعادة التحميل");
  await page
    .getByRole("dialog")
    .locator('[name="reason"]')
    .fill("تصحيح نص اختبار");
  await page.getByRole("dialog").getByRole("button", { name: /حفظ/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("نص معدل وثابت بعد إعادة التحميل", { exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "تعطيل إداري", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("سبب الإجراء")
    .fill("إيقاف إداري للاختبار");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "تعطيل إداري", exact: true })
    .click();
  await expect(card.getByText("معطل إدارياً", { exact: true })).toBeVisible();
  await page.reload();
  await expect(card.getByText("معطل إدارياً", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `artifacts/crud-coverage/${test.info().project.name}-disabled-article.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  await card.getByRole("button", { name: "إعادة تفعيل", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("سبب الإجراء")
    .fill("إعادة تفعيل للاختبار");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "إعادة تفعيل", exact: true })
    .click();
  await expect(card.getByText("فعال إدارياً", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "حذف", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("سبب الإجراء")
    .fill("إزالة مادة اختبار مسودة");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "حذف", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "المادة 1 مكرر", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "المادة 1 مكرر", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("direct API rejects missing permission, CSRF, invalid input, duplicate request and foreign personal records", async ({
  request,
}) => {
  expect(
    (
      await request.patch(
        "/api/v1/admin/lifecycle/legislations/" + randomUUID(),
        { data: { action: "delete", reason: "اختبار" } },
      )
    ).status(),
  ).toBe(401);
  let headers = await login(request);
  const statuses = await Promise.all(
    Array.from({ length: 8 }, async () =>
      (await request.get("/api/v1/auth/status")).json(),
    ),
  );
  expect(statuses.every((s) => s.csrfToken === headers["x-csrf-token"])).toBe(
    true,
  );
  const fixture = await draft(request, headers);
  expect(
    (
      await request.patch(
        `/api/v1/admin/lifecycle/legislations/${fixture.id}`,
        { data: { action: "disable", reason: "اختبار CSRF" } },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(
        `/api/v1/admin/lifecycle/legislations/${fixture.id}`,
        { headers, data: { action: "disable", reason: "" } },
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/v1/admin/amendments", {
        headers,
        data: {
          legislationId: fixture.id,
          titleAr: "غير صالح",
          sourceDocumentId: fixture.source.id,
          effectiveFrom: "2026-01-01",
          operations: [{ operationType: "ADD", citationText: "اختبار" }],
        },
      })
    ).status(),
  ).toBe(409);
  const own = await (
    await request.post("/api/v1/me/saved-searches", {
      headers,
      data: { name: "بحث خاص للاختبار", query: { q: "قانون" } },
    })
  ).json();
  personalIds.push(own.id);
  headers = await login(request, "reader");
  expect(
    (
      await request.patch(
        `/api/v1/admin/lifecycle/legislations/${fixture.id}`,
        { headers, data: { action: "delete", reason: "محاولة قارئ" } },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch(`/api/v1/me/saved-searches/${own.id}`, {
        headers,
        data: { name: "تجاوز ملكية", query: { q: "تعديل" } },
      })
    ).status(),
  ).toBe(404);
  headers = await login(request);
  const payload = {
    currentLabel: "1",
    sortKey: "000001",
    sourceDocumentId: fixture.source.id,
    validFrom: "2026-01-01",
    text: "نص اختبار",
    reason: "منع طلبين متزامنين",
  };
  const replies = await Promise.all([
    request.post(`/api/v1/admin/legislations/${fixture.id}/articles`, {
      headers,
      data: payload,
    }),
    request.post(`/api/v1/admin/legislations/${fixture.id}/articles`, {
      headers,
      data: payload,
    }),
  ]);
  expect(replies.map((r) => r.status()).sort()).toEqual([201, 409]);
  const detail = await (
    await request.get(`/api/v1/admin/legislations/${fixture.id}`)
  ).json();
  expect(detail.articles).toHaveLength(1);
});

test("amendment form creates and edits several elements in one document without losing siblings", async ({
  page,
}) => {
  const headers = await login(page.request);
  const f = await draft(page.request, headers);
  const db = await createDataSource().initialize();
  try {
    await db.query("UPDATE legislations SET status='PUBLISHED' WHERE id=?", [
      f.id,
    ]);
  } finally {
    await db.destroy();
  }
  await page.goto("/ar/admin/amendments");
  await expect(
    page
      .getByRole("navigation", { name: "تبويبات وثائق التعديل" })
      .getByRole("link"),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "+ إضافة وثيقة تعديل", exact: true })
    .click();
  await expect(page).toHaveURL(/\/ar\/admin\/amendments$/);
  const createDialog = page.getByRole("dialog", {
    name: "إضافة وثيقة تعديل",
    exact: true,
  });
  await expect(createDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(createDialog).toBeHidden();
  await page
    .getByRole("button", { name: "+ إضافة وثيقة تعديل", exact: true })
    .click();
  await expect(createDialog).toBeVisible();
  await page
    .getByLabel("عنوان وثيقة التعديل", { exact: true })
    .fill("وثيقة واجهة " + f.id);
  await page.getByLabel("التشريع المستهدف", { exact: true }).selectOption(f.id);
  await page
    .getByLabel("المصدر المدقق", { exact: true })
    .selectOption(f.source.id);
  await page.getByLabel("بدء الأثر القانوني").fill("2026-06-01");
  for (let i = 0; i < 3; i++) {
    if (i)
      await page
        .getByRole("button", { name: "+ إضافة عنصر إلى الوثيقة" })
        .click();
    const field = page.locator("fieldset.admin-list-card").nth(i);
    await field.getByLabel("نوع العملية").selectOption("ADD");
    await field.getByLabel("رقم المادة الجديد").fill(i === 2 ? "1" : "1");
    await field
      .getByLabel("مفتاح ترتيب المادة الجديدة")
      .fill(String(i + 1).padStart(6, "0"));
    await field.getByLabel("نص الاستناد").fill("نص استناد للعنصر " + i);
    await field
      .getByLabel("النص الجديد", { exact: true })
      .fill("نص عنصر مستقل " + i);
  }
  await page.getByRole("button", { name: "حفظ الوثيقة وجميع عناصرها" }).click();
  await expect(
    page.getByRole("heading", { name: "وثيقة واجهة " + f.id, exact: true }),
  ).toBeVisible();
  let doc = (
    await (await page.request.get("/api/v1/admin/amendments")).json()
  ).find((d: { titleAr: string }) => d.titleAr === "وثيقة واجهة " + f.id);
  expect(doc.operations).toHaveLength(3);
  const originalIds = doc.operations.map((o: { id: string }) => o.id);
  const card = page.locator("article.admin-card").filter({
    has: page.getByRole("heading", {
      name: "وثيقة واجهة " + f.id,
      exact: true,
    }),
  });
  await card.getByRole("button", { name: "تعديل الوثيقة وعناصرها" }).click();
  const dialog = page.getByRole("dialog");
  await expect(page.locator("fieldset.admin-list-card")).toHaveCount(3);
  await dialog
    .locator("fieldset.admin-list-card")
    .nth(1)
    .getByLabel("النص الجديد", { exact: true })
    .fill("نص العنصر الثاني بعد التحرير");
  await dialog.getByLabel("سبب التعديل").fill("تحرير عنصر واحد فقط");
  await dialog
    .getByRole("button", { name: "حفظ الوثيقة وجميع عناصرها" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  doc = (
    await (await page.request.get("/api/v1/admin/amendments")).json()
  ).find((d: { id: string }) => d.id === doc.id);
  expect(doc.operations.map((o: { id: string }) => o.id)).toEqual(originalIds);
  expect(doc.operations[0].newText).toBe("نص عنصر مستقل 0");
  expect(doc.operations[1].newText).toBe("نص العنصر الثاني بعد التحرير");
  expect(doc.operations[2].newText).toBe("نص عنصر مستقل 2");
  await expect(card.getByText("فعال إدارياً", { exact: true })).toHaveCount(4);
  await card.locator("details").nth(1).locator("summary").click();
  await page.screenshot({
    path: `artifacts/crud-coverage/${test.info().project.name}-amendments.png`,
    fullPage: true,
  });
});
