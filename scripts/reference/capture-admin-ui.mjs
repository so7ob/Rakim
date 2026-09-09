import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5173";
const username = process.env.VISUAL_ADMIN_USERNAME ?? "super";
const password = process.env.VISUAL_ADMIN_PASSWORD ?? "DevOnly!ChangeMe2026";
const output = resolve("artifacts/admin-ui");
const viewports = [
  { label: "desktop-1440", width: 1440, height: 1000 },
  { label: "tablet-1024", width: 1024, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
];
const pages = [
  ["dashboard", "/ar/admin"],
  ["no-permission", "/ar/admin/no-permission"],
  ["imports-queue", "/ar/admin/imports/queue"],
  ["imports-upload", "/ar/admin/imports/upload"],
  ["legislations", "/ar/admin/content"],
  ["amendments-list", "/ar/admin/amendments/list"],
  ["amendments-create", "/ar/admin/amendments/create"],
  ["audit", "/ar/admin/audit"],
  ["reports", "/ar/admin/reports"],
  ["users", "/ar/admin/users"],
  ["roles", "/ar/admin/roles"],
  ["permission-matrix", "/ar/admin/permissions/matrix"],
  ["permission-resources", "/ar/admin/permissions/resources"],
  ["permission-roles", "/ar/admin/permissions/roles"],
  ["permission-sensitive", "/ar/admin/permissions/sensitive"],
  ["synonyms", "/ar/admin/synonyms"],
  ["quality", "/ar/admin/quality"],
  ["settings-general", "/ar/admin/settings/general"],
  ["settings-appearance", "/ar/admin/settings/appearance"],
  ["settings-navigation", "/ar/admin/settings/navigation"],
  ["settings-legislation", "/ar/admin/settings/legislation"],
  ["workflow-policies", "/ar/admin/settings/workflow"],
  ["settings-pages", "/ar/admin/settings/pages"],
  ["reference-types", "/ar/admin/reference-data/types"],
  ["reference-subjects", "/ar/admin/reference-data/subjects"],
  ["reference-authorities", "/ar/admin/reference-data/authorities"],
];
const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  captures: [],
};
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "ar-YE",
      timezoneId: "Asia/Aden",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    const externalRequests = [];
    const httpErrors = [];
    let currentAdminPath = "/ar/login";
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname))
        externalRequests.push(request.url());
    });
    page.on("requestfailed", (request) => {
      const error = request.failure()?.errorText ?? "unknown";
      if (error === "net::ERR_ABORTED") return;
      failedRequests.push({ url: request.url(), error });
    });
    page.on("response", (response) => {
      if (response.status() >= 400)
        httpErrors.push({
          page: currentAdminPath,
          url: response.url(),
          status: response.status(),
        });
    });

    await page.goto(`${baseUrl}/ar/login`, { waitUntil: "networkidle" });
    await page.getByLabel("اسم المستخدم").fill(username);
    await page.getByLabel("كلمة المرور").fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.getByRole("heading", { name: "لوحة الإدارة" }).waitFor();

    for (const [name, path] of pages) {
      currentAdminPath = path;
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      if (name === "imports-queue") {
        const firstImport = page.locator("details.import-row").first();
        if (await firstImport.count())
          await firstImport.locator(":scope > summary").click();
      }
      if (viewport.width < 900 && name === "dashboard") {
        await page.getByRole("button", { name: "فتح قائمة الإدارة" }).click();
        await page.screenshot({
          path: join(output, `${viewport.label}-navigation-open.png`),
          animations: "disabled",
        });
        await page.locator(".admin-mobile-close").click();
      }
      await page.screenshot({
        path: join(output, `${viewport.label}-${name}.png`),
        animations: "disabled",
        fullPage: false,
      });
      manifest.captures.push({
        viewport: viewport.label,
        page: name,
        path,
        overflowPixels: await page.evaluate(
          () =>
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
        ),
      });
      if (name === "settings-navigation") {
        await page
          .getByRole("button", { name: "تعديل الرابط" })
          .first()
          .click();
        const dialog = page.getByRole("dialog", { name: /تعديل رابط/ });
        await dialog.waitFor();
        await page.screenshot({
          path: join(
            output,
            `${viewport.label}-settings-navigation-dialog.png`,
          ),
          animations: "disabled",
        });
        manifest.captures.push({
          viewport: viewport.label,
          page: "settings-navigation-dialog",
          path,
          overflowPixels: await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        });
        await dialog.getByRole("button", { name: "إلغاء" }).click();
      }
      if (name === "settings-pages") {
        await page
          .getByRole("button", { name: "تعديل الصفحة" })
          .first()
          .click();
        const dialog = page.getByRole("dialog", { name: /تعديل/ });
        await dialog.waitFor();
        await page.screenshot({
          path: join(output, `${viewport.label}-settings-page-editor.png`),
          animations: "disabled",
        });
        manifest.captures.push({
          viewport: viewport.label,
          page: "settings-page-editor",
          path,
          overflowPixels: await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        });
        await dialog.getByRole("button", { name: "إغلاق النافذة" }).click();
      }
      if (name === "legislations") {
        await page.getByRole("button", { name: "+ إضافة تشريع" }).click();
        const dialog = page.getByRole("dialog", {
          name: "إضافة مسودة تشريع",
        });
        await dialog.waitFor();
        await page.screenshot({
          path: join(output, `${viewport.label}-legislation-add-dialog.png`),
          animations: "disabled",
        });
        manifest.captures.push({
          viewport: viewport.label,
          page: "legislation-add-dialog",
          path,
          overflowPixels: await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        });
        await dialog.getByRole("button", { name: "إغلاق النافذة" }).click();
      }
    }

    manifest.captures.push({
      viewport: viewport.label,
      diagnostics: true,
      consoleErrors,
      failedRequests,
      httpErrors,
      externalRequests: [...new Set(externalRequests)],
    });
    await context.close();
  }
} finally {
  await browser.close();
}

await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  `Captured ${manifest.captures.filter((item) => item.path).length} administration views.`,
);
