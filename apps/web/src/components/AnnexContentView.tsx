import { lazy, Suspense } from "react";
import { EmptyPanel, LoadingCards } from "./StatePanel";

const PdfViewer = lazy(() =>
  import("./PdfViewer").then((module) => ({ default: module.PdfViewer })),
);

export type AnnexContentFormat = "TEXT" | "STRUCTURED_TABLE" | "FILE";
export type StructuredTableValue = {
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

export function readStructuredTable(data: unknown): StructuredTableValue {
  const value = typeof data === "string" ? JSON.parse(data) : data;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("يجب أن يحتوي الجدول على columns وrows.");
  const { columns, rows } = value as Record<string, unknown>;
  if (!Array.isArray(columns) || !columns.length)
    throw new Error("أعمدة الجدول غير موجودة.");
  if (columns.some((column) => typeof column !== "string" || !column.trim()))
    throw new Error("عناوين أعمدة الجدول غير صالحة.");
  if (
    !Array.isArray(rows) ||
    rows.some((row) => !Array.isArray(row) || row.length !== columns.length)
  )
    throw new Error("صفوف الجدول لا تطابق عدد الأعمدة.");
  return value as StructuredTableValue;
}

export function AnnexContentView({
  contentFormat,
  textContent,
  structuredTable,
  fileUrl,
  fileName,
  mediaType,
  pageCount,
  title,
  initialPage = 1,
  compact = false,
}: {
  contentFormat: AnnexContentFormat;
  textContent?: string | null;
  structuredTable?: unknown;
  fileUrl?: string | null;
  fileName?: string | null;
  mediaType?: string | null;
  pageCount?: number | null;
  title: string;
  initialPage?: number;
  compact?: boolean;
}) {
  if (contentFormat === "TEXT")
    return textContent?.trim() ? (
      <div className="annex-text-content">{textContent}</div>
    ) : (
      <ContentUnavailable />
    );
  if (contentFormat === "STRUCTURED_TABLE") {
    try {
      return (
        <StructuredTable
          data={readStructuredTable(structuredTable)}
          title={title}
          compact={compact}
        />
      );
    } catch (error) {
      return (
        <EmptyPanel
          title="تعذر عرض محتوى الجدول"
          body={
            error instanceof Error
              ? error.message
              : "بيانات الجدول المحفوظة غير صالحة."
          }
        />
      );
    }
  }
  if (!fileUrl) return <ContentUnavailable />;
  if (mediaType === "application/pdf")
    return (
      <Suspense fallback={<LoadingCards />}>
        <PdfViewer
          url={fileUrl}
          fileName={fileName ?? `${title}.pdf`}
          reportedPages={pageCount}
          initialPage={initialPage}
        />
      </Suspense>
    );
  if (mediaType?.startsWith("image/"))
    return (
      <figure className="annex-image-preview">
        <img src={fileUrl} alt={title} />
        <figcaption>{fileName ?? title}</figcaption>
      </figure>
    );
  return (
    <a className="button secondary" href={fileUrl}>
      تنزيل {fileName ?? "ملف الملحق"}
    </a>
  );
}

function ContentUnavailable() {
  return (
    <EmptyPanel
      title="المحتوى غير قابل للعرض"
      body="لا تتوفر بيانات قابلة للعرض لهذه النسخة."
    />
  );
}

function StructuredTable({
  data,
  title,
  compact,
}: {
  data: StructuredTableValue;
  title: string;
  compact: boolean;
}) {
  const csv = [data.columns, ...data.rows]
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\r\n");
  return (
    <div className="table-wrap annex-table-preview">
      {!compact && (
        <div className="row-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              navigator.clipboard.writeText(
                [
                  data.columns.join("\t"),
                  ...data.rows.map((row) => row.join("\t")),
                ].join("\n"),
              )
            }
          >
            نسخ الجدول
          </button>
          <a
            className="button secondary"
            download={`${title}.csv`}
            href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + csv)}`}
          >
            تصدير CSV
          </a>
        </div>
      )}
      <table>
        <thead>
          <tr>
            {data.columns.map((column, index) => (
              <th key={`${index}-${column}`}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, columnIndex) => (
                <td key={columnIndex}>{String(cell ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
