import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4173";
const username = process.env.VISUAL_ADMIN_USERNAME ?? "system_admin";
const password = process.env.VISUAL_ADMIN_PASSWORD ?? "DevOnly!ChangeMe2026";
const output = resolve("artifacts/workflow-controls");
const sizes = [
  [1440, 1000],
  [390, 844],
];
const manifest = { capturedAt: new Date().toISOString(), captures: [] };
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of sizes) {
    const label = `${width}x${height}`;
    const context = await browser.newContext({
      viewport: { width, height },
      locale: "ar-YE",
      timezoneId: "Asia/Aden",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
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

    await page.goto(`${baseUrl}/ar/admin/settings/workflow`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("heading", { name: "إعدادات المنصة" }).waitFor();
    const policiesCard = page.locator(".workflow-policies-card");
    await policiesCard.screenshot({
      path: join(output, `${label}-workflow-policies.png`),
      animations: "disabled",
    });
    const categories = await policiesCard
      .getByRole("navigation", { name: "تصنيفات السياسات" })
      .getByRole("link")
      .evaluateAll((links) =>
        links.map((link) => ({
          href: link.getAttribute("href"),
          label: link.textContent,
        })),
      );
    const categoryCaptures = [];
    for (const [categoryIndex, category] of categories.entries()) {
      await page.goto(new URL(category.href, baseUrl).href, {
        waitUntil: "networkidle",
      });
      await policiesCard.getByRole("tabpanel").waitFor();
      await policiesCard.screenshot({
        path: join(output, `${label}-category-${categoryIndex + 1}.png`),
        animations: "disabled",
      });
      const policyTabs = policiesCard.getByRole("tab");
      for (let index = 0; index < (await policyTabs.count()); index += 1) {
        const panelId = await policyTabs
          .nth(index)
          .getAttribute("aria-controls");
        await policyTabs.nth(index).click();
        await policiesCard.locator(`#${panelId}`).screenshot({
          path: join(
            output,
            `${label}-category-${categoryIndex + 1}-policy-${index + 1}.png`,
          ),
          animations: "disabled",
        });
      }
      categoryCaptures.push({
        label: category.label,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      });
    }

    await page.goto(`${baseUrl}/ar/admin/users`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "المستخدمون" }).waitFor();
    await page
      .locator("tbody tr")
      .first()
      .locator("td")
      .nth(2)
      .screenshot({
        path: join(output, `${label}-user-policy-overrides.png`),
        animations: "disabled",
      });
    await page.screenshot({
      path: join(output, `${label}-users-viewport.png`),
      animations: "disabled",
    });

    manifest.captures.push({
      label,
      categories: categoryCaptures,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      consoleErrors,
      failedRequests,
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
console.log(`Captured ${manifest.captures.length} workflow-control viewports.`);
