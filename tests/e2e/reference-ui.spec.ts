import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 1024 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

test("reference viewports have no overflow, missing assets, or UAE requests", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const failed: string[] = [];
  const consoleErrors: string[] = [];
  const referenceRequests: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (request.url().includes("uaelegislation.gov.ae"))
      referenceRequests.push(request.url());
  });
  page.on("requestfailed", (request) => failed.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().endsWith("/api/v1/auth/me"))
      failed.push(`${response.status()} ${response.url()}`);
  });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of ["/ar", "/ar/constitution"]) {
      await page.goto(path);
      await page
        .locator('[aria-busy="true"]')
        .waitFor({ state: "detached" })
        .catch(() => undefined);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        `${path} at ${viewport.width}`,
      ).toBeFalsy();
    }
  }
  expect(failed).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(referenceRequests).toEqual([]);
});

test("mobile menu and global search open, close, and work from the keyboard", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ar");
  const menu = page.getByRole("button", { name: "فتح القائمة" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "القائمة الرئيسية" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "القائمة الرئيسية" }),
  ).toBeHidden();
  await page.getByRole("button", { name: "فتح البحث" }).click();
  const search = page.getByRole("dialog", { name: "البحث في التشريعات" });
  await expect(search).toBeVisible();
  await expect(
    search.getByLabel("العنوان أو الرقم أو نص المادة"),
  ).toBeFocused();
  await search.getByLabel("العنوان أو الرقم أو نص المادة").fill("المال العام");
  await search.getByRole("button", { name: "بحث", exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/search\?q=/);
});

test("constitution index anchors and print layout remain usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.goto("/ar/constitution");
  const firstIndexLink = page.locator(".constitution-index nav a").first();
  await expect(firstIndexLink).toBeVisible();
  await firstIndexLink.click();
  await expect(page).toHaveURL(/#constitution-section-1$/);
  await expect(page.locator("#constitution-section-1")).toBeInViewport();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".site-header")).toBeHidden();
  await expect(page.locator(".constitution-document")).toBeVisible();
});

test("legislation list and document templates keep the measured reference geometry", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const response = await request.get("/api/v1/legislations", {
    params: { pageSize: 50 },
  });
  const list = await response.json();
  const law = list.items.find(
    (item: { amendmentCount: number; annexCount: number }) =>
      Number(item.amendmentCount) > 0 && Number(item.annexCount) > 0,
  );
  expect(law).toBeTruthy();

  await page.goto("/ar/legislations");
  await expect(page.locator(".law-list-row").first()).toBeVisible();
  const catalog = await page.locator(".legislation-catalog").boundingBox();
  const filters = await page.locator(".catalog-filters").boundingBox();
  const table = await page.locator(".laws-table-head").boundingBox();
  expect(catalog?.y).toBeCloseTo(389, 0);
  expect(catalog?.width).toBeCloseTo(1285.6, 0);
  expect(filters?.width).toBeCloseTo(376, 0);
  expect(table?.width).toBeCloseTo(909.6, 0);

  await page.goto(`/ar/legislations/${law.id}`);
  await expect(page.locator(".law-main-desc")).toBeVisible();
  const document = await page.locator(".law-main-desc").boundingBox();
  const index = await page.locator(".law-main-index").boundingBox();
  expect(document?.y).toBeCloseTo(480, 0);
  expect(index?.width).toBeCloseTo(376, 0);
  await page.getByPlaceholder("بحث في تفاصيل المواد").fill("المادة 20");
  await expect(page.locator(".index-table a")).toHaveCount(1);
  await page.getByRole("button", { name: "مسح البحث في الفهرس" }).click();
  expect(await page.locator(".index-table a").count()).toBeGreaterThan(1);

  for (const section of [
    "modifications",
    "regulations",
    "related-legislations",
  ]) {
    await page.goto(`/ar/legislations/${law.id}/${section}`);
    await expect(page.locator(".subresource-panel")).toBeVisible();
    const hero = await page.locator(".legislation-hero").boundingBox();
    const panel = await page.locator(".subresource-panel").boundingBox();
    expect(hero?.height).toBeCloseTo(505, 0);
    expect(panel?.y).toBeCloseTo(545, 0);
  }
});

test("all legislation templates reflow without horizontal overflow or reference requests", async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  const response = await request.get("/api/v1/legislations", {
    params: { pageSize: 50 },
  });
  const list = await response.json();
  const law = list.items.find(
    (item: { amendmentCount: number; annexCount: number }) =>
      Number(item.amendmentCount) > 0 && Number(item.annexCount) > 0,
  );
  const referenceRequests: string[] = [];
  const consoleErrors: string[] = [];
  page.on("request", (webRequest) => {
    if (webRequest.url().includes("uaelegislation.gov.ae"))
      referenceRequests.push(webRequest.url());
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const paths = [
    "/ar/legislations",
    `/ar/legislations/${law.id}`,
    `/ar/legislations/${law.id}/modifications`,
    `/ar/legislations/${law.id}/regulations`,
    `/ar/legislations/${law.id}/related-legislations`,
  ];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of paths) {
      await page.goto(path);
      await page
        .locator('[aria-busy="true"]')
        .waitFor({ state: "detached" })
        .catch(() => undefined);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        `${path} at ${viewport.width}`,
      ).toBeFalsy();
    }
  }
  expect(referenceRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
