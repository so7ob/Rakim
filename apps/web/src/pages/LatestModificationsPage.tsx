import { Link } from "react-router-dom";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
import { formatLegalDate } from "../legal-format";

interface LatestModification {
  id: string;
  titleAr: string;
  issueDate: string;
  effectiveFrom: string;
  legislationId: string;
  legislationTitle: string;
  legislationNumber: string;
  legislationYear: number;
  sourceName: string;
  operationCount: number;
}

export function LatestModificationsPage() {
  const { data, error, loading, retry } = useApi<LatestModification[]>(
    "/legislations/latest-modifications",
  );
  return (
    <>
      <section className="public-page-hero compact-public-hero">
        <div className="container">
          <nav className="detail-breadcrumb" aria-label="مسار التنقل">
            <Link to="/ar">الصفحة الرئيسية</Link>
            <span aria-hidden="true">/</span>
            <span>آخر التعديلات التشريعية</span>
          </nav>
          <span className="eyebrow">متابعة زمنية موثقة</span>
          <h1>آخر التعديلات التشريعية</h1>
          <p>أحدث أدوات التعديل المنشورة مرتبة بحسب تاريخ بدء الأثر.</p>
        </div>
      </section>
      <div className="container listing-overlap">
        <section className="listing-panel latest-panel">
          {loading ? (
            <LoadingCards />
          ) : error ? (
            <ErrorPanel message={error.message} retry={retry} />
          ) : !data?.length ? (
            <div className="state-panel">
              <h2>لا توجد تعديلات منشورة</h2>
            </div>
          ) : (
            <div className="latest-modification-list">
              {data.map((item) => (
                <article key={item.id}>
                  <time dateTime={item.effectiveFrom}>
                    {formatLegalDate(item.effectiveFrom)}
                  </time>
                  <div>
                    <span className="tag">{item.operationCount} عمليات</span>
                    <h2>{item.titleAr}</h2>
                    <p>المصدر: {item.sourceName}</p>
                  </div>
                  <div>
                    <Link to={`/ar/legislations/${item.legislationId}`}>
                      {item.legislationTitle}
                    </Link>
                    <small>
                      رقم {item.legislationNumber} لسنة {item.legislationYear}
                    </small>
                    <Link
                      className="text-link"
                      to={`/ar/legislations/${item.legislationId}/modifications`}
                    >
                      عرض سجل التعديلات ←
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
