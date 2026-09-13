import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve("_reference/uae-legislation");
async function walk(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...(await walk(path)));
    else output.push(path);
  }
  return output;
}
const files = (await walk(root)).sort();
const htmlFiles = files.filter(
  (file) => extname(file).toLowerCase() === ".html",
);
const html = new Map(
  await Promise.all(
    htmlFiles.map(async (file) => [file, await readFile(file, "utf8")]),
  ),
);
const textFiles = files.filter(
  (file) =>
    /\.(?:html|css|js|svg)$/i.test(file) ||
    file.endsWith("/js") ||
    file.endsWith(".تنزيل"),
);
const searchable = (
  await Promise.all(
    textFiles.map((file) => readFile(file, "utf8").catch(() => "")),
  )
).join("\n");
const typeName = (file) => {
  const ext = extname(file).toLowerCase();
  if (ext === ".html") return "HTML page";
  if (ext === ".css") return "CSS";
  if ([".js", ".تنزيل"].includes(ext) || basename(file) === "js")
    return "JavaScript/save artifact";
  if ([".woff", ".woff2", ".ttf", ".eot"].includes(ext)) return "Font";
  if (ext === ".svg") return "SVG";
  if ([".png", ".jpg", ".jpeg", ".ico"].includes(ext)) return "Image";
  if (ext === ".mp4") return "Video";
  return ext.slice(1).toUpperCase() || "File";
};
const mediaInfo = (file) => {
  if (!/\.(?:png|jpe?g|ico|mp4)$/i.test(file)) return "—";
  const probe = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,codec_name",
      "-of",
      "csv=s=x:p=0",
      file,
    ],
    { encoding: "utf8" },
  );
  return probe.stdout.trim() || "—";
};
const rows = [];
for (const file of files) {
  const rel = relative(root, file);
  const name = basename(file);
  const pages = [...html.entries()]
    .filter(([, content]) => content.includes(name))
    .map(([page]) => basename(page));
  const used =
    extname(file).toLowerCase() === ".html" ||
    searchable.split(name).length > 2;
  rows.push({
    rel,
    size: (await stat(file)).size,
    type: typeName(file),
    pages: pages.join(", ") || "—",
    status: used ? "ضروري/مشار إليه" : "غير مثبت الاستخدام",
    info: mediaInfo(file),
  });
}
const origins = new Map();
for (const content of html.values()) {
  for (const match of content.matchAll(/https?:\/\/([^/\s"'<>]+)/g))
    origins.set(match[1], (origins.get(match[1]) ?? 0) + 1);
}
const markdown = `# جرد أصول المرجع\n\nتم توليد هذا الجرد من النسخة المحلية للقراءة فقط في \`_reference/uae-legislation/\`. العدد الفعلي: **${files.length} ملفًا**. لا تُشغّل ملفات JavaScript المرجعية في المنتج أو أثناء الالتقاط.\n\n## ملاحظات السلامة والاستخدام\n\n- جميع الأصول في هذا الجدول محلية داخل الحزمة؛ توجد داخل HTML وروابط/أصول خارجية محظورة أثناء الالتقاط.\n- اكتُشفت ${origins.size} مضيفات خارجية في صفحات الحفظ، تشمل الموقع المرجعي وأدوات تحليل/إتاحة، كما تتضمن ملفات الحفظ الكامل نطاقات إعلانية دخيلة لا صلة لها بالواجهة. لذلك يُحظر تنفيذ كل JavaScript المرجعي.\n- ملفات الشعار والعلم والهوية الإماراتية مرجعية فقط وغير مستخدمة في المنتج اليمني.\n- \`DIN Next LT Arabic\` موجود محليًا، لكن الحزمة لا تحتوي ملف ترخيص؛ لم يُنسخ إلى التطبيق، واستُخدم Cairo المرخّص ضمن اعتماد المشروع.\n- «غير مثبت الاستخدام» تعني أن الاسم لم يظهر كمرجع مباشر في HTML/CSS/JS المحفوظ؛ لا تعني الحذف من المرجع.\n\n## الخطوط\n\n| العائلة | الملفات | الوزن المعرّف في CSS | النمط | الاستخدام المرجعي |\n|---|---|---:|---|---|\n| DIN Next LT Arabic | Regular.woff/woff2 | 400 | normal | النص العام |\n| DIN Next LT Arabic | Medium.woff/woff2 | 500 | normal | التنقل والعناصر المتوسطة |\n| DIN Next LT Arabic | Bold.woff/woff2 | 700 | normal | العناوين والتأكيد |\n| DIN Next LT Arabic | Black.woff/woff2 | 900 | normal | العناوين الثقيلة |\n| uae-leg | eot/svg/ttf/woff | normal | normal | icon font مرجعي؛ لم يُنسخ |\n\n## الملفات\n\n| الملف | النوع | الحجم (بايت) | الأبعاد/الترميز | الصفحات المشيرة | الحالة |\n|---|---|---:|---|---|---|\n${rows.map((row) => `| \`${row.rel.replaceAll("|", "\\|")}\` | ${row.type} | ${row.size} | ${row.info} | ${row.pages} | ${row.status} |`).join("\n")}\n`;
await mkdir(resolve("docs/ui-reference"), { recursive: true });
await writeFile(
  resolve("docs/ui-reference/REFERENCE_ASSET_INVENTORY.md"),
  markdown,
);
console.log(`Wrote ${rows.length} inventory rows.`);
