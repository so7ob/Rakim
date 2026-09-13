import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { extract, parseStructure, recognizeImage } from "./main.js";

const fixture = (name: string) =>
  resolve(process.cwd(), "../../tests/fixtures", name);

describe("source extraction worker", () => {
  it.each([
    ["import-sample.txt", "text/plain", "المال العام"],
    ["import-sample.csv", "text/csv", "المال العام"],
    [
      "import-sample.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "المادة (2)",
    ],
    [
      "import-sample.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "رسم تجريبي",
    ],
    ["import-sample.pdf", "application/pdf", "Synthetic non-official source"],
  ])("extracts %s", async (name, mediaType, expected) => {
    const result = await extract(fixture(name), mediaType);
    expect(result.text).toContain(expected);
  });

  it("recognizes Arabic image text and reports confidence", async () => {
    const result = await recognizeImage(fixture("ocr-ar.png"));
    expect(result.text).toContain("المال العام");
    expect(result.confidence).toBeGreaterThan(50);
  });

  it("splits extracted Arabic text into stable article labels", () => {
    const result = parseStructure(
      "ديباجة\nالمادة (1): النص الأول\nالمادة 2: النص الثاني",
    );
    expect(result.preamble).toContain("ديباجة");
    expect(result.articles.map((item) => item.number)).toEqual(["1", "2"]);
  });
});

describe("Arabic legal structure parser", () => {
  it("extracts the six articles and two chapters from the asterisk report", async () => {
    const source = readFileSync(
      fixture("legal-structure-asterisks-ar.md"),
      "utf8",
    );
    const extracted = await extract(
      fixture("legal-structure-asterisks-ar.md"),
      "text/markdown",
    );
    expect(extracted.text).toBe(source);
    const result = parseStructure(extracted.text);
    // This fixture has only bold delimiters and hard breaks; the comparison
    // checks every body/list line, not just the resulting article count.
    const plain = source.replaceAll("**", "").replace(/\\\n/gu, "\n");
    expect(result).toEqual(parseStructure(plain));
    expect(result.summary).toEqual({
      babs: 0,
      fasls: 2,
      qisms: 0,
      articles: 6,
      rootArticles: 0,
      reviewRequired: 0,
    });
    expect(result.nodes.map((node) => node.title)).toEqual([
      "التسمية والتعاريف",
      "إنشاء الهيئة وأهدافها ومهامها وصلاحياتها العامة",
    ]);
    expect(result.articles.map((article) => article.number)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(result.articles.map((article) => article.label)).toEqual([
      "١",
      "٢",
      "٣",
      "٤",
      "٥",
      "٦",
    ]);
    expect(result.articles.map((article) => article.structureNodeKey)).toEqual([
      "node-0001",
      "node-0001",
      "node-0002",
      "node-0002",
      "node-0002",
      "node-0002",
    ]);
    expect(result.articles[3]?.text).toContain("المادة (٢٣)");
    expect(result.articles[5]?.text).toMatch(/\n١$/u);
    const lines = source.split("\n");
    for (const article of result.articles)
      expect(lines[article.sourceLine - 1]).toMatch(/^\*\*مادة/u);
    for (const node of result.nodes)
      expect(lines[node.sourceLine - 1]).toMatch(/^\*\*الفصل/u);
  });

  it.each(["*", "**", "***"])(
    "cleans balanced %s emphasis in headings, preamble and bodies",
    (marker) => {
      const result = parseStructure(
        [
          `${marker}ديباجة${marker}`,
          `${marker}الباب الأول${marker}: ${marker}عام${marker}`,
          `${marker}الفصل الأول${marker}`,
          `${marker}تعريفات${marker}`,
          `${marker}القسم الأول: مصطلحات${marker}`,
          `${marker}مادة (١)${marker} النص ${marker}الأول${marker}.`,
          `${marker}سطر تابع${marker}`,
          `${marker}مادة (٢): النص الثاني.${marker}`,
        ].join("\n"),
      );
      expect(result.preamble).toBe("ديباجة");
      expect(result.nodes.map((node) => node.title)).toEqual([
        "عام",
        "تعريفات",
        "مصطلحات",
      ]);
      expect(result.articles.map((article) => article.text)).toEqual([
        "النص الأول.\nسطر تابع",
        "النص الثاني.",
      ]);
      expect(result.issues).toEqual([]);
    },
  );

  it("does not consume a formatted article or structure heading as a following title", () => {
    const result = parseStructure(
      "**الباب الأول**\n\n**الفصل الأول**\n\n**مادة (١)** نص",
    );
    expect(result.nodes.map((node) => node.title)).toEqual([
      "الباب الأول",
      "الفصل الأول",
    ]);
    expect(result.articles[0]).toMatchObject({
      number: "1",
      text: "نص",
      sourceLine: 5,
      structureNodeKey: "node-0002",
    });
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "STRUCTURE_TITLE_MISSING",
      "STRUCTURE_TITLE_MISSING",
    ]);
  });

  it("keeps literal, escaped, list, arithmetic and unmatched asterisks", () => {
    const body = String.raw`علامة * منفردة، وحساب 2 * 3 * 4 و2*3*4.
حساب بين أقواس (2+3)*(4+5)*(6+7) و[2+3]*4*[6+7].
* بند أول
* بند ثان مع **تنسيق**.
نجوم مهروبة \*حرفية\* و\**حرفية\**.
نص **غير مغلق
نص مختلف ***غير متوازن**.
****فاصل****
***`;
    expect(parseStructure(`مادة (١)\n${body}`).articles[0]?.text).toBe(
      body.replace("**تنسيق**", "تنسيق"),
    );
  });

  it("supports nested balanced emphasis without changing adjacent characters", () => {
    expect(
      parseStructure("**مادة** (١) **نص *مهم* جدًا**، و(***تنبيه***).")
        .articles[0]?.text,
    ).toBe("نص مهم جدًا، و(تنبيه).");
  });

  it("cleans hard breaks without merging lines or losing escaped and final backslashes", () => {
    const source = [
      "**الفصل الأول**\\",
      "**عام**",
      "**مادة (١)** نص\\",
      String.raw`مسار\\`,
      "سطر تابع",
      "**مادة (٢)** آخر\\",
    ].join("\r\n");
    const result = parseStructure(source);
    expect(result.nodes[0]).toMatchObject({ title: "عام", sourceLine: 1 });
    expect(result.articles[0]).toMatchObject({
      text: "نص\nمسار\\\\\nسطر تابع",
      sourceLine: 3,
    });
    expect(result.articles[1]).toMatchObject({ text: "آخر\\", sourceLine: 6 });
  });

  it("cleans fallback and unassigned text while retaining review diagnostics", () => {
    const fallback = parseStructure("**نص بلا مواد**\\\n*سطر آخر*");
    expect(fallback.articles[0]?.text).toBe("نص بلا مواد\nسطر آخر");
    expect(fallback.issues).toContainEqual(
      expect.objectContaining({ code: "ARTICLE_MARKERS_NOT_FOUND" }),
    );
    const result = parseStructure(
      "**الباب الأول: عام**\n**الفصل التمهيدي**\n**نص غير منسوب**\n**مادة (١)** نص",
    );
    expect(result.articles[0]?.structureNodeKey).toBe("node-0001");
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "UNRECOGNIZED_STRUCTURE_HEADING",
        sourceLine: 2,
        excerpt: "الفصل التمهيدي",
      }),
      expect.objectContaining({
        code: "UNASSIGNED_TEXT",
        sourceLine: 3,
        excerpt: "نص غير منسوب",
      }),
    ]);
  });

  it("parses the realistic nested fixture deterministically", () => {
    const source = readFileSync(fixture("legal-structure-ar.txt"), "utf8");
    const first = parseStructure(source);
    expect(parseStructure(source)).toEqual(first);
    expect(first.summary).toEqual({
      babs: 2,
      fasls: 2,
      qisms: 3,
      articles: 6,
      rootArticles: 0,
      reviewRequired: 0,
    });
    expect(
      first.nodes.map(({ kind, title, parentKey }) => ({
        kind,
        title,
        parentKey,
      })),
    ).toEqual([
      { kind: "BAB", title: "الأحكام العامة", parentKey: null },
      { kind: "FASL", title: "التعاريف", parentKey: "node-0001" },
      { kind: "QISM", title: "المصطلحات", parentKey: "node-0002" },
      { kind: "QISM", title: "نطاق التطبيق", parentKey: "node-0002" },
      { kind: "FASL", title: "أحكام أخرى", parentKey: "node-0001" },
      { kind: "BAB", title: "الأحكام المالية", parentKey: null },
      {
        kind: "QISM",
        title: "أحكام ختامية مستقلة",
        parentKey: "node-0006",
      },
    ]);
    expect(first.articles.map((article) => article.structureNodeKey)).toEqual([
      "node-0003",
      "node-0003",
      "node-0004",
      "node-0005",
      "node-0006",
      "node-0007",
    ]);
    expect(first.articles[0]?.text).toContain("كلمة المادة في هذا النص");
    expect(first.articles).toHaveLength(6);
  });

  it.each([
    [
      "باب وفصل وقسم ومواد",
      "الباب الأول: عام\nالفصل الأول: تعريفات\nالقسم الأول: مصطلحات\nالمادة 1: نص",
      ["BAB", "FASL", "QISM"],
      "node-0003",
    ],
    [
      "باب وفصل فرع ومواد",
      "الباب الأول: عام\nالفصل الأول: تعريفات\nالفرع الأول: مجلس الإدارة\nالمادة 1: نص",
      ["BAB", "FASL", "QISM"],
      "node-0003",
    ],
    [
      "باب وفصل ومواد",
      "الباب الأول: عام\nالفصل الأول: تعريفات\nالمادة 1: نص",
      ["BAB", "FASL"],
      "node-0002",
    ],
    ["باب ومواد", "الباب الأول: عام\nالمادة 1: نص", ["BAB"], "node-0001"],
    [
      "فصل وقسم ومواد",
      "الفصل الأول: تعريفات\nالقسم الأول: مصطلحات\nالمادة 1: نص",
      ["FASL", "QISM"],
      "node-0002",
    ],
    ["فصل ومواد", "الفصل الأول: تعريفات\nالمادة 1: نص", ["FASL"], "node-0001"],
    ["قسم ومواد", "القسم الأول: مصطلحات\nالمادة 1: نص", ["QISM"], "node-0001"],
    ["مواد فقط", "المادة 1: نص\nالمادة 2: نص آخر", [], null],
  ])("supports %s", (_name, text, kinds, parent) => {
    const result = parseStructure(text as string);
    expect(result.nodes.map((node) => node.kind)).toEqual(kinds);
    expect(result.articles[0]?.structureNodeKey).toBe(parent);
  });

  it("treats same-line and next-line structure titles equivalently", () => {
    const sameLine = parseStructure(
      "الباب الأول: الأحكام العامة\nالمادة 1: نص",
    );
    const nextLine = parseStructure(
      "الباب الأول\n\nالأحكام العامة\nالمادة 1: نص",
    );
    expect(nextLine.nodes[0]?.title).toBe(sameLine.nodes[0]?.title);
    expect(nextLine.nodes[0]?.number).toBe(sameLine.nodes[0]?.number);
  });

  it("normalizes Arabic-Indic and Western numbers while retaining labels", () => {
    const result = parseStructure(
      "الباب ١: عام\nالمادة (١): نص\nالمادة رقم (2): نص\nالمادة الثالثة: نص",
    );
    expect(result.nodes[0]?.number).toBe("1");
    expect(result.articles.map((article) => article.number)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(result.articles[0]?.label).toBe("١");
  });

  it("accepts Unicode punctuation and excess spacing", () => {
    const result = parseStructure(
      "  الباب   الأول ـ  أحكام عامة\nالفصل الثاني： نطاق\nالمادة （ ١ ） — نص",
    );
    expect(result.nodes.map((node) => node.title)).toEqual([
      "أحكام عامة",
      "نطاق",
    ]);
    expect(result.articles[0]?.text).toBe("نص");
  });

  it("does not split an in-body mention of an article", () => {
    const result = parseStructure(
      "المادة 1: تطبق المادة 2 من اللائحة هنا.\nويظل هذا سطرًا من النص.",
    );
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]?.text).toContain("المادة 2");
  });

  it("resets a section when a new chapter starts", () => {
    const result = parseStructure(
      "الباب الأول: عام\nالفصل الأول: أول\nالقسم الأول: قسم\nالمادة 1: أ\nالفصل الثاني: ثان\nالمادة 2: ب",
    );
    expect(result.articles.map((article) => article.structureNodeKey)).toEqual([
      "node-0003",
      "node-0004",
    ]);
  });

  it("assigns articles to الفرع headings and keeps multiple فرع under the same chapter", () => {
    const result = parseStructure(
      "**الفصل الأول**\n**تعريفات**\n**الفرع الأول**\n**المصطلحات**\nالمادة ١: أ\n**الفرع الثاني**\n**المجالس**\nالمادة ٢: ب",
    );
    expect(result.nodes.map((node) => node.kind)).toEqual([
      "FASL",
      "QISM",
      "QISM",
    ]);
    expect(result.nodes.map((node) => node.title)).toEqual([
      "تعريفات",
      "المصطلحات",
      "المجالس",
    ]);
    expect(result.nodes[1]?.parentKey).toBe("node-0001");
    expect(result.nodes[2]?.parentKey).toBe("node-0001");
    expect(result.articles.map((article) => article.structureNodeKey)).toEqual([
      "node-0002",
      "node-0003",
    ]);
  });

  it("nests الفرع under an active القسم and assigns its articles to the branch", () => {
    const result = parseStructure(
      "الفصل الثالث: إدارة الهيئة\nالقسم الأول: التنظيم\nالفرع الأول: مجلس الإدارة\nالمادة 1: نص",
    );
    expect(result.nodes[2]).toEqual(
      expect.objectContaining({
        label: "الفرع الأول",
        nodeType: "SUBSECTION",
        parentKey: "node-0002",
      }),
    );
    expect(result.articles[0]?.structureNodeKey).toBe("node-0003");
  });

  it("flags an unnumbered فرع as unrecognized heading and keeps following article parent", () => {
    const result = parseStructure(
      "الباب الأول: عام\nالفصل الأول: تعريفات\nالفرع التمهيدي\nالمادة 1: نص",
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "UNRECOGNIZED_STRUCTURE_HEADING",
        sourceLine: 3,
        excerpt: "الفرع التمهيدي",
      }),
    );
    expect(result.articles[0]?.structureNodeKey).toBe("node-0002");
  });

  it("resets chapter and section when a new title starts", () => {
    const result = parseStructure(
      "الباب الأول: عام\nالفصل الأول: أول\nالقسم الأول: قسم\nالمادة 1: أ\nالباب الثاني: خاص\nالمادة 2: ب",
    );
    expect(result.articles.map((article) => article.structureNodeKey)).toEqual([
      "node-0003",
      "node-0004",
    ]);
  });

  it("keeps root articles without creating a synthetic structure", () => {
    const result = parseStructure("المادة 1: نص\nالمادة 2: نص");
    expect(result.nodes).toEqual([]);
    expect(result.summary.rootArticles).toBe(2);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "STRUCTURE_NOT_DETECTED" }),
    );
  });

  it("does not invent a parent after an ambiguous heading", () => {
    const result = parseStructure(
      "الباب الأول: عام\nالفصل الأول: أول\nالقسم الأول: قسم\nالمادة 1: أ\nالفصل التمهيدي\nالمادة 2: ب",
    );
    expect(result.articles[1]?.structureNodeKey).toBe("node-0001");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "UNRECOGNIZED_STRUCTURE_HEADING" }),
    );
  });

  it("preserves appearance order independently of article numbers", () => {
    const result = parseStructure(
      "المادة 10: أ\nالمادة 2 مكرر أ: ب\nالمادة 2: ج",
    );
    expect(result.articles.map((article) => article.number)).toEqual([
      "10",
      "2 مكرر أ",
      "2",
    ]);
    expect(result.articles.map((article) => article.sortKey)).toEqual([
      "000001",
      "000002",
      "000003",
    ]);
  });

  it("falls back without failing when no article marker exists", () => {
    const result = parseStructure("نص قانوني بلا عنوان مادة صريح");
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]?.status).toBe("REVIEW_REQUIRED");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "ARTICLE_MARKERS_NOT_FOUND" }),
    );
  });
});
