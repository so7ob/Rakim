import { Link, useParams } from "react-router-dom";
import { EmptyPanel, ErrorPanel, LoadingCards } from "../components/StatePanel";
import { LegislationSubpageHeader } from "../components/LegislationSubpageHeader";
import { useApi } from "../hooks/use-api";
interface Relation {
  id: string;
  relationType: string;
  scopeText: string;
  effectiveFrom: string;
  reviewStatus: string;
  direction: "OUTGOING" | "INCOMING";
  relatedId: string;
  relatedTitle: string;
  relatedNumber: string;
  relatedYear: number;
  evidenceSource: string;
}
const labels: Record<string, string> = {
  AMENDS: "يعدّل",
  REPEALS: "يلغي",
  IMPLEMENTS: "ينفّذ",
  BASED_ON: "يستند إلى",
  REFERS_TO: "يحيل إلى",
  CORRECTS: "يصحح",
  TOPICALLY_RELATED: "مرتبط موضوعيًا",
};
export function RelatedLegislationsPage() {
  const { id } = useParams();
  const { data, error, loading, retry } = useApi<Relation[]>(
    id ? `/legislations/${id}/relations` : null,
  );
  return (
    <>
      {id && (
        <LegislationSubpageHeader id={id} section="related-legislations" />
      )}
      <div className="container subresource-shell">
        <section className="subresource-panel">
          <header className="subresource-title">
            <h1>التشريعات ذات الصلة</h1>
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
            <div className="relation-grid reference-relations" role="table">
              <div className="relation-table-head" role="row">
                <span role="columnheader">نوع العلاقة</span>
                <span role="columnheader">التشريع</span>
                <span role="columnheader">رقم التشريع</span>
                <span role="columnheader">سنة الإصدار</span>
              </div>
              {data.map((relation) => (
                <article
                  className={`card relation-card ${relation.relationType === "TOPICALLY_RELATED" ? "thematic" : ""}`}
                  key={relation.id}
                  role="row"
                >
                  <div className="relation-label" role="cell">
                    <span>
                      {relation.direction === "OUTGOING"
                        ? (labels[relation.relationType] ??
                          relation.relationType)
                        : `علاقة واردة: ${labels[relation.relationType] ?? relation.relationType}`}
                    </span>
                    <small>
                      {relation.reviewStatus === "REVIEWED"
                        ? "مراجعة مكتملة"
                        : "غير مراجع"}
                    </small>
                  </div>
                  <h2 role="cell">
                    <Link to={`/ar/legislations/${relation.relatedId}`}>
                      {relation.relatedTitle}
                    </Link>
                  </h2>
                  <span className="relation-number" role="cell">
                    {relation.relatedNumber}
                  </span>
                  <span className="relation-year" role="cell">
                    {relation.relatedYear}
                  </span>
                  <details className="relation-evidence" role="cell">
                    <summary>تفاصيل العلاقة</summary>
                    <dl className="inline-meta">
                      <div>
                        <dt>النطاق</dt>
                        <dd>{relation.scopeText}</dd>
                      </div>
                      <div>
                        <dt>تاريخ الأثر</dt>
                        <dd>{relation.effectiveFrom}</dd>
                      </div>
                      <div>
                        <dt>دليل العلاقة</dt>
                        <dd>{relation.evidenceSource}</dd>
                      </div>
                    </dl>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
