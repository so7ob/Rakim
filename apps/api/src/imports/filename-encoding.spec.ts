import { describe, expect, it } from "vitest";
import { normalizeUploadedFilename } from "./imports.service.js";

describe("multipart filename normalization", () => {
  it("restores an Arabic UTF-8 filename decoded as latin1", () => {
    const expected = "قانون الاحتياط العام.txt";
    const mojibake = Buffer.from(expected, "utf8").toString("latin1");
    expect(normalizeUploadedFilename(mojibake)).toBe(expected);
  });

  it("keeps already-correct Arabic and ASCII filenames unchanged", () => {
    expect(normalizeUploadedFilename("قانون عربي.pdf")).toBe("قانون عربي.pdf");
    expect(normalizeUploadedFilename("law-2026.txt")).toBe("law-2026.txt");
  });
});
