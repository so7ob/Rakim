import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createDataSource } from "../../apps/api/src/database/config.js";

const password = "DevOnly!ChangeMe2026";
let lawId: string;
let targetId: string;
let relationId: string | undefined;

test.beforeAll(async () => {
  const db = await createDataSource().initialize();
  try {
    const [references] = await db.query(
      "SELECT (SELECT id FROM legislation_types WHERE is_active=TRUE LIMIT 1) typeId,(SELECT id FROM authorities WHERE is_active=TRUE LIMIT 1) authorityId",
    );
    lawId = randomUUID();
    targetId = randomUUID();
    await db.query(
      `INSERT INTO legislations
       (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
       VALUES (?,?,?,2026,?,'PUBLISHED','IN_FORCE','D'),
              (?,?,?,2026,?,'PUBLISHED','IN_FORCE','D')`,
      [
        lawId,
        references.typeId,
        references.authorityId,
        `تشريع مصدر لاختبار العلاقات ${lawId.slice(0, 8)}`,
        targetId,
        references.typeId,
        references.authorityId,
        `تشريع مقابل لاختبار العلاقات ${targetId.slice(0, 8)}`,
      ],
    );
  } finally {
    await db.destroy();
  }
});

test.afterAll(async () => {
  if (!lawId || !targetId) return;
  const db = await createDataSource().initialize();
  try {
    if (relationId)
      await db.query("DELETE FROM legal_relations WHERE id=?", [relationId]);
    await db.query(
      "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId')) IN (?,?)",
      [lawId, targetId],
    );
    await db.query(
      "DELETE FROM search_documents WHERE legislation_id IN (?,?)",
      [lawId, targetId],
    );
    await db.query("DELETE FROM legislations WHERE id IN (?,?)", [
      lawId,
      targetId,
    ]);
  } finally {
    await db.destroy();
  }
});

test("creates, reviews, publishes, rejects and returns an Arabic legal relation", async ({
  page,
}, testInfo) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(testInfo.project.name));
  expect(lawId).toBeTruthy();
  expect(targetId).toBeTruthy();
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("super");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  const adminResponse = await page.request.get(
    `/api/v1/admin/legislations/${lawId}`,
  );
  expect(adminResponse.ok(), await adminResponse.text()).toBeTruthy();
  await page.goto(`/ar/admin/content/${lawId}/relations`, {
    waitUntil: "networkidle",
  });
  await expect(
    page.getByRole("heading", { name: "العلاقات القانونية" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /إضافة علاقة/ }).click();
  const create = page.getByRole("dialog", { name: "إضافة علاقة قانونية" });
  await create.getByLabel("التشريع المقابل").selectOption(targetId);
  await create.getByLabel("نوع العلاقة").selectOption("TOPICALLY_RELATED");
  await expect(create.getByLabel("نوع العلاقة")).toHaveValue(
    "TOPICALLY_RELATED",
  );
  await expect(
    create.getByLabel("نوع العلاقة").locator("option:checked"),
  ).toHaveText("مرتبط موضوعيًا");
  await expect(create.getByLabel(/المراجعة|الحالة/)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("relation-arabic-create-dialog.png"),
    animations: "disabled",
  });
  await create.getByLabel("سبب الإضافة").fill("إنشاء علاقة لاختبار دورة النشر");
  await create.getByRole("button", { name: "إضافة العلاقة" }).click();
  await expect(create).toBeHidden();

  const detail = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/admin/legislations/${id}`);
    return response.json();
  }, lawId);
  relationId = detail.relations.find(
    (item: { targetLegislationId: string; relationType: string }) =>
      item.targetLegislationId === targetId &&
      item.relationType === "TOPICALLY_RELATED",
  )?.id;
  expect(relationId).toBeTruthy();
  const card = page
    .locator("article.admin-list-card")
    .filter({ hasText: "مرتبط موضوعيًا" });
  await expect(card).toContainText("مسودة");
  await expect(card).not.toContainText("TOPICALLY_RELATED");
  const hidden = await page.request.get(
    `/api/v1/legislations/${lawId}/relations`,
  );
  expect(
    ((await hidden.json()) as Array<{ id: string }>).some(
      (item) => item.id === relationId,
    ),
  ).toBeFalsy();

  const anonymous = await playwrightRequest.newContext({
    baseURL: new URL(page.url()).origin,
  });
  const unauthenticated = await anonymous.post(
    `/api/v1/admin/relations/${relationId}/transition`,
    {
      data: {
        action: "review",
        editFingerprint: "a".repeat(64),
        reason: "رفض وصول مباشر",
      },
    },
  );
  expect(unauthenticated.status()).toBe(401);
  await anonymous.dispose();
  const csrfStatus = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/admin/relations/${id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "review",
        editFingerprint: "a".repeat(64),
        reason: "رفض طلب دون CSRF",
      }),
    });
    return response.status;
  }, relationId);
  expect(csrfStatus).toBe(403);

  await card.getByRole("button", { name: "اعتماد المراجعة" }).click();
  const review = page.getByRole("dialog", { name: "اعتماد المراجعة" });
  await review.getByLabel("سبب الإجراء").fill("مراجعة العلاقة في الاختبار");
  await review.getByRole("button", { name: "اعتماد المراجعة" }).click();
  await expect(card).toContainText("مراجعة مكتملة وجاهزة للنشر");
  await page.screenshot({
    path: testInfo.outputPath("relation-reviewed-card.png"),
    animations: "disabled",
  });
  await card.getByRole("button", { name: "نشر", exact: true }).click();
  const publish = page.getByRole("dialog", { name: "نشر" });
  await publish.getByLabel("سبب الإجراء").fill("نشر العلاقة بعد المراجعة");
  await publish.getByRole("button", { name: "نشر", exact: true }).click();
  await expect(card).toContainText("منشور");
  await page.screenshot({
    path: testInfo.outputPath("relation-published-card.png"),
    animations: "disabled",
  });
  const visible = (await (
    await page.request.get(`/api/v1/legislations/${lawId}/relations`)
  ).json()) as Array<{ id: string; relationTypeLabel: string }>;
  expect(visible).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: relationId,
        relationTypeLabel: "مرتبط موضوعيًا",
      }),
    ]),
  );
  await card.getByRole("button", { name: "إعادة إلى المسودة" }).click();
  const returned = page.getByRole("dialog", { name: "إعادة إلى المسودة" });
  await expect(returned).toContainText("ستُسحب العلاقة من العرض العام");
  await returned.getByLabel("سبب الإجراء").fill("سحب العلاقة لاختبار التعديل");
  await returned.getByRole("button", { name: "إعادة إلى المسودة" }).click();
  await expect(card).toContainText("مسودة");
  await card.getByRole("button", { name: "رفض" }).click();
  const reject = page.getByRole("dialog", { name: "رفض" });
  await reject.getByLabel("سبب الإجراء").fill("رفض العلاقة في الاختبار");
  await reject.getByRole("button", { name: "رفض", exact: true }).click();
  await expect(card).toContainText("مرفوضة");
  expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
