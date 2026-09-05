import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4173";
const apiUrl = process.env.VISUAL_API_URL ?? "http://127.0.0.1:4000/api/v1";
const output = resolve("artifacts/visual-comparison/implementation");
const sizes = [
  [1440, 900],
  [1366, 768],
  [1280, 1024],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [390, 844],
  [360, 800],
];
const browser = await chromium.launch({ headless: true });
const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl,
  captures: [],
};

async function settlePage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}
const legislationList = await fetch(`${apiUrl}/legislations?pageSize=50`).then(
  (response) => response.json(),
);
const legislation = legislationList.items.find(
  (item) => Number(item.amendmentCount) > 0 && Number(item.annexCount) > 0,
);
if (!legislation)
  throw new Error(
    "No published legislation with modifications and annexes was found.",
  );
try {
  for (const [width, height] of sizes) {
    const label = `${width}x${height}`;
    const context = await browser.newContext({
      viewport: { width, height },
      locale: "ar-YE",
      timezoneId: "Asia/Aden",
      reducedMotion: "reduce",
    });
    for (const [name, path] of [
      ["home", "/ar"],
      ["constitution", "/ar/constitution"],
      ["legislations", "/ar/legislations"],
      ["legislation-detail", `/ar/legislations/${legislation.id}`],
      [
        "legislation-modifications",
        `/ar/legislations/${legislation.id}/modifications`,
      ],
      [
        "legislation-regulations",
        `/ar/legislations/${legislation.id}/regulations`,
      ],
      [
        "legislation-related",
        `/ar/legislations/${legislation.id}/related-legislations`,
      ],
    ]) {
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("requestfailed", (request) => failedRequests.push(request.url()));
      await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
      await settlePage(page);
      await page.addStyleTag({
        content:
          ":root{--color-primary:#AC4459!important;--color-burgundy:#AC4459!important;--color-secondary:#344B61!important;--color-navy:#344B61!important;--hero-gradient:linear-gradient(120deg,#AC4459,#344B61)!important}*{animation:none!important;transition:none!important}",
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      const directory = join(output, label);
      await mkdir(directory, { recursive: true });
      await page.screenshot({
        path: join(directory, `${name}-full.png`),
        fullPage: true,
        animations: "disabled",
      });
      await page.screenshot({
        path: join(directory, `${name}-viewport.png`),
        fullPage: false,
        animations: "disabled",
      });
      const header = page.locator(".site-header");
      await header.screenshot({
        path: join(directory, `${name}-header-masked.png`),
        mask: [page.locator(".brand")],
        maskColor: "#ffffff",
        animations: "disabled",
      });
      const footer = page.locator(".site-footer");
      await footer.screenshot({
        path: join(directory, `${name}-footer.png`),
        animations: "disabled",
      });
      if (name === "home") {
        await page.getByRole("button", { name: "فتح القائمة" }).click();
        await page.screenshot({
          path: join(directory, "menu-open.png"),
          fullPage: false,
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
        const searchButton = page.getByRole("button", { name: "فتح البحث" });
        if (await searchButton.isVisible()) {
          await searchButton.click();
          await page.screenshot({
            path: join(directory, "search-open.png"),
            fullPage: false,
            animations: "disabled",
          });
          await page
            .getByRole("button", { name: "إغلاق البحث" })
            .last()
            .click();
        }
      }
      manifest.captures.push({
        label,
        page: name,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        consoleErrors,
        failedRequests,
      });
      await page.close();
    }
    await context.close();
  }
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
} finally {
  await browser.close();
}
console.log(
  `Captured ${manifest.captures.length} implementation page/viewport pairs.`,
);
