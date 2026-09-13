import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";
let records: Record<string, string[]> = {};
const remember = (table: string, id: string) => {
  (records[table] ??= []).push(id);
  return id;
};
async function login(page: Page) {
  const r = await page.request.post("/api/v1/auth/login", {
    data: { username: "super", password: "DevOnly!ChangeMe2026" },
  });
  expect(r.ok()).toBeTruthy();
  return { "x-csrf-token": (await r.json()).csrfToken };
}
test.afterEach(async () => {
  const db = await createDataSource().initialize();
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await q.query("SET @ylp_maintenance=1");
    for (const id of Object.values(records).flat())
      await q.query("DELETE FROM audit_logs WHERE entity_id=? OR actor_id=?", [
        id,
        id,
      ]);
    for (const id of records.users ?? []) {
      await q.query(
        "DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM password_recovery_requests WHERE user_id=?)",
        [id],
      );
      await q.query("DELETE FROM password_recovery_requests WHERE user_id=?", [
        id,
      ]);
      await q.query("DELETE FROM user_sessions WHERE user_id=?", [id]);
      await q.query("DELETE FROM user_roles WHERE user_id=?", [id]);
    }
    for (const table of [
      "reports",
      "quality_issues",
      "gazette_issues",
      "navigation_items",
      "public_pages",
      "legislation_types",
      "platform_settings",
      "users",
    ])
      for (const id of records[table] ?? [])
        await q.query(
          `DELETE FROM ${table} WHERE ${table === "platform_settings" ? "setting_key" : "id"}=?`,
          [id],
        );
  } finally {
    records = {};
    await q.query("SET @ylp_maintenance=0");
    await q.release();
    await db.destroy();
  }
});

test("recovery request reaches authorized administrator and completes through a one-use link", async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== "desktop-1440");
  const headers = await login(page),
    username = `recovery_e2e_${randomUUID().slice(0, 8)}`;
  const created = await page.request.post("/api/v1/admin/users", {
    headers,
    data: {
      username,
      displayName: "اختبار طلب استعادة",
      password: "OldRecovery!1234",
      roles: ["READER"],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  remember("users", (await created.json()).id);
  const anonymous = await browser.newContext({
    baseURL: info.project.use.baseURL,
  });
  const visitor = await anonymous.newPage();
  try {
    await visitor.goto("/ar/forgot-password");
    await visitor.getByLabel("اسم المستخدم", { exact: true }).fill(username);
    await visitor.getByRole("button", { name: "إرسال طلب الاستعادة" }).click();
    await expect(visitor.getByRole("status")).toContainText(
      "سُجل طلب الاستعادة",
    );
    expect(
      (await visitor.request.get("/api/v1/admin/recovery-requests")).status(),
    ).toBe(401);
    const denied = await visitor.request.post(
      "/api/v1/admin/recovery-requests/fake",
      {
        data: {
          action: "issue",
          identityVerified: true,
          reason: "اختبار منع مباشر",
        },
      },
    );
    expect(denied.status()).toBe(401);
    await page.goto("/ar/admin/users/recovery");
    const row = page.getByRole("row").filter({ hasText: username });
    await row.getByRole("button", { name: "إصدار رابط", exact: true }).click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox").check();
    await dialog
      .getByLabel("سبب المعالجة")
      .fill("تحققت من الهوية للاختبار المعزول");
    await dialog.getByRole("button", { name: "تأكيد المعالجة" }).click();
    dialog = page.getByRole("dialog", { name: "رابط الاستعادة المؤقت" });
    const link = await dialog
      .getByLabel("رابط الاستعادة", { exact: true })
      .inputValue();
    await dialog.getByRole("button", { name: "تم تسليم الرابط" }).click();
    await visitor.goto(link);
    await visitor
      .getByLabel("كلمة المرور الجديدة", { exact: true })
      .fill("NewRecovery!5678");
    await visitor.getByLabel("تأكيد كلمة المرور").fill("NewRecovery!5678");
    await visitor
      .getByRole("button", { name: "حفظ كلمة المرور", exact: true })
      .click();
    await expect(visitor.getByRole("status")).toContainText(
      "حُدّثت كلمة المرور",
    );
    expect(
      (
        await visitor.request.post("/api/v1/auth/login", {
          data: { username, password: "NewRecovery!5678" },
        })
      ).ok(),
    ).toBeTruthy();
    const replay = await visitor.request.post(
      "/api/v1/auth/password-recovery/complete",
      { data: { token: link.split("#")[1], password: "ReplaySecret!1234" } },
    );
    expect(replay.status()).toBe(400);
  } finally {
    await anonymous.close();
  }
});

test("concurrent gazette editing preserves inputs and requires field-by-field review", async ({
  page,
  browser,
}, info) => {
  const headers = await login(page),
    number = `parallel_${randomUUID().slice(0, 8)}`;
  const r = await page.request.post("/api/v1/admin/gazette-issues", {
    headers,
    data: {
      issueNumber: number,
      publisher: "ناشر قديم",
      notes: "ملاحظة قديمة",
      reason: "إنشاء اختبار",
    },
  });
  expect(r.ok()).toBeTruthy();
  const id = remember("gazette_issues", (await r.json()).id);
  await page.goto("/ar/admin/reference-data/gazettes");
  await page
    .getByRole("row")
    .filter({ hasText: number })
    .getByRole("button", { name: "تعديل", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("الناشر", { exact: true }).fill("تعديلي المحلي");
  await dialog.getByLabel("سبب الإجراء").fill("تعديل محلي");
  const external = await page.request.patch(
    `/api/v1/admin/gazette-issues/${id}`,
    {
      headers,
      data: {
        issueNumber: number,
        publisher: "ناشر متزامن",
        notes: "ملاحظة أحدث",
        reason: "تعديل متزامن",
        editRevision: 1,
      },
    },
  );
  expect(external.ok()).toBeTruthy();
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "تعارض في التعديلات" }),
  ).toBeVisible();
  expect(
    await dialog
      .locator(".modal-body")
      .evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);
  await expect(dialog.getByLabel("الناشر", { exact: true })).toHaveValue(
    "تعديلي المحلي",
  );
  await expect(
    dialog.getByRole("button", { name: "حفظ", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("اختيار الناشر", { exact: true })
    .selectOption("mine");
  await dialog
    .getByRole("button", { name: "تطبيق الاختيارات على النموذج" })
    .click();
  await expect(dialog.getByLabel("ملاحظات", { exact: true })).toHaveValue(
    "ملاحظة أحدث",
  );
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: number });
  await expect(row).toContainText("تعديلي المحلي");
  await expect(row).toContainText("ملاحظة أحدث");
});

test("quality and report decisions require typed reasons and show persistent processing history", async ({
  page,
}, info) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(info.project.name));
  await login(page);
  const db = await createDataSource().initialize();
  const marker = randomUUID().slice(0, 8);
  const qualityId = remember("quality_issues", randomUUID()),
    reportId = remember("reports", randomUUID());
  try {
    await db.query(
      "INSERT INTO quality_issues(id,issue_code,severity,message_ar) VALUES (?,'TEST','WARNING',?)",
      [qualityId, `مشكلة ${marker}`],
    );
    await db.query(
      "INSERT INTO reports(id,entity_type,entity_id,category,details) VALUES (?,'LEGISLATION',?,'TEST',?)",
      [reportId, randomUUID(), `بلاغ ${marker}`],
    );
  } finally {
    await db.destroy();
  }
  await page.goto("/ar/admin/quality");
  await page
    .locator("article")
    .filter({ hasText: `مشكلة ${marker}` })
    .getByRole("button", { name: "تجاهل بمبرر" })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "حفظ القرار" }).click();
  await expect(dialog.getByRole("alert")).toContainText("اكتب سبباً");
  await dialog.getByLabel("سبب القرار").fill(`راجعت المصدر ${marker}`);
  await dialog.getByRole("button", { name: "حفظ القرار" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("حالة المشكلة").selectOption("IGNORED");
  let item = page.locator("article").filter({ hasText: `مشكلة ${marker}` });
  await item.getByText("سجل المعالجة", { exact: true }).click();
  await expect(item).toContainText(`راجعت المصدر ${marker}`);
  await page.goto("/ar/admin/reports");
  item = page.locator("article").filter({ hasText: `بلاغ ${marker}` });
  await item.getByRole("button", { name: "رفض", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("سبب القرار").fill(`البلاغ غير مطابق ${marker}`);
  await dialog.getByRole("button", { name: "حفظ القرار" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  item = page.locator("article").filter({ hasText: `بلاغ ${marker}` });
  await item.getByText("سجل المعالجة", { exact: true }).click();
  await expect(item).toContainText(`البلاغ غير مطابق ${marker}`);
  await expect(
    item.getByRole("button", { name: "رفض", exact: true }),
  ).toHaveCount(0);
});

test("settings, navigation, pages and references recover safely from edit conflicts", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440");
  const headers = await login(page),
    marker = randomUUID().slice(0, 8);
  const created = async (path: string, body: unknown, table: string) => {
    const r = await page.request.post(`/api/v1${path}`, {
      headers,
      data: body,
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    return remember(table, (await r.json()).id);
  };
  const reference = {
    code: `R_${marker.toUpperCase()}`,
    nameAr: `مرجع ${marker}`,
    isActive: true,
    reason: "اختبار مرجع",
  };
  const id = await created(
    "/admin/reference-data/types",
    reference,
    "legislation_types",
  );
  await page.goto("/ar/admin/reference-data/types");
  await page
    .getByRole("row")
    .filter({ hasText: reference.nameAr })
    .getByRole("button", { name: "تعديل", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("الاسم العربي").fill("تعديل محلي للمرجع");
  expect(
    (
      await page.request.patch(`/api/v1/admin/reference-data/types/${id}`, {
        headers,
        data: { ...reference, nameAr: "أحدث اسم", editRevision: 1 },
      })
    ).ok(),
  ).toBeTruthy();
  await dialog.getByLabel("سبب التغيير").fill("اختبار تعارض مرجع");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "تعارض في التعديلات" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "تطبيق الاختيارات على النموذج" })
    .click();
  await expect(dialog.getByLabel("الاسم العربي")).toHaveValue("أحدث اسم");
  await dialog.getByRole("button", { name: "حفظ", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const nav = {
    location: "FOOTER",
    labelAr: `رابط ${marker}`,
    path: `/ar/conflict-${marker}`,
    sortOrder: 99,
    isVisible: false,
    reason: "اختبار رابط",
  };
  const navId = await created(
    "/admin/site/navigation",
    nav,
    "navigation_items",
  );
  await page.goto("/ar/admin/settings/navigation");
  await page
    .locator("article")
    .filter({ hasText: nav.labelAr })
    .getByRole("button", { name: "تعديل الرابط" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("النص", { exact: true }).fill("نصي المحلي");
  expect(
    (
      await page.request.patch(`/api/v1/admin/site/navigation/${navId}`, {
        headers,
        data: { ...nav, labelAr: "الرابط الأحدث", editRevision: 1 },
      })
    ).ok(),
  ).toBeTruthy();
  await dialog.getByLabel("سبب التغيير").fill("اختبار تعارض الرابط");
  await dialog.getByRole("button", { name: "حفظ الرابط" }).click();
  await expect(
    dialog.getByRole("heading", { name: "تعارض في التعديلات" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "تطبيق الاختيارات على النموذج" })
    .click();
  await expect(dialog.getByLabel("النص", { exact: true })).toHaveValue(
    "الرابط الأحدث",
  );
  await dialog.getByRole("button", { name: "حفظ الرابط" }).click();
  await expect(dialog).toHaveCount(0);
  const p = {
    slug: `conflict-${marker}`,
    titleAr: `صفحة ${marker}`,
    introAr: "مقدمة",
    sectionTitle: "قسم",
    sectionBody: "قديم",
    reason: "اختبار صفحة",
  };
  const pageId = await created("/admin/site/pages", p, "public_pages");
  await page.goto("/ar/admin/settings/pages");
  await page
    .locator("article")
    .filter({ hasText: p.titleAr })
    .getByRole("button", { name: "تعديل الصفحة" })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("عنوان الصفحة").fill("عنواني المحلي");
  expect(
    (
      await page.request.patch(`/api/v1/admin/site/pages/${pageId}`, {
        headers,
        data: {
          eyebrowAr: "",
          titleAr: "عنوان أحدث",
          introAr: "مقدمة",
          sections: [{ title: "قسم أحدث", body: "نص أحدث" }],
          status: "DRAFT",
          editRevision: 1,
          reason: "تعديل آخر",
        },
      })
    ).ok(),
  ).toBeTruthy();
  await dialog.getByLabel("سبب التغيير").fill("تعارض صفحة");
  await dialog.getByRole("button", { name: "حفظ الصفحة" }).click();
  await expect(
    dialog.getByRole("heading", { name: "تعارض في التعديلات" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "تطبيق الاختيارات على النموذج" })
    .click();
  await expect(dialog.getByLabel("عنوان الصفحة")).toHaveValue("عنوان أحدث");
  await expect(dialog.getByLabel("عنوان القسم")).toHaveValue("قسم أحدث");
  await dialog.getByRole("button", { name: "حفظ الصفحة" }).click();
  await expect(dialog).toHaveCount(0);
  const key = `test.e2e.${marker}`;
  const db = await createDataSource().initialize();
  try {
    await db.query(
      "INSERT INTO platform_settings(setting_key,group_code,label_ar,input_type,value_json,is_public) VALUES (?,'BRANDING',?,'TEXT','\"قيمة قديمة\"',FALSE)",
      [key, `إعداد ${marker}`],
    );
    remember("platform_settings", key);
  } finally {
    await db.destroy();
  }
  await page.goto("/ar/admin/settings/general");
  await page.getByLabel(`إعداد ${marker}`).fill("قيمة محلية");
  expect(
    (
      await page.request.patch("/api/v1/admin/site/settings", {
        headers,
        data: {
          values: { [key]: "قيمة أحدث" },
          editRevisions: { [key]: 1 },
          reason: "تعديل متزامن لإعداد",
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.getByLabel("سبب التغيير").fill("تعارض إعداد");
  await page.getByRole("button", { name: "حفظ هذا القسم" }).click();
  await expect(
    page.getByRole("heading", { name: "تعارض في التعديلات" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "تطبيق الاختيارات على النموذج" })
    .click();
  await expect(page.getByLabel(`إعداد ${marker}`, { exact: true })).toHaveValue(
    "قيمة أحدث",
  );
  await page.getByRole("button", { name: "حفظ هذا القسم" }).click();
  await expect(
    page.getByRole("heading", { name: "تعارض في التعديلات" }),
  ).toHaveCount(0);
});
