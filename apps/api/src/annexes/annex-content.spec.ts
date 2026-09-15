import { describe, expect, it } from "vitest";
import {
  ANNEX_TYPE_OPTIONS,
  annexOptionsResponse,
  assertAnnexContentFormat,
  parseStructuredTable,
} from "./annex-content.js";

describe("annex content catalog and validation", () => {
  it("publishes all Arabic type labels with their configured defaults", () => {
    expect(annexOptionsResponse().types).toEqual([
      expect.objectContaining({
        code: "EXECUTIVE_REGULATION",
        labelAr: "لائحة تنفيذية",
        defaultContentFormat: "TEXT",
      }),
      expect.objectContaining({
        code: "TABLE",
        labelAr: "جدول",
        defaultContentFormat: "STRUCTURED_TABLE",
      }),
      expect.objectContaining({
        code: "FORM",
        labelAr: "نموذج",
        defaultContentFormat: "FILE",
      }),
      expect.objectContaining({
        code: "ANNEX",
        labelAr: "ملحق",
        defaultContentFormat: "TEXT",
      }),
      expect.objectContaining({
        code: "MAP",
        labelAr: "خريطة",
        defaultContentFormat: "FILE",
      }),
      expect.objectContaining({
        code: "TARIFF",
        labelAr: "تعرفة",
        defaultContentFormat: "STRUCTURED_TABLE",
      }),
      expect.objectContaining({
        code: "LIST",
        labelAr: "قائمة",
        defaultContentFormat: "STRUCTURED_TABLE",
      }),
      expect.objectContaining({
        code: "CORRECTION",
        labelAr: "تصحيح",
        defaultContentFormat: "TEXT",
      }),
    ]);
    expect(new Set(ANNEX_TYPE_OPTIONS.map((item) => item.code)).size).toBe(8);
  });

  it("accepts only content methods configured for each type", () => {
    expect(assertAnnexContentFormat("TABLE", "STRUCTURED_TABLE")).toBe(
      "STRUCTURED_TABLE",
    );
    expect(assertAnnexContentFormat("ANNEX", "TEXT")).toBe("TEXT");
    expect(assertAnnexContentFormat("FORM", "FILE")).toBe("FILE");
    expect(() => assertAnnexContentFormat("FORM", "TEXT")).toThrow(/لا تتوافق/);
    expect(() =>
      assertAnnexContentFormat("EXECUTIVE_REGULATION", "STRUCTURED_TABLE"),
    ).toThrow(/لا تتوافق/);
  });

  it("normalizes valid tables and rejects malformed rows and unsafe cells", () => {
    expect(
      parseStructuredTable(
        '{"columns":[" الفئة ","النصاب"],"rows":[["الإبل",5]]}',
      ),
    ).toEqual({
      columns: ["الفئة", "النصاب"],
      rows: [["الإبل", 5]],
    });
    expect(() =>
      parseStructuredTable({ columns: ["أ", "ب"], rows: [["واحد"]] }),
    ).toThrow(/عدد خلايا/);
    expect(() =>
      parseStructuredTable({
        columns: ["أ"],
        rows: [[{ html: "<script>" }]],
      }),
    ).toThrow(/خلايا الجدول/);
  });
});
