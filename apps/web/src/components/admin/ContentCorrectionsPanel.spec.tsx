import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContentCorrectionsPanel } from "./ContentCorrectionsPanel";
import type { AnnexOptions } from "./AnnexContentFields";

vi.mock("../../auth/AuthContext", () => ({
  useAuth: () => ({ hasPermission: () => true }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const options: AnnexOptions = {
  types: [
    {
      code: "TABLE",
      labelAr: "جدول",
      allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
      defaultContentFormat: "STRUCTURED_TABLE",
    },
  ],
  contentFormats: [
    { code: "STRUCTURED_TABLE", labelAr: "جدول منظم" },
    { code: "FILE", labelAr: "ملف" },
  ],
};

describe("ContentCorrectionsPanel annex editor", () => {
  it("loads the same structured editor when creating an annex correction", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/available")
          ? [
              {
                kind: "ANNEX",
                allowed: true,
                policyCheck: {
                  code: "EDIT_ANNEX_HISTORY",
                  message: "تصحيح ملحق منشور",
                  applies: false,
                  allowed: true,
                  result: "NOT_APPLICABLE",
                },
              },
            ]
          : url.includes("/admin/annexes/annex")
            ? {
                id: "annex",
                legislationId: "law",
                annexType: "TABLE",
                annexTypeLabel: "جدول",
                titleAr: "جدول نصاب الإبل",
                status: "PUBLISHED",
                editFingerprint: "a".repeat(64),
                version: {
                  versionId: "version",
                  validFrom: "2026-01-01",
                  validTo: null,
                  sourceDocumentId: "source",
                  contentFormat: "STRUCTURED_TABLE",
                  textContent: null,
                  structuredTableJson:
                    '{"columns":["العدد","الواجب"],"rows":[[5,"شاة"]]}',
                  source: {
                    id: "source",
                    originalName: "القانون.pdf",
                    mediaType: "application/pdf",
                  },
                },
              }
            : [];
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );
    render(
      <MemoryRouter>
        <ContentCorrectionsPanel
          lawId="law"
          articles={[]}
          annexes={[
            { id: "annex", titleAr: "جدول نصاب الإبل", status: "PUBLISHED" },
          ]}
          annexOptions={options}
          sources={[
            {
              id: "source",
              originalName: "القانون.pdf",
              mediaType: "application/pdf",
            },
          ]}
          onChange={() => undefined}
        />
      </MemoryRouter>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "إنشاء مسودة تصحيح" }),
    );
    fireEvent.change(screen.getByLabelText("نوع المحتوى"), {
      target: { value: "ANNEX" },
    });
    expect(
      (
        (await screen.findByRole("textbox", {
          name: "جدول منظم JSON",
        })) as HTMLTextAreaElement
      ).value,
    ).toContain('"الواجب"');
    expect(screen.getByRole("cell", { name: "شاة" })).toBeVisible();
    expect(screen.getByLabelText("تاريخ نفاذ التصحيح")).toBeVisible();
  });
});
