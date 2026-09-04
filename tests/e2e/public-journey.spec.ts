import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("list, search, stable article link, historical date and previous-text dialog", async ({
  page,
}) => {
  await page.goto("/ar/legislations");
  await expect(
    page.getByRole("heading", { name: "التشريعات", exact: true }),
  ).toBeVisible();
  const resultCount = page.locator(".results-heading strong");
  await expect(resultCount).toHaveText(/^\d+ نتيجة$/);
  const total = Number((await resultCount.textContent())?.match(/\d+/)?.[0]);
  expect(total).toBeGreaterThanOrEqual(20);
  const firstPageTitles = await page
    .locator(".legislation-card h2")
    .allTextContents();
  await page.getByRole("button", { name: "التالي" }).click();
  await expect(page).toHaveURL(/[?&]page=2(?:&|$)/);
  await expect(page.locator(".pagination span")).toContainText("صفحة 2 من");
  await expect
    .poll(() => page.locator(".legislation-card h2").allTextContents())
    .not.toEqual(firstPageTitles);
  await page.getByRole("button", { name: "السابق" }).click();
  await expect(page).toHaveURL(/[?&]page=1(?:&|$)/);
  await expect(page.locator(".pagination span")).toContainText("صفحة 1 من");

  await page.goto(
    "/ar/search?q=%22%D8%A7%D9%84%D9%85%D8%A7%D9%84%20%D8%A7%D9%84%D8%B9%D8%A7%D9%85%22",
  );
  const lawLink = page
    .getByRole("link", {
      name: "قانون حماية المال العام النموذجي",
      exact: true,
    })
    .first();
  await expect(lawLink).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/ar\/legislations\/[^/]+$/),
    lawLink.click(),
  ]);
  await expect(
    page.getByRole("heading", {
      name: "قانون حماية المال العام النموذجي",
      exact: true,
    }),
  ).toBeVisible();

  const articleTwenty = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "20", exact: true }) });
  await expect(articleTwenty).toContainText("تحمى الأموال العامة");
  const previousButton = articleTwenty.getByRole("button", {
    name: /نصوص سابقة/,
  });
  await previousButton.click();
  const dialog = page.getByRole("dialog", { name: "النصوص السابقة" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/استبدال تجريبي/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(previousButton).toBeFocused();

  await page.getByLabel("اعرض النص النافذ في تاريخ").fill("2015-01-01");
  await expect(articleTwenty).toContainText("تخصص الاعتمادات الكافية");
  await articleTwenty
    .getByRole("link", { name: "رابط ثابت للمادة 20" })
    .click();
  await expect(articleTwenty).toBeFocused();
});

test("critical public pages have no automated WCAG A/AA violations", async ({
  page,
}) => {
  for (const path of [
    "/ar",
    "/ar/legislations",
    "/ar/search?q=%D8%A7%D9%84%D9%85%D8%A7%D9%84",
  ]) {
    await page.goto(path);
    await page
      .locator('[aria-busy="true"]')
      .waitFor({ state: "detached" })
      .catch(() => undefined);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations,
      `${path}: ${results.violations.map((item) => item.id).join(", ")}`,
    ).toEqual([]);
  }
});

test("Arabic search acceptance queries preserve exclusions and temporal versions", async ({
  request,
}) => {
  const allWords = await (
    await request.get("/api/v1/search", { params: { q: "الزكاة الفقراء" } })
  ).json();
  expect(allWords.meta.total).toBeGreaterThan(0);
  const excluded = await (
    await request.get("/api/v1/search", { params: { q: "الضريبة -الجمارك" } })
  ).json();
  expect(excluded.meta.total).toBeGreaterThan(0);
  expect(
    excluded.items.every(
      (item: { textLiteral: string }) => !item.textLiteral.includes("الجمارك"),
    ),
  ).toBeTruthy();
  const identity = await (
    await request.get("/api/v1/search", {
      params: { q: "قانون رقم 14 لسنة 1990" },
    })
  ).json();
  expect(identity.items[0].legislationTitle).toBe(
    "قانون حماية المال العام النموذجي",
  );
  const temporal = await (
    await request.get("/api/v1/search", {
      params: { q: "المادة 20", at: "2015-01-01" },
    })
  ).json();
  expect(
    temporal.items.some(
      (item: { validFrom: string }) => item.validFrom === "2010-01-01",
    ),
  ).toBeTruthy();
});

test("modifications, annex PDF and directed relations are served from API data", async ({
  page,
}) => {
  await page.goto(
    "/ar/search?q=%22%D8%A7%D9%84%D9%85%D8%A7%D9%84%20%D8%A7%D9%84%D8%B9%D8%A7%D9%85%22",
  );
  const lawLink = page
    .getByRole("link", {
      name: "قانون حماية المال العام النموذجي",
      exact: true,
    })
    .first();
  await Promise.all([
    page.waitForURL(/\/ar\/legislations\/[^/]+$/),
    lawLink.click(),
  ]);
  await page.getByRole("link", { name: "التعديلات (3)" }).click();
  await expect(
    page.getByRole("heading", { name: "تعديلات التشريع" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /2027/ })).toBeVisible();
  await expect(page.getByText("إضافة", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: /العودة إلى التشريع/ }).click();
  await page.getByRole("link", { name: "اللوائح والجداول (3)" }).click();
  await expect(
    page.getByRole("heading", { name: "اللوائح والجداول والملاحق" }),
  ).toBeVisible();
  const regulation = page
    .locator(".annex-card")
    .filter({ hasText: "لائحة تنفيذية نموذجية" });
  await regulation.getByRole("button", { name: "فتح" }).click();
  const viewer = regulation.locator(".pdfjs-viewer");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByLabel("الصفحة 1", { exact: true })).toBeVisible();
  const pdfResponse = await page.request.get(
    (await viewer.getByRole("link", { name: "تنزيل" }).getAttribute("href")) ??
      "",
  );
  expect(pdfResponse.ok()).toBeTruthy();
  expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");

  await page.getByRole("link", { name: /العودة إلى التشريع/ }).click();
  await page.getByRole("link", { name: /ذات الصلة/ }).click();
  await expect(
    page.getByRole("heading", { name: "التشريعات ذات الصلة" }),
  ).toBeVisible();
  await expect(page.getByText("يحيل إلى", { exact: true })).toBeVisible();
  await expect(page.getByText("مرتبط موضوعيًا", { exact: true })).toBeVisible();
});

test("responsive visual baseline", async ({ page }) => {
  await page.goto("/ar");
  await page.locator('[aria-busy="true"]').waitFor({ state: "detached" });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBeFalsy();
  await expect(page).toHaveScreenshot("home.png", {
    fullPage: true,
    animations: "disabled",
    mask: [page.locator(".stats strong").first()],
    maskColor: "#314B67",
  });
});

test("reflows at the 200% equivalent viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440");
  await page.setViewportSize({ width: 512, height: 900 });
  await page.goto("/ar/legislations");
  await page
    .locator('[aria-busy="true"]')
    .waitFor({ state: "detached" })
    .catch(() => undefined);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBeFalsy();
  await expect(
    page.getByRole("heading", { name: "التشريعات", exact: true }),
  ).toBeVisible();
});
