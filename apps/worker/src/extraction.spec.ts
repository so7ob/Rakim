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
