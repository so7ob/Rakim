import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";

interface ModificationData {
  years: Array<{ year: number; count: number }>;
  amendments: Array<{
    id: string;
    titleAr: string;
    issueDate: string;
    effectiveFrom: string;
    year: number;
    sourceName: string;
    operations: Array<{
      id: string;
      operationType: string;
      articleLabel: string;
      paragraphLocator: string | null;
      citationText: string;
      previousText: string | null;
      newText: string | null;
    }>;
  }>;
}
const operations: Record<string, string> = {
  ADD: "إضافة",
  REPLACE: "استبدال",
  DELETE: "حذف",
  REPEAL: "إلغاء",
  RENUMBER: "إعادة ترقيم",
  CORRECT: "تصحيح",
};
export function ModificationsPage() {
  const { id } = useParams();
  const { data, error, loading, retry } = useApi<ModificationData>(
    id ? `/legislations/${id}/modifications` : null,
  );
  const [selected, setSelected] = useState<number | null>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const active = selected ?? data?.years[0]?.year ?? null;
  const shown = useMemo(
    () => data?.amendments.filter((item) => item.year === active) ?? [],
    [data, active],
  );
  const move = (direction: number) => {
    const years = data?.years ?? [];
    const index = Math.max(
      0,
      years.findIndex((item) => item.year === active),
    );
    setSelected(
      years[Math.min(years.length - 1, Math.max(0, index + direction))]?.year ??
        null,
    );
    timeline.current?.scrollBy({ left: direction * 180, behavior: "smooth" });
  };
  return (
    <div className="container page-shell">
      <Link className="back-dark" to={`/ar/legislations/${id}`}>
        ← العودة إلى التشريع
      </Link>
      <header className="page-title">
        <span className="eyebrow dark">سجل لا يفقد التاريخ</span>
        <h1>تعديلات التشريع</h1>
        <p>كل عملية مرتبطة بالمادة أو الفقرة والنص قبلها وبعدها ومصدرها.</p>
      </header>
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : (
        <>
          <div className="timeline-shell">
            <button
              className="timeline-arrow"
              onClick={() => move(-1)}
              aria-label="السنة الأحدث"
            >
              →
            </button>
            <div
              ref={timeline}
              className="year-timeline"
              role="tablist"
              aria-label="سنوات التعديلات"
            >
              {data?.years.map((item) => (
                <button
                  role="tab"
                  aria-selected={active === item.year}
                  tabIndex={active === item.year ? 0 : -1}
                  key={item.year}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowLeft") move(1);
                    if (event.key === "ArrowRight") move(-1);
                  }}
                  onClick={() => setSelected(item.year)}
                >
                  <strong>{item.year}</strong>
                  <span>{item.count} عمليات</span>
                </button>
              ))}
            </div>
            <button
              className="timeline-arrow"
              onClick={() => move(1)}
              aria-label="السنة الأقدم"
            >
              ←
            </button>
          </div>
          <div className="amendment-list">
            {shown.map((amendment) => (
              <article className="card amendment-card" key={amendment.id}>
                <header>
                  <div>
                    <span className="tag">
                      أثره من {amendment.effectiveFrom}
                    </span>
                    <h2>{amendment.titleAr}</h2>
                    <p>صدر في {amendment.issueDate}</p>
                  </div>
                  <small>المصدر: {amendment.sourceName}</small>
                </header>
                {amendment.operations.map((op) => (
                  <details key={op.id}>
                    <summary>
                      <span>
                        {operations[op.operationType] ?? op.operationType}
                      </span>{" "}
                      المادة {op.articleLabel}
                      {op.paragraphLocator
                        ? ` — الفقرة ${op.paragraphLocator}`
                        : ""}
                    </summary>
                    <p>{op.citationText}</p>
                    <div
                      className="comparison"
                      aria-label={`مقارنة عملية ${operations[op.operationType] ?? op.operationType}`}
                    >
                      <section>
                        <h3>− النص السابق</h3>
                        <p>
                          {op.previousText ?? "لا يوجد نص سابق لهذه العملية."}
                        </p>
                      </section>
                      <section>
                        <h3>+ النص الجديد</h3>
                        <p>{op.newText ?? "ألغيت العبارة المستهدفة."}</p>
                      </section>
                    </div>
                  </details>
                ))}
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
