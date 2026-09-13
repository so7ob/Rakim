import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const reference = resolve("artifacts/visual-comparison/reference");
const implementation = resolve("artifacts/visual-comparison/implementation");
const output = resolve("artifacts/visual-comparison/comparison");
const sizes = [
  "1440x900",
  "1366x768",
  "1280x1024",
  "1024x768",
  "768x1024",
  "430x932",
  "390x844",
  "360x800",
];
const results = [];
const dimensions = (path) => {
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=s=x:p=0",
      path,
    ],
    { encoding: "utf8" },
  );
  const [width, height] = probe.stdout.trim().split("x").map(Number);
  return { width, height };
};
await mkdir(output, { recursive: true });
const pages = [
  "home",
  "constitution",
  "legislations",
  "legislation-detail",
  "legislation-modifications",
  "legislation-regulations",
  "legislation-related",
];
for (const size of sizes) {
  const target = join(output, size);
  await mkdir(target, { recursive: true });
  for (const page of pages) {
    for (const region of ["header-masked", "viewport", "footer"]) {
      const ref = join(reference, size, `${page}-${region}.png`);
      const impl = join(implementation, size, `${page}-${region}.png`);
      const overlay = join(target, `${page}-${region}-overlay.png`);
      const difference = join(target, `${page}-${region}-difference.png`);
      const referenceSize = dimensions(ref);
      const implementationSize = dimensions(impl);
      const normalize = `[1:v]scale=${referenceSize.width}:${referenceSize.height}[implementation];[0:v][implementation]`;
      const blend = spawnSync(
        "ffmpeg",
        [
          "-loglevel",
          "error",
          "-y",
          "-i",
          ref,
          "-i",
          impl,
          "-filter_complex",
          `${normalize}blend=all_mode=average`,
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
          ref,
          "-i",
          impl,
          "-filter_complex",
          `${normalize}blend=all_mode=difference`,
          "-frames:v",
          "1",
          difference,
        ],
        { encoding: "utf8" },
      );
      const metric = spawnSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-i",
          ref,
          "-i",
          impl,
          "-filter_complex",
          `${normalize}psnr`,
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      );
      const differenceStats = spawnSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          ref,
          "-i",
          impl,
          "-filter_complex",
          `${normalize}blend=all_mode=difference,signalstats,metadata=print:file=-`,
          "-frames:v",
          "1",
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      );
      const psnr = metric.stderr?.match(/average:([0-9.]+)/)?.[1];
      const meanLuma = differenceStats.stdout?.match(
        /lavfi\.signalstats\.YAVG=([0-9.]+)/,
      )?.[1];
      results.push({
        size,
        page,
        region,
        referenceSize,
        implementationSize,
        normalizedForComparison:
          referenceSize.width !== implementationSize.width ||
          referenceSize.height !== implementationSize.height,
        psnrDb: psnr ? Number(psnr) : null,
        meanLumaDifferencePercent: meanLuma
          ? Number(((Number(meanLuma) / 255) * 100).toFixed(3))
          : null,
        overlayCreated: blend.status === 0,
        differenceCreated: diff.status === 0,
        error:
          blend.error?.message ??
          diff.error?.message ??
          metric.error?.message ??
          differenceStats.error?.message ??
          null,
      });
    }
  }
}
await writeFile(join(output, "metrics.json"), JSON.stringify(results, null, 2));
console.log(`Generated ${results.length} overlay/difference comparisons.`);
