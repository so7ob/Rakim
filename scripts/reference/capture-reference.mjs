import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve("_reference/uae-legislation");
const output = resolve("artifacts/visual-comparison/reference");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};
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
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://local").pathname,
    );
    const safe = normalize(pathname)
      .replace(/^(\.\.(\/|\\|$))+/, "")
      .replace(/^[/\\]+/, "");
    const file = join(root, safe || "index.html");
    if (!file.startsWith(root)) throw new Error("invalid path");
    response.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'",
    );
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
});
await new Promise((resolveReady) =>
  server.listen(8124, "127.0.0.1", resolveReady),
);
const browser = await chromium.launch({ headless: true });
const manifest = {
  capturedAt: new Date().toISOString(),
  externalRequestsBlocked: 0,
  captures: [],
};

async function settlePage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo(0, 0));
}

try {
  for (const [width, height] of sizes) {
    const label = `${width}x${height}`;
    const context = await browser.newContext({
      viewport: { width, height },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.hostname !== "127.0.0.1" ||
        route.request().resourceType() === "script"
      ) {
        manifest.externalRequestsBlocked += 1;
        await route.abort();
      } else await route.continue();
    });
    for (const [name, path] of [
      ["home", "index.html"],
      ["constitution", "constitution.html"],
      ["legislations", "legislations.html"],
      ["legislation-detail", "legislations_1540_FULL.html"],
      [
        "legislation-modifications",
        "legislations_1540_modifications_FULL.html",
      ],
      ["legislation-regulations", "legislations_1540_regulations.html"],
      ["legislation-related", "legislations_1540_related-legislations.html"],
    ]) {
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:8124/${path}`, {
        waitUntil: "networkidle",
      });
      await page.evaluate(() => {
        document.body.classList.add("is-loaded");
        document
          .querySelectorAll("section")
          .forEach((element) => element.classList.add("active-view"));
      });
      await page.addStyleTag({
        content: `
        *,*:before,*:after{animation:none!important;transition:none!important}
        .loader,.browserupgrade,.uae-userway-btn,.curator_block{display:none!important}
        .home_banner{clip-path:none!important}
        .home_banner .banner_content h2 span,.home_banner .banner_content p,
        .category_listing .item_,.trending_listing,.gov_listing .item_,
        .mediacenter_wrapper .video_block,.mediacenter_wrapper .info_block,
        .t_animation span,.section_title span{transform:none!important;opacity:1!important}
      `,
      });
      await settlePage(page);
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
      const header = page.locator("header").first();
      if (await header.count())
        await header.screenshot({
          path: join(directory, `${name}-header-masked.png`),
          mask: [page.locator(".nav_logo").first()],
          maskColor: "#ffffff",
          animations: "disabled",
        });
      const footer = page.locator("footer").first();
      if (await footer.count())
        await footer.screenshot({
          path: join(directory, `${name}-footer.png`),
          animations: "disabled",
        });
      if (name === "home") {
        await page.evaluate(() => document.body.classList.add("menu_active"));
        await page.screenshot({
          path: join(directory, "menu-open.png"),
          fullPage: false,
          animations: "disabled",
        });
        await page.evaluate(() => {
          document.body.classList.remove("menu_active");
          document.querySelector(".nav_search")?.classList.add("open_");
        });
        await page.screenshot({
          path: join(directory, "search-open.png"),
          fullPage: false,
          animations: "disabled",
        });
        const dropdown = page.locator("header li.dropdown_").first();
        if ((await dropdown.count()) && (await dropdown.isVisible())) {
          await dropdown.hover();
          await page.screenshot({
            path: join(directory, "dropdown-hover.png"),
            fullPage: false,
            animations: "disabled",
          });
        }
      }
      manifest.captures.push({
        label,
        page: name,
        scrollWidth: await page.evaluate(
          () => document.documentElement.scrollWidth,
        ),
        scrollHeight: await page.evaluate(
          () => document.documentElement.scrollHeight,
        ),
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
  await new Promise((resolveClose) => server.close(resolveClose));
}
console.log(
  `Captured ${manifest.captures.length} offline reference page/viewport pairs; blocked ${manifest.externalRequestsBlocked} script or external requests.`,
);
