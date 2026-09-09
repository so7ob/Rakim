import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";

let records: Record<string, string[]> = {};
const remember = (table: string, id: string) => {
  (records[table] ??= []).push(id);
  return id;
};
test.afterEach(async () => {
  const db = await createDataSource().initialize();
  const q = db.createQueryRunner();
  await q.connect();
  try {
    await q.query("SET @ylp_maintenance=1");
    for (const id of Object.values(records).flat())
      await q.query("DELETE FROM audit_logs WHERE entity_id=?", [id]);
    for (const id of records.legislations ?? []) {
      for (const table of [
        "legislation_versions",
        "content_responsibilities",
        "workflow_events",
        "legislation_source_documents",
        "search_documents",
      ])
        await q.query(`DELETE FROM ${table} WHERE legislation_id=?`, [id]);
      await q.query(
        "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
        [id],
      );
    }
    for (const table of [
      "amendments",
      "source_imports",
      "legislations",
      "source_documents",
      "public_pages",
      "legislation_types",
      "subjects",
      "authorities",
      "gazette_issues",
    ])
      for (const id of records[table] ?? [])
        await q.query(`DELETE FROM ${table} WHERE id=?`, [id]);
  } finally {
    records = {};
    await q.query("SET @ylp_maintenance=0");
    await q.release();
    await db.destroy();
  }
});

async function remove(page: Page, row: Locator) {
  await row.getByRole("button", { name: "حذف", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("سبب الإجراء").fill("حذف سجل اختبار مستقل");
  await dialog.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
}

test("SUPER can delete in all eight management pages and create public pages without manual grants", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const login = await page.request.post("/api/v1/auth/login", {
    data: { username: "super", password: "DevOnly!ChangeMe2026" },
  });
  expect(login.ok()).toBeTruthy();
  const session = await login.json();
  const headers = { "x-csrf-token": session.csrfToken };
  const catalog = await (
    await page.request.get("/api/v1/admin/permissions")
  ).json();
  expect(session.user.permissions.length).toBe(catalog.permissions.length);
  const unique = randomUUID().slice(0, 8);
  const create = async (path: string, data: unknown, table: string) => {
    const response = await page.request.post(`/api/v1${path}`, {
      headers,
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = await response.json();
    remember(table, body.id);
    return body;
  };
  for (const [kind, table] of [
    ["types", "legislation_types"],
    ["subjects", "subjects"],
    ["authorities", "authorities"],
  ]) {
    const name = `مرجع اختبار ${kind} ${unique}`;
    await create(
      `/admin/reference-data/${kind}`,
      {
        code: `E_${unique}_${kind}`,
        nameAr: name,
        isActive: true,
        reason: "إضافة اختبار",
      },
      table!,
    );
    await page.goto(`/ar/admin/reference-data/${kind}`);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row.getByText("فعال إدارياً", { exact: true })).toBeVisible();
    await remove(page, row);
  }
  const issueNumber = `اختبار-${unique}`;
  await create(
    "/admin/gazette-issues",
    {
      issueNumber,
      publicationDate: "2026-01-01",
      publisher: "ناشر اختبار",
      reason: "إضافة عدد مستقل",
    },
    "gazette_issues",
  );
  await page.goto("/ar/admin/reference-data/gazettes");
  await remove(
    page,
    page.locator("article").filter({
      has: page.getByRole("heading", {
        name: `العدد ${issueNumber}`,
        exact: true,
      }),
    }),
  );

  const refs = await (
    await page.request.get("/api/v1/admin/references")
  ).json();
  const title = `تشريع حذف وحالات ${unique}`;
  const law = await create(
    "/legislations",
    {
      titleAr: title,
      typeId: refs.types[0].id,
      authorityId: refs.authorities[0].id,
      year: 2026,
    },
    "legislations",
  );
  await page.goto(`/ar/admin/content?q=${encodeURIComponent(title)}`);
  const lawRow = page.getByRole("row").filter({ hasText: title });
  await expect(
    page.getByRole("columnheader", { name: "الحالة القانونية", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "سير العمل", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "الحالة الإدارية", exact: true }),
  ).toBeVisible();
  await expect(lawRow.getByText("مسودة", { exact: true })).toBeVisible();
  await lawRow
    .getByRole("button", { name: "تعطيل إداري", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("سبب الإجراء")
    .fill("اختبار فصل الحالة الإدارية");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "تعطيل إداري", exact: true })
    .click();
  await expect(lawRow.getByText("معطل إدارياً", { exact: true })).toBeVisible();
  await expect(lawRow.getByText("مسودة", { exact: true })).toBeVisible();
  await expect(lawRow.getByText("غير محدد", { exact: true })).toBeVisible();
  await page.reload();
  const detail = await (
    await page.request.get(`/api/v1/admin/legislations/${law.id}`)
  ).json();
  expect(detail).toMatchObject({
    status: "DRAFT",
    legal_status: "UNKNOWN",
    is_active: 0,
  });
  await page.screenshot({
    path: testInfo.outputPath("separate-legislation-statuses.png"),
    fullPage: true,
  });
  await remove(page, lawRow);

  // An isolated import with a completed failure has no file/history dependencies.
  const db = await createDataSource().initialize();
  const sourceId = remember("source_documents", randomUUID());
  const importId = remember("source_imports", randomUUID());
  const amendmentSource = remember("source_documents", randomUUID());
  const sourceName = `مصدر حذف ${unique}.txt`;
  const amended = await create(
    "/legislations",
    {
      titleAr: `تشريع وثيقة ${unique}`,
      typeId: refs.types[0].id,
      authorityId: refs.authorities[0].id,
      year: 2026,
    },
    "legislations",
  );
  try {
    for (const [id, name, status] of [
      [sourceId, sourceName, "FAILED"],
      [amendmentSource, `مصدر وثيقة ${unique}.txt`, "REVIEWED"],
    ])
      await db.query(
        "INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,reviewed_at,created_by) VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار مستقل',?,NOW(3),?)",
        [
          id,
          name,
          `tests/${id}`,
          createHash("sha256").update(id!).digest("hex"),
          status,
          session.user.id,
        ],
      );
    await db.query(
      "INSERT INTO source_imports (id,source_document_id,uploaded_by,status,detected_format) VALUES (?,?,?,'FAILED','txt')",
      [importId, sourceId, session.user.id],
    );
    await db.query(
      "UPDATE legislations SET status='PUBLISHED',legal_status='IN_FORCE' WHERE id=?",
      [amended.id],
    );
  } finally {
    await db.destroy();
  }
  await page.goto("/ar/admin/imports");
  const importCard = page.locator("article.admin-card").filter({
    has: page.locator("summary strong").filter({ hasText: sourceName }),
  });
  await expect(importCard.locator("details.import-row")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(
    importCard.getByRole("button", { name: "حذف", exact: true }),
  ).toBeVisible();
  await remove(page, importCard);
  expect((await page.request.get(`/api/v1/imports/${importId}`)).status()).toBe(
    404,
  );
  const documentTitle = `وثيقة حذف ${unique}`;
  await create(
    "/admin/amendments",
    {
      legislationId: amended.id,
      sourceDocumentId: amendmentSource,
      titleAr: documentTitle,
      effectiveFrom: "2026-06-01",
      operations: [
        {
          operationType: "ADD",
          citationText: "نص استناد اختبار",
          newLabel: "1",
          sortKey: "000001",
          newText: "مادة اختبار مستقلة",
        },
      ],
    },
    "amendments",
  );
  await page.goto("/ar/admin/amendments");
  await remove(
    page,
    page.locator("article.admin-card").filter({
      has: page.getByRole("heading", { name: documentTitle, exact: true }),
    }),
  );
  expect(
    (
      await page.request.patch(
        `/api/v1/admin/lifecycle/legislations/${amended.id}`,
        {
          headers,
          data: {
            action: "delete",
            reason: "منع حذف تشريع منشور حتى لدور SUPER",
          },
        },
      )
    ).status(),
  ).toBe(409);

  await page.goto("/ar/admin/settings/pages");
  await page
    .getByRole("button", { name: "+ إضافة صفحة عامة", exact: true })
    .click();
  const pageDialog = page.getByRole("dialog", {
    name: "إضافة صفحة عامة",
    exact: true,
  });
  const pageTitle = `صفحة اختبار ${unique}`;
  await pageDialog.getByLabel("الرابط بعد /ar/pages/").fill(`test-${unique}`);
  await pageDialog.getByLabel("عنوان الصفحة", { exact: true }).fill(pageTitle);
  await pageDialog.getByLabel("عنوان القسم الأول").fill("عنوان اختبار");
  await pageDialog.getByLabel("محتوى القسم الأول").fill("نص تجريبي مستقل");
  await pageDialog
    .getByLabel("سبب الإضافة")
    .fill("اختبار إنشاء صفحة بدور SUPER");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/admin/site/pages") &&
      r.request().method() === "POST",
  );
  await pageDialog.getByRole("button", { name: "حفظ", exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBeTruthy();
  remember("public_pages", (await response.json()).id);
  await expect(pageDialog).toBeHidden();
  const pageCard = page.locator("article.admin-list-card").filter({
    has: page.getByRole("heading", { name: pageTitle, exact: true }),
  });
  await expect(pageCard).toBeVisible();
  await page.reload();
  await expect(pageCard).toBeVisible();
  await remove(page, pageCard);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
