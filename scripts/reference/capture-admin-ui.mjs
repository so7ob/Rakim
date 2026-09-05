import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:5173";
const username = process.env.VISUAL_ADMIN_USERNAME ?? "system_admin";
const password = process.env.VISUAL_ADMIN_PASSWORD ?? "DevOnly!ChangeMe2026";
const output = resolve("artifacts/admin-ui");
const viewports = [
  { label: "desktop-1440", width: 1440, height: 1000 },
  { label: "tablet-1024", width: 1024, height: 900 },
  { label: "mobile-390", width: 390, height: 844 },
];
const pages = [
  ["dashboard", "/ar/admin"],
  ["users", "/ar/admin/users"],
  ["roles", "/ar/admin/roles"],
  ["permission-matrix", "/ar/admin/permissions/matrix"],
  ["settings-general", "/ar/admin/settings/general"],
  ["workflow-policies", "/ar/admin/settings/workflow"],
  ["legislations", "/ar/admin/content"],
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

    await page.goto(`${baseUrl}/ar/login`, { waitUntil: "networkidle" });
    await page.getByLabel("اسم المستخدم").fill(username);
    await page.getByLabel("كلمة المرور").fill(password);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.getByRole("heading", { name: "لوحة الإدارة" }).waitFor();

    for (const [name, path] of pages) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
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
    }

    manifest.captures.push({
      viewport: viewport.label,
      diagnostics: true,
      consoleErrors,
      failedRequests,
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
  `Captured ${pages.length * viewports.length} administration views.`,
);
