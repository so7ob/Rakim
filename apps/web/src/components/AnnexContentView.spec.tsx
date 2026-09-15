import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnnexContentView, readStructuredTable } from "./AnnexContentView";

afterEach(cleanup);

describe("AnnexContentView", () => {
  it("renders text with its saved paragraph breaks", () => {
    render(
      <AnnexContentView
        contentFormat="TEXT"
        textContent={"الفقرة الأولى\n\nالفقرة الثانية"}
        title="ملحق نصي"
      />,
    );
    expect(screen.getByText(/الفقرة الأولى/).textContent).toBe(
      "الفقرة الأولى\n\nالفقرة الثانية",
    );
  });

  it("renders structured cells as text without interpreting HTML", () => {
    render(
      <AnnexContentView
        contentFormat="STRUCTURED_TABLE"
        structuredTable={{
          columns: ["الوصف"],
          rows: [["<img src=x onerror=alert(1)>"]],
        }}
        title="جدول"
      />,
    );
    expect(screen.getByRole("cell")).toHaveTextContent("<img src=x");
    expect(document.querySelector("img")).toBeNull();
  });

  it("returns a clear validation error for incompatible rows", () => {
    expect(() =>
      readStructuredTable({ columns: ["أ", "ب"], rows: [["أ"]] }),
    ).toThrow(/لا تطابق/);
    render(
      <AnnexContentView
        contentFormat="STRUCTURED_TABLE"
        structuredTable="not-json"
        title="قديم"
      />,
    );
    expect(screen.getByText("تعذر عرض محتوى الجدول")).toBeInTheDocument();
  });

  it("renders an image file with accessible alternative text", () => {
    render(
      <AnnexContentView
        contentFormat="FILE"
        fileUrl="/api/v1/admin/sources/image/file"
        fileName="خريطة.png"
        mediaType="image/png"
        title="خريطة المناطق"
      />,
    );
    expect(screen.getByRole("img", { name: "خريطة المناطق" })).toHaveAttribute(
      "src",
      "/api/v1/admin/sources/image/file",
    );
  });
});
