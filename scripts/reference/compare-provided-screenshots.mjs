import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4173";
const apiUrl = process.env.VISUAL_API_URL ?? "http://127.0.0.1:4000/api/v1";
const references = resolve(
  process.env.VISUAL_REFERENCE_DIR ?? "_reference/provided-screenshots",
);
const output = resolve(
  "artifacts/visual-comparison/provided-screenshots-1440x1000",
);
await mkdir(output, { recursive: true });

const list = await fetch(`${apiUrl}/legislations?pageSize=50`).then(
  (response) => response.json(),
);
const law = list.items.find(
  (item) => Number(item.amendmentCount) > 0 && Number(item.annexCount) > 0,
);
const archived = list.items.find((item) => item.legalStatus === "REPEALED");
if (!law || !archived)
  throw new Error("Required comparison records are missing.");

const pages = [
  ["legislations", "/ar/legislations", "uae-legislations-2026-09-04.png"],
  [
    "legislation-detail",
    `/ar/legislations/${law.id}`,
    "uae-detail-1020-2026-09-04.png",
  ],
  [
    "legislation-modifications",
    `/ar/legislations/${law.id}/modifications`,
    "uae-modifications-1020-2026-09-04.png",
  ],
  [
    "legislation-regulations",
    `/ar/legislations/${law.id}/regulations`,
    "uae-regulations-1020-2026-09-04.png",
  ],
  [
    "legislation-related",
    `/ar/legislations/${law.id}/related-legislations`,
    "uae-related-4001-2026-09-04.png",
  ],
  [
    "archived-detail",
    `/ar/legislations/${archived.id}/archived`,
    "uae-archived-detail-1021-2026-09-04.png",
  ],
  [
    "archived-related",
    `/ar/legislations/${archived.id}/related-legislations`,
    "uae-archived-related-1021-2026-09-04.png",
  ],
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "ar-YE",
  timezoneId: "Asia/Aden",
  reducedMotion: "reduce",
});
const results = [];

async function settlePage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

try {
  for (const [name, path, referenceName] of pages) {
    const page = await context.newPage();
    const externalRequests = [];
    const consoleErrors = [];
    page.on("request", (request) => {
      if (request.url().includes("uaelegislation.gov.ae"))
        externalRequests.push(request.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
    await settlePage(page);
    await page.addStyleTag({
      content:
        ":root{--color-primary:#AC4459!important;--color-burgundy:#AC4459!important;--color-action:#AC4459!important;--color-secondary:#344B61!important;--color-navy:#344B61!important;--hero-gradient:linear-gradient(110deg,#AC4459 0%,#6B465E 45%,#344B61 100%)!important}*{animation:none!important;transition:none!important}",
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    const implementation = join(output, `${name}-implementation.png`);
    const reference = join(output, `${name}-reference.png`);
    const overlay = join(output, `${name}-overlay.png`);
    const difference = join(output, `${name}-difference.png`);
    await page.screenshot({ path: implementation, animations: "disabled" });
    await copyFile(join(references, referenceName), reference);
    const blend = spawnSync(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-y",
        "-i",
        reference,
        "-i",
        implementation,
        "-filter_complex",
        "blend=all_mode=average",
        "-frames:v",
        "1",
        overlay,
      ],
      { encoding: "utf8" },
    );
    const diff = spawnSync(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-y",
        "-i",
        reference,
        "-i",
        implementation,
        "-filter_complex",
        "blend=all_mode=difference",
        "-frames:v",
        "1",
        difference,
      ],
      { encoding: "utf8" },
    );
    const stats = spawnSync(
      "ffmpeg",
      [
        "-loglevel",
        "error",
        "-i",
        reference,
        "-i",
        implementation,
        "-filter_complex",
        "blend=all_mode=difference,signalstats,metadata=print:file=-",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { encoding: "utf8" },
    );
    const mean = stats.stdout.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/)?.[1];
    results.push({
      page: name,
      path,
      reference: referenceName,
      meanLumaDifferencePercent: mean
        ? Number(((Number(mean) / 255) * 100).toFixed(3))
        : null,
      overlayCreated: blend.status === 0,
      differenceCreated: diff.status === 0,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      externalRequests,
      consoleErrors,
    });
    await page.close();
  }
} finally {
  await context.close();
  await browser.close();
}
await writeFile(join(output, "metrics.json"), JSON.stringify(results, null, 2));
console.log(`Compared ${results.length} supplied 1440x1000 screenshots.`);
