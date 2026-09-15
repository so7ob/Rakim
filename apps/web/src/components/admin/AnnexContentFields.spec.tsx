import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnnexContentFields,
  type AnnexDetail,
  type AnnexOptions,
} from "./AnnexContentFields";

const options: AnnexOptions = {
  types: [
    {
      code: "EXECUTIVE_REGULATION",
      labelAr: "لائحة تنفيذية",
      allowedContentFormats: ["TEXT", "FILE"],
      defaultContentFormat: "TEXT",
    },
    {
      code: "TABLE",
      labelAr: "جدول",
      allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
      defaultContentFormat: "STRUCTURED_TABLE",
    },
    {
      code: "FORM",
      labelAr: "نموذج",
      allowedContentFormats: ["FILE"],
      defaultContentFormat: "FILE",
    },
    {
      code: "ANNEX",
      labelAr: "ملحق",
      allowedContentFormats: ["TEXT", "FILE"],
      defaultContentFormat: "TEXT",
    },
    {
      code: "MAP",
      labelAr: "خريطة",
      allowedContentFormats: ["FILE"],
      defaultContentFormat: "FILE",
    },
    {
      code: "TARIFF",
      labelAr: "تعرفة",
      allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
      defaultContentFormat: "STRUCTURED_TABLE",
    },
    {
      code: "LIST",
      labelAr: "قائمة",
      allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
      defaultContentFormat: "STRUCTURED_TABLE",
    },
    {
      code: "CORRECTION",
      labelAr: "تصحيح",
      allowedContentFormats: ["TEXT", "FILE"],
      defaultContentFormat: "TEXT",
    },
  ],
  contentFormats: [
    { code: "TEXT", labelAr: "نص" },
    { code: "STRUCTURED_TABLE", labelAr: "جدول منظم" },
    { code: "FILE", labelAr: "ملف" },
  ],
};
const sources = [
  { id: "pdf", originalName: "القانون.pdf", mediaType: "application/pdf" },
];

afterEach(cleanup);

describe("AnnexContentFields", () => {
  it("shows server-provided Arabic types and changes fields with the type", () => {
    render(
      <MemoryRouter>
        <AnnexContentFields
          options={options}
          sources={sources}
          legislationId="law"
          canPublish
        />
      </MemoryRouter>,
    );
    const type = screen.getByRole("combobox", { name: "النوع" });
    expect(
      Array.from((type as HTMLSelectElement).options).map(
        (option) => option.textContent,
      ),
    ).toEqual([
      "لائحة تنفيذية",
      "جدول",
      "نموذج",
      "ملحق",
      "خريطة",
      "تعرفة",
      "قائمة",
      "تصحيح",
    ]);
    expect(screen.getByRole("textbox", { name: "نص المحتوى" })).toBeVisible();
    fireEvent.change(type, { target: { value: "TABLE" } });
    const json = screen.getByRole("textbox", { name: "جدول منظم JSON" });
    fireEvent.change(json, {
      target: {
        value: '{"columns":["الفئة"],"rows":[["الإبل"]]}',
      },
    });
    fireEvent.change(type, { target: { value: "ANNEX" } });
    expect(screen.getByRole("textbox", { name: "نص المحتوى" })).toBeVisible();
    fireEvent.change(type, { target: { value: "TABLE" } });
    expect(screen.getByRole("textbox", { name: "جدول منظم JSON" })).toHaveValue(
      '{"columns":["الفئة"],"rows":[["الإبل"]]}',
    );
  });

  it("loads the complete saved JSON and fingerprint for editing", () => {
    const initial: AnnexDetail = {
      id: "annex",
      legislationId: "law",
      annexType: "TABLE",
      annexTypeLabel: "جدول",
      titleAr: "نصاب زكاة الإبل",
      status: "DRAFT",
      editFingerprint: "a".repeat(64),
      version: {
        versionId: "version",
        validFrom: "2026-01-01",
        validTo: null,
        sourceDocumentId: "pdf",
        contentFormat: "STRUCTURED_TABLE",
        textContent: null,
        structuredTableJson:
          '{"columns":["العدد","الواجب"],"rows":[[5,"شاة"]]}',
        source: {
          id: "pdf",
          originalName: "القانون.pdf",
          mediaType: "application/pdf",
        },
      },
    };
    const { container } = render(
      <MemoryRouter>
        <AnnexContentFields
          options={options}
          sources={sources}
          legislationId="law"
          initial={initial}
          canPublish
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("textbox", { name: "جدول منظم JSON" })).toHaveValue(
      initial.version.structuredTableJson,
    );
    expect(
      container.querySelector<HTMLInputElement>('input[name="editFingerprint"]')
        ?.value,
    ).toBe(initial.editFingerprint);
    expect(screen.getByRole("cell", { name: "شاة" })).toBeInTheDocument();
  });
});
