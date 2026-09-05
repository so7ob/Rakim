import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const password = "DevOnly!ChangeMe2026";

async function login(
  request: import("@playwright/test").APIRequestContext,
  username: string,
) {
  const response = await request.post("/api/v1/auth/login", {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  const cookie = response.headers()["set-cookie"].split(";")[0];
  return { cookie, csrfToken: body.csrfToken };
}

test("admin endpoints require an authenticated role and CSRF for changes", async ({
  request,
}) => {
  expect((await request.get("/api/v1/auth/status")).status()).toBe(200);
  expect(await (await request.get("/api/v1/auth/status")).json()).toEqual({
    user: null,
    csrfToken: "",
  });
  expect((await request.get("/api/v1/admin/dashboard")).status()).toBe(401);
  const reader = await login(request, "reader");
  expect(
    (
      await request.get("/api/v1/admin/dashboard", {
        headers: { cookie: reader.cookie },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get("/api/v1/admin/workflow-policies", {
        headers: { cookie: reader.cookie },
      })
    ).status(),
  ).toBe(403);
  const system = await login(request, "system_admin");
  expect(
    (
      await request.get("/api/v1/admin/users", {
        headers: { cookie: system.cookie },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.get("/api/v1/admin/workflow-policies", {
        headers: { cookie: system.cookie },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.patch(
        "/api/v1/admin/workflow-policies/LEGISLATION_SELF_APPROVAL",
        {
          headers: { cookie: system.cookie },
          data: { enabled: true, userIds: [], reason: "اختبار CSRF" },
        },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch("/api/v1/admin/users/not-a-user/state", {
        headers: { cookie: system.cookie },
        data: { active: false, reason: "اختبار حماية CSRF" },
      })
    ).status(),
  ).toBe(403);
  const dataEntry = await login(request, "data_entry");
  expect(
    (
      await request.get("/api/v1/imports", {
        headers: { cookie: dataEntry.cookie },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/v1/publications", {
        headers: {
          cookie: dataEntry.cookie,
          "x-csrf-token": dataEntry.csrfToken,
        },
        data: { legislationId: "none", reason: "اختبار رفض النشر" },
      })
    ).status(),
  ).toBe(403);
});

test("login leads to the allowed admin dashboard with no A/AA issues", async ({
  page,
}) => {
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("data_entry");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin$/);
  await expect(
    page.getByRole("heading", { name: "لوحة الإدارة" }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("successful form mutation resets safely without a manual reload", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("reader");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL(/\/ar\/admin\/no-permission$/);
  await page.goto("/ar/legislations");
  await page.locator(".law-row-title h2 a").first().click();
  const note = page.locator("details.tool-popover").filter({
    has: page.getByLabel("إضافة ملاحظة خاصة"),
  });
  await note.locator("summary").click();
  const input = note.getByLabel("نص الملاحظة");
  await input.fill(`اختبار تحديث تلقائي ${Date.now()}`);
  await note.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("حُفظت الملاحظة الخاصة.")).toBeVisible();
  await expect(input).toHaveValue("");
  expect(pageErrors).toEqual([]);
});

test("platform settings and full legislation metadata are manageable with audited roles", async ({
  request,
}) => {
  const system = await login(request, "system_admin");
  const stateResponse = await request.get("/api/v1/admin/site", {
    headers: { cookie: system.cookie },
  });
  expect(stateResponse.ok()).toBeTruthy();
  const state = await stateResponse.json();
  expect(
    state.settings.some(
      (item: { settingKey: string }) => item.settingKey === "theme.burgundy",
    ),
  ).toBeTruthy();
  const policyResponse = await request.get("/api/v1/admin/workflow-policies", {
    headers: { cookie: system.cookie },
  });
  expect(policyResponse.ok()).toBeTruthy();
  const policyState = await policyResponse.json();
  expect(policyState.policies).toHaveLength(5);
  expect(policyState.users.length).toBeGreaterThan(0);
  expect(
    state.settings.some(
      (item: { settingKey: string; value: boolean }) =>
        item.settingKey === "workflow.enforce_approval_separation" &&
        typeof item.value === "boolean",
    ),
  ).toBeTruthy();
  expect(state.pages.length).toBeGreaterThanOrEqual(10);
  const siteName = state.settings.find(
    (item: { settingKey: string }) => item.settingKey === "branding.site_name",
  ).value;
  const save = await request.patch("/api/v1/admin/site/settings", {
    headers: { cookie: system.cookie, "x-csrf-token": system.csrfToken },
    data: {
      values: { "branding.site_name": siteName },
      reason: "اختبار حفظ إعدادات المنصة",
    },
  });
  expect(save.ok()).toBeTruthy();
  const publicConfig = await (await request.get("/api/v1/site/config")).json();
  expect(publicConfig.settings["branding.site_name"]).toBe(siteName);

  const contentManager = await login(request, "content_manager");
  expect(
    (
      await request.patch("/api/v1/admin/site/settings", {
        headers: {
          cookie: contentManager.cookie,
          "x-csrf-token": contentManager.csrfToken,
        },
        data: {
          values: { "branding.site_name": siteName },
          reason: "اختبار رفض صلاحية الإعدادات",
        },
      })
    ).status(),
  ).toBe(403);

  const content = await (
    await request.get("/api/v1/admin/legislations", {
      headers: { cookie: contentManager.cookie },
    })
  ).json();
  const detail = await (
    await request.get(`/api/v1/admin/legislations/${content.items[0].id}`, {
      headers: { cookie: contentManager.cookie },
    })
  ).json();
  expect(detail).toHaveProperty("gazette");
  expect(detail).toHaveProperty("selectedSubjectIds");
  expect(detail.references.subjects.length).toBeGreaterThan(0);
  expect(detail).toHaveProperty("structures");
  expect(detail).toHaveProperty("annexes");
  expect(detail).toHaveProperty("relations");
});

test("system administrator can open the platform settings editor", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/ar/login");
  await page.getByLabel("اسم المستخدم").fill("system_admin");
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.getByRole("button", { name: "إعدادات المنصة" }).click();
  await page.getByRole("link", { name: "عام", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "إعدادات المنصة" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "الهوية والشعار" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "الهوية والمظهر" }).first().click();
  await expect(page).toHaveURL(/\/admin\/settings\/appearance$/);
  await expect(
    page.getByRole("heading", { name: "الألوان والتدرجات" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "الصفحات العامة" }).first().click();
  await expect(
    page.getByRole("heading", { name: "الصفحات العامة" }),
  ).toBeVisible();
  expect(await page.locator(".draft-article").count()).toBeGreaterThanOrEqual(
    10,
  );
  await page.getByRole("link", { name: "سياسات سير العمل" }).first().click();
  await expect(
    page.getByRole("heading", { name: "سياسات وضوابط سير العمل" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /لا يجوز/ })).toHaveCount(5);
  await page
    .getByRole("tab", {
      name: /لا يجوز لمن استورد أو حرر المحتوى أن يعتمد التشريع نفسه/,
    })
    .click();
  await expect(
    page.getByRole("tabpanel").getByRole("heading", {
      name: "لا يجوز لمن استورد أو حرر المحتوى أن يعتمد التشريع نفسه",
    }),
  ).toBeVisible();
  const system = await login(request, "system_admin");
  const policyState = await (
    await request.get("/api/v1/admin/workflow-policies", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const policy = policyState.policies.find(
    (item: { code: string }) => item.code === "LEGISLATION_SELF_APPROVAL",
  );
  const reader = policyState.users.find(
    (item: { username: string }) => item.username === "reader",
  );
  const originalUserIds = [...policy.userIds];
  try {
    const policyPanel = page.getByRole("tabpanel");
    const readerOverride = policyPanel
      .locator(".policy-user-options label")
      .filter({ hasText: "reader" })
      .getByRole("checkbox");
    if (await readerOverride.isChecked()) await readerOverride.uncheck();
    await readerOverride.check();
    await policyPanel
      .getByLabel("سبب التغيير")
      .fill("اختبار منح استثناء من صفحة السياسة");
    await policyPanel
      .getByRole("button", { name: "حفظ السياسة والاستثناءات" })
      .click();
    await expect(page.getByRole("status")).toContainText("حُفظت السياسة");
    await page.getByRole("button", { name: "المستخدمون والوصول" }).click();
    await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "المستخدمون" }),
    ).toBeVisible();
    const readerRow = page.getByRole("row").filter({
      has: page.getByText("reader", { exact: true }),
    });
    await expect(readerRow.getByText(policy.labelAr)).toBeVisible();
    await expect(readerRow.locator(".permission-editor")).toHaveCount(0);
  } finally {
    const restore = await request.patch(
      `/api/v1/admin/workflow-policies/${policy.code}`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          enabled: policy.enabled,
          userIds: originalUserIds,
          reason: "إعادة استثناءات السياسة بعد الاختبار",
        },
      },
    );
    expect(restore.ok()).toBeTruthy();
  }
});

test("granular permissions persist, enforce in the API, and drive navigation", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const system = await login(request, "system_admin");
  const catalogResponse = await request.get("/api/v1/admin/permissions", {
    headers: { cookie: system.cookie },
  });
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  expect(catalog.permissions.length).toBeGreaterThan(40);

  const users = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const readerUser = users.find(
    (item: { username: string }) => item.username === "reader",
  );
  const access = await (
    await request.get(`/api/v1/admin/users/${readerUser.id}/access`, {
      headers: { cookie: system.cookie },
    })
  ).json();
  const original = access.directOverrides.map(
    (item: { code: string; effect: string; scope: string }) => ({
      code: item.code,
      effect: item.effect,
      scope: item.scope,
    }),
  );
  try {
    const before = await login(request, "reader");
    expect(
      (
        await request.get("/api/v1/admin/quality", {
          headers: { cookie: before.cookie },
        })
      ).status(),
    ).toBe(403);

    const grant = await request.patch(
      `/api/v1/admin/users/${readerUser.id}/granular-permissions`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          selections: [
            ...original,
            { code: "quality.view", effect: "ALLOW", scope: "ALL" },
          ],
          reason: "اختبار ثبات الصلاحية المباشرة",
        },
      },
    );
    expect(grant.ok()).toBeTruthy();
    const after = await login(request, "reader");
    expect(
      (
        await request.get("/api/v1/admin/quality", {
          headers: { cookie: after.cookie },
        })
      ).status(),
    ).toBe(200);

    await page.goto("/ar/login");
    await page.getByLabel("اسم المستخدم").fill("reader");
    await page.getByLabel("كلمة المرور").fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/admin\/no-permission$/);
    await expect(
      page.getByRole("button", { name: "النظام والحوكمة" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "النظام والحوكمة" }).click();
    await expect(
      page.getByRole("link", { name: "جودة البيانات" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "المستخدمون والوصول" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "جودة البيانات" }).click();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "جودة البيانات" }),
    ).toBeVisible();
  } finally {
    const restore = await request.patch(
      `/api/v1/admin/users/${readerUser.id}/granular-permissions`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          selections: original,
          reason: "استعادة صلاحيات القارئ بعد الاختبار",
        },
      },
    );
    expect(restore.ok()).toBeTruthy();
  }
  const restored = await login(request, "reader");
  expect(
    (
      await request.get("/api/v1/admin/quality", {
        headers: { cookie: restored.cookie },
      })
    ).status(),
  ).toBe(403);
});

test("role permissions are inherited and removed with the role", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const system = await login(request, "system_admin");
  const users = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const readerUser = users.find(
    (item: { username: string }) => item.username === "reader",
  );
  const originalRoles = String(readerUser.roles ?? "")
    .split(",")
    .filter(Boolean);
  const code = `TEST_DASHBOARD_${Date.now()}`;
  let roleId = "";
  try {
    const create = await request.post("/api/v1/admin/access-roles", {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": system.csrfToken,
      },
      data: {
        code,
        nameAr: "دور اختبار مؤقت",
        descriptionAr: "يُحذف آليًا بعد اختبار توريث الصلاحيات.",
        reason: "اختبار إنشاء دور مخصص",
      },
    });
    expect(create.ok()).toBeTruthy();
    roleId = (await create.json()).id;
    const grant = await request.patch(
      `/api/v1/admin/access-roles/${roleId}/permissions`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          selections: [{ code: "dashboard.view", scope: "ALL" }],
          reason: "اختبار صلاحية موروثة من الدور",
        },
      },
    );
    expect(grant.ok()).toBeTruthy();
    const assign = await request.patch(
      `/api/v1/admin/users/${readerUser.id}/roles`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          roles: [...originalRoles, code],
          reason: "اختبار إسناد الدور المؤقت",
        },
      },
    );
    expect(assign.ok()).toBeTruthy();
    const inherited = await login(request, "reader");
    expect(
      (
        await request.get("/api/v1/admin/dashboard", {
          headers: { cookie: inherited.cookie },
        })
      ).status(),
    ).toBe(200);
    const access = await (
      await request.get(`/api/v1/admin/users/${readerUser.id}/access`, {
        headers: { cookie: system.cookie },
      })
    ).json();
    const effective = access.effectivePermissions.find(
      (item: { code: string }) => item.code === "dashboard.view",
    );
    expect(effective.allowed).toBe(true);
    expect(effective.source).toBe("ROLE");
    expect(
      effective.roles.some((role: { code: string }) => role.code === code),
    ).toBe(true);
  } finally {
    const restore = await request.patch(
      `/api/v1/admin/users/${readerUser.id}/roles`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          roles: originalRoles,
          reason: "استعادة أدوار القارئ بعد الاختبار",
        },
      },
    );
    expect(restore.ok()).toBeTruthy();
    if (roleId) {
      const remove = await request.delete(
        `/api/v1/admin/access-roles/${roleId}`,
        {
          headers: {
            cookie: system.cookie,
            "x-csrf-token": system.csrfToken,
          },
          data: { reason: "حذف دور الاختبار المؤقت" },
        },
      );
      expect(remove.ok()).toBeTruthy();
    }
  }
  const removed = await login(request, "reader");
  expect(
    (
      await request.get("/api/v1/admin/dashboard", {
        headers: { cookie: removed.cookie },
      })
    ).status(),
  ).toBe(403);
});
