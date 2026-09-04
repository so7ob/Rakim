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
    expect(result.articles.map((item) => item.label)).toEqual(["1", "2"]);
  });
});
