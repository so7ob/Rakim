import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyPanel, ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
import { LegislationSubpageHeader } from "../components/LegislationSubpageHeader";
import { UiIcon } from "../components/UiIcon";
import {
  AnnexContentView,
  type AnnexContentFormat,
} from "../components/AnnexContentView";
interface Annex {
  id: string;
  versionId: string;
  annexType: string;
  annexTypeLabel: string;
  titleAr: string;
  status: string;
  versionNo: number;
  validFrom: string;
  fileId: string | null;
  fileName: string | null;
  mediaType: string | null;
  pageCount: number | null;
  contentFormat: AnnexContentFormat;
  textContent: string | null;
  structuredTable: unknown;
  sourceId: string;
  sourceName: string;
  attachmentId: string | null;
  attachmentName: string | null;
}
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
    <>
      {id && <LegislationSubpageHeader id={id} section="regulations" />}
      <div className="container subresource-shell">
        <section className="subresource-panel">
          <header className="subresource-title">
            <h1 aria-label="اللوائح والجداول والملاحق">لوائح وجداول</h1>
            {id && (
              <Link
                className="legislation-full-link"
                to={`/ar/legislations/${id}`}
              >
                للاطلاع على كامل التشريع يرجى الضغط هنا
              </Link>
            )}
          </header>
          {loading ? (
            <LoadingCards />
          ) : error ? (
            <ErrorPanel message={error.message} retry={retry} />
          ) : !data?.length ? (
            <EmptyPanel />
          ) : (
            <div className="annex-list reference-annexes">
              {data.map((annex) => (
                <article
                  className="card annex-card"
                  id={`annex-${annex.id}`}
                  key={annex.versionId}
                >
                  <header>
                    <time dateTime={annex.validFrom}>{annex.validFrom}</time>
                    <div>
                      <h2>{annex.titleAr}</h2>
                      <p>
                        {annex.annexTypeLabel} — الإصدار {annex.versionNo}
                      </p>
                    </div>
                    <div className="annex-actions">
                      {annex.contentFormat === "FILE" && annex.fileId && (
                        <a
                          className="annex-download"
                          href={`/ar/legislations/${id}/regulations/${annex.id}/download`}
                        >
                          تنزيل
                        </a>
                      )}
                      <button
                        className="button secondary"
                        onClick={() =>
                          setOpen(
                            open === annex.versionId ? null : annex.versionId,
                          )
                        }
                        aria-expanded={open === annex.versionId}
                      >
                        <UiIcon
                          name={open === annex.versionId ? "minus" : "plus"}
                        />
                        <span className="sr-only">
                          {open === annex.versionId ? "إغلاق" : "فتح"}
                        </span>
                      </button>
                    </div>
                  </header>
                  {(open === annex.versionId ||
                    (open === annex.id && target === annex.id)) && (
                    <div className="annex-body">
                      <AnnexContentView
                        contentFormat={annex.contentFormat}
                        textContent={annex.textContent}
                        structuredTable={annex.structuredTable}
                        fileUrl={
                          annex.fileId
                            ? `/api/v1/annexes/${annex.id}/file?version=${encodeURIComponent(annex.versionId)}`
                            : null
                        }
                        fileName={annex.fileName}
                        mediaType={annex.mediaType}
                        pageCount={annex.pageCount}
                        title={annex.titleAr}
                        initialPage={target === annex.id ? initialPage : 1}
                      />
                      <div className="annex-reference-links">
                        <a
                          href={`/api/v1/annexes/${annex.id}/file?version=${encodeURIComponent(annex.versionId)}&role=source&download=1`}
                        >
                          المصدر: {annex.sourceName}
                        </a>
                        {annex.attachmentId &&
                          annex.contentFormat !== "FILE" && (
                            <a
                              href={`/api/v1/annexes/${annex.id}/file?version=${encodeURIComponent(annex.versionId)}&role=attachment&download=1`}
                            >
                              المرفق: {annex.attachmentName}
                            </a>
                          )}
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
