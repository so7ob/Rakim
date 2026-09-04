import { lazy, Suspense, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyPanel, ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
const PdfViewer = lazy(() =>
  import("../components/PdfViewer").then((module) => ({
    default: module.PdfViewer,
  })),
);
interface Annex {
  id: string;
  versionId: string;
  annexType: string;
  titleAr: string;
  status: string;
  versionNo: number;
  validFrom: string;
  fileId: string | null;
  fileName: string | null;
  pageCount: number | null;
  structuredTable: unknown;
}
const labels: Record<string, string> = {
  EXECUTIVE_REGULATION: "لائحة تنفيذية",
  TABLE: "جدول",
  FORM: "نموذج",
  ANNEX: "ملحق",
  MAP: "خريطة",
  TARIFF: "تعرفة",
  LIST: "قائمة",
  CORRECTION: "تصحيح",
};
export function RegulationsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const target = params.get("annex");
  const initialPage = Math.max(1, Number(params.get("page") ?? 1));
  const { data, error, loading, retry } = useApi<Annex[]>(
    id ? `/legislations/${id}/annexes` : null,
  );
  const [open, setOpen] = useState<string | null>(target);
  return (
    <div className="container page-shell">
      <Link className="back-dark" to={`/ar/legislations/${id}`}>
        ← العودة إلى التشريع
      </Link>
      <header className="page-title">
        <span className="eyebrow dark">إصدارات زمنية مستقلة</span>
        <h1>اللوائح والجداول والملاحق</h1>
        <p>
          ملفات المصدر منفصلة عن البيانات المنظمة ولا تحذف النسخة المستبدلة.
        </p>
      </header>
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : !data?.length ? (
        <EmptyPanel />
      ) : (
        <div className="annex-list">
          {data.map((annex) => (
            <article
              className="card annex-card"
              id={`annex-${annex.id}`}
              key={annex.versionId}
            >
              <header>
                <div>
                  <span className="tag">
                    {labels[annex.annexType] ?? annex.annexType}
                  </span>
                  <h2>{annex.titleAr}</h2>
                  <p>
                    الإصدار {annex.versionNo} — نافذ من {annex.validFrom}
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    setOpen(open === annex.versionId ? null : annex.versionId)
                  }
                  aria-expanded={open === annex.versionId}
                >
                  {open === annex.versionId ? "إغلاق" : "فتح"}
                </button>
              </header>
              {(open === annex.versionId ||
                (open === annex.id && target === annex.id)) && (
                <div className="annex-body">
                  {annex.fileId ? (
                    <Suspense fallback={<LoadingCards />}>
                      <PdfViewer
                        url={`/api/v1/annexes/${annex.id}/file?version=${encodeURIComponent(annex.versionId)}`}
                        fileName={annex.fileName ?? "ملف ملحق.pdf"}
                        reportedPages={annex.pageCount}
                        initialPage={target === annex.id ? initialPage : 1}
                      />
                    </Suspense>
                  ) : annex.structuredTable ? (
                    <StructuredTable
                      data={annex.structuredTable}
                      title={annex.titleAr}
                    />
                  ) : (
                    <EmptyPanel
                      title="لا يوجد ملف لهذا الإصدار"
                      body="بيانات الإصدار محفوظة، وسيضاف الملف بعد المراجعة."
                    />
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
function StructuredTable({ data, title }: { data: unknown; title: string }) {
  const value =
    typeof data === "string"
      ? (JSON.parse(data) as { columns: string[]; rows: string[][] })
      : (data as { columns: string[]; rows: string[][] });
  const csv = [value.columns, ...value.rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\r\n");
  return (
    <div className="table-wrap">
      <div className="row-actions">
        <button
          className="button secondary"
          onClick={() =>
            navigator.clipboard.writeText(
              [
                value.columns.join("\t"),
                ...value.rows.map((row) => row.join("\t")),
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
      <table>
        <thead>
          <tr>
            {value.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {value.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={`${column}-${cell}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="source-location">
        هذا عرض منظم مشتق؛ يبقى ملف المصدر المرجع المعتمد.
      </p>
    </div>
  );
}
