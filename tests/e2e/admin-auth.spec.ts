import { PERMISSION_CATALOG } from "../../apps/api/src/common/permission-catalog.js";
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
  expect(policyState.users).toEqual([]);
  expect(
    policyState.policies.every(
      (item: { userIds: string[] }) => item.userIds.length === 0,
    ),
  ).toBeTruthy();
  expect(
    state.settings.some(
      (item: { groupCode: string }) => item.groupCode === "WORKFLOW",
    ),
  ).toBeFalsy();
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
  expect(await page.locator(".admin-list-card").count()).toBeGreaterThanOrEqual(
    10,
  );
  await expect(
    page.locator(
      ".admin-list-card input, .admin-list-card textarea, .admin-list-card select",
    ),
  ).toHaveCount(0);
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
  await expect(page.locator(".policy-user-options")).toHaveCount(0);
  const system = await login(request, "system_admin");
  const policyState = await (
    await request.get("/api/v1/admin/workflow-policies", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const policy = policyState.policies.find(
    (item: { code: string }) => item.code === "LEGISLATION_SELF_APPROVAL",
  );
  expect(policyState.users).toEqual([]);
  expect(policy.userIds).toEqual([]);
  const updatePolicy = await request.patch(
    `/api/v1/admin/workflow-policies/${policy.code}`,
    {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": system.csrfToken,
      },
      data: {
        enabled: policy.enabled,
        reason: "اختبار صلاحية تحديث إعداد السياسة دون إدارة الاستثناءات",
      },
    },
  );
  expect(updatePolicy.ok()).toBeTruthy();
  const deniedOverride = await request.patch(
    `/api/v1/admin/workflow-policies/${policy.code}/overrides`,
    {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": system.csrfToken,
      },
      data: {
        userIds: [],
        reason: "اختبار منع مدير النظام من إدارة الاستثناءات",
      },
    },
  );
  expect(deniedOverride.status()).toBe(403);

  const accessUsers = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const protectedAdmin = accessUsers.find((item: { roles: string | null }) =>
    String(item.roles ?? "")
      .split(",")
      .includes("SUPER"),
  );
  const superAdmin = await login(request, protectedAdmin.username);
  const privilegedState = await (
    await request.get("/api/v1/admin/workflow-policies", {
      headers: { cookie: superAdmin.cookie },
    })
  ).json();
  expect(privilegedState.users.length).toBeGreaterThan(0);
  const privilegedPolicy = privilegedState.policies.find(
    (item: { code: string }) => item.code === policy.code,
  );
  const reader = privilegedState.users.find(
    (item: { username: string }) => item.username === "reader",
  );
  const originalUserIds = [...privilegedPolicy.userIds];
  try {
    const grant = await request.patch(
      `/api/v1/admin/workflow-policies/${policy.code}/overrides`,
      {
        headers: {
          cookie: superAdmin.cookie,
          "x-csrf-token": superAdmin.csrfToken,
        },
        data: {
          userIds: [...new Set([...originalUserIds, reader.id])],
          reason: "اختبار منح استثناء من endpoint السياسة المنفصل",
        },
      },
    );
    expect(grant.ok()).toBeTruthy();
    const readerAuth = await login(request, "reader");
    const readerStatus = await (
      await request.get("/api/v1/auth/status", {
        headers: { cookie: readerAuth.cookie },
      })
    ).json();
    expect(readerStatus.user.permissions).not.toContain(
      privilegedPolicy.permissionCode,
    );
    expect(readerStatus.user.policyCapabilities).toContain(
      privilegedPolicy.permissionCode,
    );
  } finally {
    const restore = await request.patch(
      `/api/v1/admin/workflow-policies/${policy.code}/overrides`,
      {
        headers: {
          cookie: superAdmin.cookie,
          "x-csrf-token": superAdmin.csrfToken,
        },
        data: {
          userIds: originalUserIds,
          reason: "إعادة استثناءات السياسة بعد الاختبار",
        },
      },
    );
    expect(restore.ok()).toBeTruthy();
  }
});

test("authority ceiling blocks API privilege escalation and preserves role boundaries", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const system = await login(request, "system_admin");
  const deniedAuditBefore = await (
    await request.get("/api/v1/admin/audit", {
      headers: { cookie: system.cookie },
      params: { action: "DENY_ROLE_AUTHORITY_CEILING_BYPASS" },
    })
  ).json();
  const status = await (
    await request.get("/api/v1/auth/status", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const users = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const superUser = users.find((item: { roles: string | null }) =>
    String(item.roles ?? "")
      .split(",")
      .includes("SUPER"),
  );
  const roles = await (
    await request.get("/api/v1/admin/access-roles", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const superRole = roles.find(
    (item: { code: string }) => item.code === "SUPER",
  );

  const createSuper = await request.post("/api/v1/admin/users", {
    headers: {
      cookie: system.cookie,
      "x-csrf-token": status.csrfToken,
    },
    data: {
      username: `forbidden_super_${Date.now()}`,
      displayName: "محاولة تصعيد مرفوضة",
      password,
      roles: ["SUPER"],
    },
  });
  expect(createSuper.status()).toBe(403);
  expect(JSON.stringify(await createSuper.json())).toContain(
    "دورًا غير قابل للإسناد",
  );

  const selfRole = await request.patch(
    `/api/v1/admin/users/${status.user.id}/roles`,
    {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": status.csrfToken,
      },
      data: {
        roles: ["SYSTEM_ADMIN"],
        reason: "اختبار منع تعديل أدوار الحساب الحالي",
      },
    },
  );
  expect(selfRole.status()).toBe(403);

  const selfPermission = await request.patch(
    `/api/v1/admin/users/${status.user.id}/granular-permissions`,
    {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": status.csrfToken,
      },
      data: {
        selections: [
          { code: "legislation.publish", effect: "ALLOW", scope: "ALL" },
        ],
        reason: "اختبار منع منح الحساب الحالي",
      },
    },
  );
  expect(selfPermission.status()).toBe(403);

  const assignSuper = await request.patch(
    `/api/v1/admin/users/${users.find((item: { username: string }) => item.username === "reader").id}/roles`,
    {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": status.csrfToken,
      },
      data: {
        roles: ["SUPER"],
        reason: "اختبار سقف إسناد الدور الأعلى",
      },
    },
  );
  expect(assignSuper.status()).toBe(403);

  const mutateProtected = await request.patch(
    `/api/v1/admin/access-roles/${superRole.id}/permissions`,
    {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": status.csrfToken,
      },
      data: {
        selections: [],
        reason: "اختبار منع تفريغ الدور المحمي",
      },
    },
  );
  expect(mutateProtected.status()).toBe(403);

  const disableProtectedAdmin = () =>
    request.patch(`/api/v1/admin/users/${superUser.id}/state`, {
      headers: {
        cookie: system.cookie,
        "x-csrf-token": status.csrfToken,
      },
      data: { active: false, reason: "اختبار منع تعطيل السلطة الأعلى" },
    });
  const concurrentDisableAttempts = await Promise.all([
    disableProtectedAdmin(),
    disableProtectedAdmin(),
  ]);
  expect(
    concurrentDisableAttempts.map((response) => response.status()),
  ).toEqual([403, 403]);
  const usersAfterConcurrentAttempt = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: system.cookie },
    })
  ).json();
  expect(
    usersAfterConcurrentAttempt.find(
      (item: { id: string }) => item.id === superUser.id,
    ).isActive,
  ).toBeTruthy();
  const deniedAudit = await (
    await request.get("/api/v1/admin/audit", {
      headers: { cookie: system.cookie },
      params: { action: "DENY_ROLE_AUTHORITY_CEILING_BYPASS" },
    })
  ).json();
  expect(deniedAudit.meta.total).toBeGreaterThan(deniedAuditBefore.meta.total);
  expect(JSON.stringify(deniedAudit.items[0].afterValue)).toContain("DENIED");

  const [dataEntry, reviewer, contentManager, superAdmin] = await Promise.all([
    login(request, "data_entry"),
    login(request, "legal_reviewer"),
    login(request, "content_manager"),
    login(request, superUser.username),
  ]);
  const authStatus = async (cookie: string) =>
    (
      await (
        await request.get("/api/v1/auth/status", { headers: { cookie } })
      ).json()
    ).user;
  const [entryUser, reviewerUser, contentUser, superAuthUser] =
    await Promise.all([
      authStatus(dataEntry.cookie),
      authStatus(reviewer.cookie),
      authStatus(contentManager.cookie),
      authStatus(superAdmin.cookie),
    ]);
  expect(entryUser.permissions).toEqual(
    expect.arrayContaining(["legislation.prepare", "legislation.submit"]),
  );
  expect(entryUser.permissions).not.toContain("legislation.return");
  expect(reviewerUser.permissions).toContain("legislation.return");
  expect(reviewerUser.permissions).not.toContain("legislation.submit");
  expect(contentUser.permissions).toEqual(
    expect.arrayContaining(["annex.publish", "annex.replace", "annex.repeal"]),
  );
  expect(contentUser.permissions).not.toContain("relation.review");
  expect(status.user.permissions).not.toContain("legislation.publish");
  expect(status.user.permissions).not.toContain(
    "workflow_policy.overrides.manage",
  );
  expect(superAuthUser.permissions).toHaveLength(75);
  expect(superAuthUser.policyCapabilities).toEqual([]);
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
  expect(catalog.permissions).toHaveLength(PERMISSION_CATALOG.length);

  const users = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: system.cookie },
    })
  ).json();
  const readerUser = users.find(
    (item: { username: string }) => item.username === "reader",
  );
  const access = await (
    await request.get(`/api/v1/admin/users/${readerUser.id}/permissions`, {
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
    const persisted = await (
      await request.get(`/api/v1/admin/users/${readerUser.id}/permissions`, {
        headers: { cookie: system.cookie },
      })
    ).json();
    expect(persisted.directOverrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "quality.view",
          effect: "ALLOW",
          scope: "ALL",
        }),
      ]),
    );
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

test("a view-only role administrator cannot see or call delete", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const superAdmin = await login(request, "super");
  const users = await (
    await request.get("/api/v1/admin/users", {
      headers: { cookie: superAdmin.cookie },
    })
  ).json();
  const systemAdmin = users.find(
    (item: { username: string }) => item.username === "system_admin",
  );
  const access = await (
    await request.get(`/api/v1/admin/users/${systemAdmin.id}/permissions`, {
      headers: { cookie: superAdmin.cookie },
    })
  ).json();
  const original = access.directOverrides.map(
    (item: { code: string; effect: string; scope: string }) => ({
      code: item.code,
      effect: item.effect,
      scope: item.scope,
    }),
  );
  let roleId = "";

  try {
    const create = await request.post("/api/v1/admin/access-roles", {
      headers: {
        cookie: superAdmin.cookie,
        "x-csrf-token": superAdmin.csrfToken,
      },
      data: {
        code: `TEST_DELETE_DENY_${Date.now()}`,
        nameAr: "دور مؤقت لاختبار منع الحذف",
        descriptionAr: "يُحذف بعد التحقق من Canonical role.delete.",
        reason: "اختبار واجهة ومنفذ حذف غير مصرح",
      },
    });
    expect(create.ok()).toBeTruthy();
    roleId = (await create.json()).id;

    const denyDelete = await request.patch(
      `/api/v1/admin/users/${systemAdmin.id}/granular-permissions`,
      {
        headers: {
          cookie: superAdmin.cookie,
          "x-csrf-token": superAdmin.csrfToken,
        },
        data: {
          selections: [
            ...original.filter(
              (item: { code: string }) => item.code !== "role.delete",
            ),
            { code: "role.delete", effect: "DENY", scope: "ALL" },
          ],
          reason: "اختبار سحب صلاحية حذف الدور مؤقتًا",
        },
      },
    );
    expect(denyDelete.ok()).toBeTruthy();

    await page.goto("/ar/login");
    await page.getByLabel("اسم المستخدم").fill("system_admin");
    await page.getByLabel("كلمة المرور").fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page).toHaveURL(/\/ar\/admin$/);
    await page.goto(`/ar/admin/roles/${roleId}/general`);
    await expect(
      page.getByRole("heading", { name: "دور مؤقت لاختبار منع الحذف" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "حذف الدور المخصص" }),
    ).toHaveCount(0);

    const deniedActor = await login(request, "system_admin");
    const deniedDelete = await request.delete(
      `/api/v1/admin/access-roles/${roleId}`,
      {
        headers: {
          cookie: deniedActor.cookie,
          "x-csrf-token": deniedActor.csrfToken,
        },
        data: { reason: "يجب أن يرفض الخادم هذا الحذف" },
      },
    );
    expect(deniedDelete.status()).toBe(403);
    expect(
      (
        await request.get(`/api/v1/admin/access-roles/${roleId}`, {
          headers: { cookie: superAdmin.cookie },
        })
      ).status(),
    ).toBe(200);
  } finally {
    const restore = await request.patch(
      `/api/v1/admin/users/${systemAdmin.id}/granular-permissions`,
      {
        headers: {
          cookie: superAdmin.cookie,
          "x-csrf-token": superAdmin.csrfToken,
        },
        data: {
          selections: original,
          reason: "استعادة صلاحيات مدير النظام بعد اختبار منع الحذف",
        },
      },
    );
    expect(restore.ok()).toBeTruthy();
    if (roleId) {
      const remove = await request.delete(
        `/api/v1/admin/access-roles/${roleId}`,
        {
          headers: {
            cookie: superAdmin.cookie,
            "x-csrf-token": superAdmin.csrfToken,
          },
          data: { reason: "تنظيف الدور المؤقت بعد اختبار منع الحذف" },
        },
      );
      expect(remove.ok()).toBeTruthy();
    }
  }
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
    const rejectedScope = await request.patch(
      `/api/v1/admin/access-roles/${roleId}/permissions`,
      {
        headers: {
          cookie: system.cookie,
          "x-csrf-token": system.csrfToken,
        },
        data: {
          selections: [{ code: "dashboard.view", scope: "OWN" }],
          reason: "اختبار رفض نطاق غير معتمد",
        },
      },
    );
    expect(rejectedScope.status()).toBe(400);
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
      await request.get(`/api/v1/admin/users/${readerUser.id}/permissions`, {
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
