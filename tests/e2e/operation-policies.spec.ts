import { createHash, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createDataSource } from "../../apps/api/src/database/config.js";
import { hashPassword } from "../../apps/api/src/auth/password.js";

const password = "DevOnly!ChangeMe2026";
async function fixture() {
  const db = await createDataSource().initialize();
  const userId = randomUUID(),
    lawId = randomUUID(),
    articleId = randomUUID(),
    sourceId = randomUUID(),
    username = `policy_e2e_${userId.slice(0, 8)}`;
  const [refs] = await db.query(
    "SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId,(SELECT id FROM roles WHERE code='SUPER') roleId",
  );
  await db.query(
    "INSERT INTO users (id,username,display_name,password_hash) VALUES (?,?,?,?)",
    [
      userId,
      username,
      "مستخدم اختبار الاستثناءات",
      await hashPassword(password),
    ],
  );
  await db.query("INSERT INTO user_roles (user_id,role_id) VALUES (?,?)", [
    userId,
    refs.roleId,
  ]);
  await db.query(
    "INSERT INTO source_documents (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,extraction_status,reviewed_at,created_by) VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار المتصفح','REVIEWED',NOW(3),?)",
    [
      sourceId,
      `policy-${sourceId}`,
      `tests/${sourceId}.txt`,
      createHash("sha256").update(sourceId).digest("hex"),
      userId,
    ],
  );
  await db.query(
    "INSERT INTO legislations (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level,effective_from) VALUES (?,?,?,2026,'قانون اصطناعي لاختبار الاستثناء','PUBLISHED','IN_FORCE','A','2026-01-01')",
    [lawId, refs.typeId, refs.authorityId],
  );
  await db.query(
    "INSERT INTO legislation_versions (id,legislation_id,version_no,workflow_status,content_kind,source_document_id,valid_from,published_at,preamble_text) VALUES (?,?,1,'PUBLISHED','EXTRACTED',?,'2026-01-01',NOW(3),'ديباجة الاختبار')",
    [randomUUID(), lawId, sourceId],
  );
  await db.query(
    "INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key) VALUES (?,?,'1','1','0001')",
    [articleId, lawId],
  );
  await db.query(
    "INSERT INTO article_versions (id,article_id,version_no,text_original,text_structured,text_normalized,valid_from,status,source_document_id) VALUES (?,?,1,'نص منشور أصلي','نص منشور أصلي','نص منشور اصلي','2026-01-01','PUBLISHED',?)",
    [randomUUID(), articleId, sourceId],
  );
  return {
    db,
    userId,
    lawId,
    articleId,
    sourceId,
    username,
    async cleanup() {
      const q = db.createQueryRunner();
      await q.connect();
      try {
        await q.query("SET @ylp_maintenance=1");
        const batches = await q.query(
          "SELECT id FROM deletion_batches WHERE root_id=?",
          [lawId],
        );
        for (const batch of batches)
          await q.query(
            "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.deletionBatchId'))=?",
            [batch.id],
          );
        await q.query("DELETE FROM deletion_batches WHERE root_id=?", [lawId]);
        await q.query(
          "DELETE FROM content_corrections WHERE legislation_id=?",
          [lawId],
        );
        await q.query(
          "UPDATE article_versions SET previous_version_id=NULL WHERE article_id=?",
          [articleId],
        );
        await q.query("DELETE FROM article_versions WHERE article_id=?", [
          articleId,
        ]);
        await q.query(
          "UPDATE legislation_versions SET previous_version_id=NULL WHERE legislation_id=?",
          [lawId],
        );
        await q.query(
          "DELETE FROM legislation_versions WHERE legislation_id=?",
          [lawId],
        );
        await q.query("DELETE FROM legislations WHERE id=?", [lawId]);
        await q.query("DELETE FROM source_documents WHERE id=?", [sourceId]);
        await q.query(
          "DELETE FROM job_queue WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.legislationId'))=?",
          [lawId],
        );
        await q.query("DELETE FROM audit_logs WHERE actor_id=?", [userId]);
        await q.query("DELETE FROM user_permissions WHERE user_id=?", [userId]);
        await q.query("DELETE FROM users WHERE id=?", [userId]);
      } finally {
        await q.query("SET @ylp_maintenance=0");
        await q.release();
        await db.destroy();
      }
    },
  };
}
async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin/);
}

test("policy exceptions allow published deletion and revocation invalidates sessions", async ({
  page,
}, info) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(info.project.name));
  const f = await fixture();
  try {
    await login(page, f.username);
    let status = await (await page.request.get("/api/v1/auth/status")).json();
    const impactPath = `/api/v1/admin/lifecycle/legislations/${f.lawId}/delete-impact`;
    const initial = await (await page.request.get(impactPath)).json();
    expect(initial.allowed).toBe(false);
    expect(initial.policyChecks.filter((p: any) => !p.allowed)).toHaveLength(3);
    await page.goto("/ar/admin/settings/workflow?category=DELETION");
    await expect(
      page.getByRole("navigation", { name: "تصنيفات السياسات" }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /حماية التشريع خارج المسودة/ }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("deletion-policies.png"),
      fullPage: false,
      scale: "css",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    for (const code of [
      "DELETE_LEGISLATION_HISTORY",
      "DELETE_LEGISLATION_VERSIONS",
      "DELETE_ARTICLE_HISTORY",
    ]) {
      const result = await page.request.patch(
        `/api/v1/admin/workflow-policies/${code}/overrides`,
        {
          headers: { "x-csrf-token": status.csrfToken },
          data: { userIds: [f.userId], reason: "استثناء اختبار الحذف" },
        },
      );
      expect(result.ok()).toBe(true);
      // Each mutation revokes this user's session; a fresh login is required.
      expect(
        (await (await page.request.get("/api/v1/auth/status")).json()).user,
      ).toBeNull();
      await login(page, f.username);
      status = await (await page.request.get("/api/v1/auth/status")).json();
    }
    const impact = await (await page.request.get(impactPath)).json();
    expect(impact.allowed).toBe(true);
    await page.goto(`/ar/admin/content/${f.lawId}/general`);
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /أثر حذف/ })).toBeVisible();
    await expect(page.getByText(/مسموح باستثناء المستخدم/)).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("published-delete-exception.png"),
      fullPage: false,
      scale: "css",
    });
    const response = await page.request.patch(
      `/api/v1/admin/lifecycle/legislations/${f.lawId}`,
      {
        headers: { "x-csrf-token": status.csrfToken },
        data: {
          action: "delete",
          reason: "حذف منشور من اختبار المتصفح",
          impactToken: impact.impactToken,
        },
      },
    );
    expect(response.ok()).toBe(true);
    const removed = await response.json();
    const restored = await page.request.post(
      `/api/v1/admin/deletions/${removed.batchId}/restore`,
      {
        headers: { "x-csrf-token": status.csrfToken },
        data: { reason: "استعادة اختبار المتصفح" },
      },
    );
    expect(restored.ok()).toBe(true);
    const revoked = await page.request.patch(
      "/api/v1/admin/workflow-policies/DELETE_ARTICLE_HISTORY/overrides",
      {
        headers: { "x-csrf-token": status.csrfToken },
        data: { userIds: [], reason: "إلغاء الاستثناء للاختبار" },
      },
    );
    expect(revoked.ok()).toBe(true);
    await login(page, f.username);
    expect((await (await page.request.get(impactPath)).json()).allowed).toBe(
      false,
    );
  } finally {
    await f.cleanup();
  }
});

test("correction UI stages text and enforces API permissions and CSRF", async ({
  page,
  request,
}, info) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(info.project.name));
  const f = await fixture();
  try {
    expect(
      (
        await request.get(`/api/v1/admin/corrections/legislations/${f.lawId}`)
      ).status(),
    ).toBe(401);
    await f.db.query(
      "INSERT INTO user_permissions (user_id,permission_code,granted_by,grant_reason) VALUES (?,'workflow.edit_article_history.override',?,'اختبار التصحيح')",
      [f.userId, f.userId],
    );
    await login(page, f.username);
    expect(
      (
        await page.request.post(
          `/api/v1/admin/corrections/ARTICLE/${f.articleId}`,
          {
            data: {
              payload: { text: "تصحيح" },
              effectiveFrom: "2026-02-01",
              reason: "طلب دون CSRF",
            },
          },
        )
      ).status(),
    ).toBe(403);
    await page.goto(`/ar/admin/content/${f.lawId}/corrections`);
    await page
      .getByRole("button", { name: "إنشاء مسودة تصحيح", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "إنشاء مسودة تصحيح" });
    await dialog.getByLabel("نوع المحتوى").selectOption("ARTICLE");
    await dialog.getByLabel("المحتوى المصحح").fill("نص التصحيح المقترح");
    await dialog.getByLabel("تاريخ أثر التصحيح").fill("2026-02-01");
    await dialog
      .getByLabel("سبب التصحيح")
      .fill("تصحيح اصطناعي لاختبار المتصفح");
    await page.screenshot({
      path: info.outputPath("correction-draft.png"),
      fullPage: false,
      scale: "css",
    });
    await dialog.getByRole("button", { name: "حفظ مسودة التصحيح" }).click();
    await expect(dialog).toBeHidden();
    expect(
      (
        await f.db.query(
          "SELECT text_original FROM article_versions WHERE article_id=?",
          [f.articleId],
        )
      )[0].text_original,
    ).toBe("نص منشور أصلي");
    await page.reload();
    await expect(
      page.getByText("تصحيح مادة — مسودة", { exact: false }),
    ).toBeVisible();
    const reader = await request.post("/api/v1/auth/login", {
      data: { username: "reader", password },
    });
    const readerBody = await reader.json();
    expect(
      (
        await request.post(`/api/v1/admin/corrections/ARTICLE/${f.articleId}`, {
          headers: { "x-csrf-token": readerBody.csrfToken },
          data: {
            payload: { text: "نص" },
            effectiveFrom: "2026-02-01",
            reason: "قارئ بلا صلاحية",
          },
        })
      ).status(),
    ).toBe(403);
  } finally {
    await f.cleanup();
  }
});

test("deletes an instrument while preserving its external amendment and restoring the link", async ({
  page,
}, info) => {
  test.skip(!["desktop-1440", "mobile-390"].includes(info.project.name));
  const f = await fixture(),
    outside = await fixture(),
    amendmentId = randomUUID();
  try {
    await f.db.query(
      "UPDATE legislations SET title_ar='سند تعديل اصطناعي للاختبار' WHERE id=?",
      [f.lawId],
    );
    await f.db.query(
      "INSERT INTO amendments (id,amended_legislation_id,instrument_legislation_id,title_ar,effective_from,source_document_id,status) VALUES (?,?,?,'وثيقة تعديل محفوظة للقانون الآخر','2026-01-01',?,'PUBLISHED')",
      [amendmentId, outside.lawId, f.lawId, outside.sourceId],
    );
    for (const [index, operation] of ["REPEAL", "ADD"].entries())
      await f.db.query(
        "INSERT INTO amendment_operations (id,amendment_id,operation_type,target_kind,target_id,effective_from,application_order,citation_text,source_document_id) VALUES (?,?,?,'ARTICLE',?,'2026-01-01',?,'استناد اختبار',?)",
        [
          randomUUID(),
          amendmentId,
          operation,
          outside.articleId,
          index + 1,
          outside.sourceId,
        ],
      );
    for (const permission of [
      "workflow.delete_legislation_history.override",
      "workflow.delete_legislation_versions.override",
      "workflow.delete_article_history.override",
    ])
      await f.db.query(
        "INSERT INTO user_permissions (user_id,permission_code,granted_by,grant_reason) VALUES (?,?,?,'استثناء اختبار السند')",
        [f.userId, permission, f.userId],
      );
    await login(page, f.username);
    await page.goto(`/ar/admin/content/${f.lawId}/general`);
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: /أثر حذف/ });
    const retained = dialog
      .locator("details")
      .filter({ hasText: "وثائق تعديل ستبقى محفوظة" });
    await expect(retained).toContainText("وثيقة تعديل محفوظة للقانون الآخر");
    await expect(
      dialog.getByRole("button", { name: "نقل إلى السلة" }),
    ).toBeEnabled();
    await expect(dialog.getByText("لا يمكن حذف هذه المجموعة:")).toHaveCount(0);
    await retained.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("retained-amendment-instrument.png"),
      scale: "css",
    });
    await dialog
      .getByLabel("سبب الحذف")
      .fill("حذف السند مع الاحتفاظ بوثيقة التعديل");
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/admin/lifecycle/legislations/${f.lawId}`) &&
        r.request().method() === "PATCH",
    );
    await dialog.getByRole("button", { name: "نقل إلى السلة" }).click();
    const deletion = await response;
    expect(deletion.ok()).toBe(true);
    const { batchId } = await deletion.json();
    const [am] = await f.db.query(
      "SELECT deleted_at,status,instrument_legislation_id FROM amendments WHERE id=?",
      [amendmentId],
    );
    expect(am.deleted_at).toBeNull();
    expect(am.status).toBe("PUBLISHED");
    expect(am.instrument_legislation_id).toBe(f.lawId);
    const publicLaw = await page.request.get(
      `/api/v1/legislations/${outside.lawId}`,
    );
    expect(publicLaw.ok()).toBe(true);
    const status = await (await page.request.get("/api/v1/auth/status")).json();
    expect(
      (
        await page.request.post(`/api/v1/admin/deletions/${batchId}/restore`, {
          headers: { "x-csrf-token": status.csrfToken },
          data: { reason: "استعادة سند التعديل" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await f.db.query("SELECT deleted_at FROM legislations WHERE id=?", [
          f.lawId,
        ])
      )[0].deleted_at,
    ).toBeNull();
  } finally {
    await f.db.query("DELETE FROM amendments WHERE id=?", [amendmentId]);
    await outside.cleanup();
    await f.cleanup();
  }
});
