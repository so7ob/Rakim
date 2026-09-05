import { Link } from "react-router-dom";
import { useApi } from "../hooks/use-api";
import type { ListResponse } from "../types";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { formatLegalDate } from "../legal-format";

interface LatestModification {
  id: string;
  titleAr: string;
  effectiveFrom: string;
  legislationId: string;
}

function DataList({
  title,
  items,
  moreTo,
  empty,
}: {
  title: string;
  items: Array<{ id: string; label: string; to: string }>;
  moreTo?: string;
  empty?: string;
}) {
  return (
    <section className="home-data-panel">
      <h2>{title}</h2>
      {items.length ? (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <Link to={item.to}>{item.label}</Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="home-data-empty">{empty ?? "لا توجد بيانات منشورة."}</p>
      )}
      {moreTo && (
        <Link className="home-more-link" to={moreTo}>
          أظهر المزيد <span aria-hidden="true">←</span>
        </Link>
      )}
    </section>
  );
}

export function HomePage() {
  const { data, error, loading, retry } = useApi<ListResponse>(
    "/legislations?pageSize=5&sort=newest",
  );
  const modifications = useApi<LatestModification[]>(
    "/legislations/latest-modifications?limit=5",
  );
  return (
    <>
      <section className="home-reference-hero">
        <div className="home-pattern" aria-hidden="true" />
        <div className="container">
          <div className="home-introduction">
            <h1>التشريعات اليمنية</h1>
            <p>
              منصة محلية موحّدة لتنظيم التشريعات اليمنية ونصوصها ونسخها الزمنية
              ومصادرها، وتيسير الوصول إلى القانون النافذ والرجوع إلى تاريخه
              الموثق.
            </p>
            <div className="home-hero-actions">
              <Link to="/ar/legislations">استعراض التشريعات</Link>
              <Link to="/ar/search">البحث المتقدم</Link>
            </div>
            <small>المحتوى الحالي اصطناعي وغير رسمي لأغراض التطوير.</small>
          </div>
        </div>
      </section>
      <section
        className="container home-content-overlap"
        aria-label="بوابة موضوعات التشريعات"
      >
        {loading ? (
          <LoadingCards />
        ) : error ? (
          <ErrorPanel message={error.message} retry={retry} />
        ) : (
          <div className="home-reference-grid">
            <div className="home-subject-grid">
              {data?.filters.subjects.map((subject, index) => (
                <Link
                  className={`home-subject-card subject-tone-${(index % 5) + 1}`}
                  key={subject.code}
                  to={`/ar/legislations?subject=${encodeURIComponent(subject.code)}`}
                >
                  <span className="subject-symbol" aria-hidden="true" />
                  <span className="subject-name">{subject.name}</span>
                  <span className="subject-count">
                    <strong>{subject.count ?? "—"}</strong> تشريع
                  </span>
                </Link>
              ))}
              {!data?.filters.subjects.length && (
                <div className="home-empty-category">
                  لم تُضف موضوعات تشريعية بعد.
                </div>
              )}
            </div>
            <aside
              className="home-data-stack"
              aria-label="ملخص بيانات التشريعات"
            >
              <section className="home-data-panel home-statistics">
                <h2>إحصائيات التشريعات</h2>
                <div>
                  <Link to="/ar/legislations">
                    <strong>{data?.meta.total ?? 0}</strong>
                    <span>تشريع منشور</span>
                  </Link>
                  <Link to="/ar/legislations">
                    <strong>{data?.filters.types.length ?? 0}</strong>
                    <span>أنواع تشريعية</span>
                  </Link>
                  <Link to="/ar/legislations">
                    <strong>{data?.filters.authorities.length ?? 0}</strong>
                    <span>جهات مصدرة</span>
                  </Link>
                </div>
              </section>
              <DataList
                title="أحدث التشريعات"
                moreTo="/ar/legislations?sort=newest"
                items={(data?.items ?? []).map((item) => ({
                  id: item.id,
                  label: item.titleAr,
                  to: `/ar/legislations/${item.id}`,
                }))}
              />
              <DataList
                title="آخر التعديلات التشريعية"
                moreTo="/ar/latest-modifications"
                items={(modifications.data ?? [])
                  .slice(0, 5)
                  .map((item) => ({
                    id: item.id,
                    label: `${item.titleAr} — ${formatLegalDate(item.effectiveFrom)}`,
                    to: `/ar/legislations/${item.legislationId}/modifications`,
                  }))}
                empty={
                  modifications.loading
                    ? "جار تحميل التعديلات…"
                    : "لا توجد تعديلات منشورة."
                }
              />
              <DataList
                title="التشريعات الأكثر اطلاعًا"
                items={[]}
                empty="لا تتوفر إحصاءات استخدام موثوقة في الـAPI حاليًا."
              />
            </aside>
          </div>
        )}
      </section>
      <section
        className="section home-resources"
        aria-labelledby="resources-title"
      >
        <div className="container">
          <div className="title-wrapper">
            <h2 id="resources-title">الوصول السريع</h2>
          </div>
          <div className="home-resource-grid">
            <Link to="/ar/constitution">
              <span aria-hidden="true">§</span>
              <strong>الدستور</strong>
              <small>المرجعية الدستورية ومحتواها المنشور</small>
            </Link>
            <Link to="/ar/legislative-system">
              <span aria-hidden="true">◫</span>
              <strong>المنظومة التشريعية</strong>
              <small>دليل الأدوات والتدرج التشريعي</small>
            </Link>
            <Link to="/ar/latest-modifications">
              <span aria-hidden="true">↻</span>
              <strong>آخر التعديلات</strong>
              <small>متابعة الأثر التشريعي زمنيًا</small>
            </Link>
            <Link to="/ar/search">
              <span aria-hidden="true">⌕</span>
              <strong>البحث في النصوص</strong>
              <small>الوصول إلى التشريع والمادة والنسخة</small>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
