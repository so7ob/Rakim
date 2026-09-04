import { Fragment, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../hooks/use-api";
import { EmptyPanel, ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../api";

interface Facet {
  code: string | number;
  name: string;
  count: number;
}
interface SearchResponse {
  query: string;
  items: Array<{
    entityType: string;
    entityId: string;
    legislationId: string;
    articleId: string | null;
    annexId: string | null;
    pageNumber: number | null;
    titleAr: string;
    legislationTitle: string;
    year: number;
    officialNumber: string;
    snippet: string;
    score: number;
    validFrom: string | null;
    validTo: string | null;
    verificationLevel: string;
    typeName: string;
    authorityName: string;
    legalStatus: string;
    matchedTerms: string[];
  }>;
  meta: { total: number; page: number; pageSize: number; pageCount: number };
  facets: {
    types: Facet[];
    years: Facet[];
    authorities: Facet[];
    statuses: Facet[];
    subjects: Facet[];
  };
}
interface Analytics {
  totalResults: number;
  uniqueLegislations: number;
  references: number;
  timeline: Array<{ year: number; count: number }>;
  cooccurring: Array<{ term: string; count: number }>;
  entityDistribution: Array<{ name: string; count: number }>;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const auth = useAuth();
  const path = q ? `/search?${params.toString()}` : null;
  const analyticsPath = q ? `/search/analytics?${params.toString()}` : null;
  const result = useApi<SearchResponse>(path);
  const analytics = useApi<Analytics>(analyticsPath);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of [
      "q",
      "mode",
      "field",
      "at",
      "type",
      "authority",
      "subject",
      "status",
      "yearFrom",
      "yearTo",
      "verification",
      "entityType",
      "proximityFirst",
      "proximitySecond",
      "proximityDistance",
    ]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) next.set(key, value);
    }
    if (form.get("historical")) next.set("historical", "true");
    setParams(next);
  };
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  };
  const page = Number(params.get("page") ?? 1);
  return (
    <div className="container page-shell">
      <header className="page-title">
        <span className="eyebrow dark">داخل النصوص والنسخ والملحقات</span>
        <h1>البحث المتقدم والتحليلات</h1>
        <p>
          اختر طريقة المطابقة، أو استخدم علامتي اقتباس لعبارة حرفية والشرطة قبل
          كلمة لاستبعادها.
        </p>
      </header>
      <form className="advanced-search search-form-expanded" onSubmit={submit}>
        <label className="search-query-field">
          عبارة البحث
          <input
            name="q"
            defaultValue={q}
            required
            placeholder={'مثال: "المال العام" الضريبة -الجمارك'}
          />
        </label>
        <label>
          طريقة المطابقة
          <select name="mode" defaultValue={params.get("mode") ?? "all"}>
            <option value="all">كل الكلمات</option>
            <option value="any">أي كلمة</option>
            <option value="exact">عبارة حرفية</option>
          </select>
        </label>
        <label>
          الحقل
          <select name="field" defaultValue={params.get("field") ?? "all"}>
            <option value="all">كل النصوص</option>
            <option value="title">العنوان/المادة</option>
            <option value="number">الرقم والسنة</option>
          </select>
        </label>
        <label>
          نافذ في تاريخ
          <input type="date" name="at" defaultValue={params.get("at") ?? ""} />
        </label>
        <label>
          نوع النتيجة
          <select
            name="entityType"
            defaultValue={params.get("entityType") ?? ""}
          >
            <option value="">كل المحتوى</option>
            <option value="LEGISLATION">تشريع</option>
            <option value="ARTICLE_VERSION">مادة</option>
            <option value="AMENDMENT">تعديل</option>
            <option value="ANNEX_PAGE">صفحة ملحق</option>
            <option value="RELATION">علاقة</option>
          </select>
        </label>
        <label>
          من سنة
          <input
            type="number"
            name="yearFrom"
            min="1800"
            max="2200"
            defaultValue={params.get("yearFrom") ?? ""}
          />
        </label>
        <label>
          إلى سنة
          <input
            type="number"
            name="yearTo"
            min="1800"
            max="2200"
            defaultValue={params.get("yearTo") ?? ""}
          />
        </label>
        <label>
          الكلمة الأولى للقرب
          <input
            name="proximityFirst"
            defaultValue={params.get("proximityFirst") ?? ""}
          />
        </label>
        <label>
          الكلمة الثانية
          <input
            name="proximitySecond"
            defaultValue={params.get("proximitySecond") ?? ""}
          />
        </label>
        <label>
          المسافة القصوى
          <input
            type="number"
            name="proximityDistance"
            min="1"
            max="50"
            defaultValue={params.get("proximityDistance") ?? "5"}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="historical"
            defaultChecked={params.get("historical") === "true"}
          />{" "}
          تضمين النسخ التاريخية
        </label>
        <button className="button">بحث</button>
      </form>
      {q && (
        <>
          <div className="results-heading" aria-live="polite">
            <strong>
              {result.loading
                ? "جار البحث…"
                : `${result.data?.meta.total ?? 0} نتيجة`}
            </strong>
            {auth.user && <SaveSearch query={Object.fromEntries(params)} />}
            <a
              className="button secondary"
              href={`/api/v1/search/export.csv?${params.toString()}`}
            >
              تصدير CSV
            </a>
          </div>
          {result.data && (
            <div className="facet-bar" aria-label="مرشحات النتائج">
              <FacetSelect
                label="النوع"
                name="type"
                values={result.data.facets.types}
                value={params.get("type") ?? ""}
                change={update}
              />
              <FacetSelect
                label="الجهة"
                name="authority"
                values={result.data.facets.authorities}
                value={params.get("authority") ?? ""}
                change={update}
              />
              <FacetSelect
                label="الموضوع"
                name="subject"
                values={result.data.facets.subjects}
                value={params.get("subject") ?? ""}
                change={update}
              />
              <FacetSelect
                label="الحالة"
                name="status"
                values={result.data.facets.statuses}
                value={params.get("status") ?? ""}
                change={update}
              />
              <FacetSelect
                label="درجة التحقق"
                name="verification"
                values={["A", "B", "C", "D"].map((code) => ({
                  code,
                  name: code,
                  count: 0,
                }))}
                value={params.get("verification") ?? ""}
                change={update}
              />
            </div>
          )}
        </>
      )}
      {result.loading ? (
        <LoadingCards />
      ) : result.error ? (
        <ErrorPanel message={result.error.message} retry={result.retry} />
      ) : q && !result.data?.items.length ? (
        <EmptyPanel title="لا تطابقات" />
      ) : (
        <>
          <div className="search-results">
            {result.data?.items.map((item) => (
              <article
                className="card search-result"
                key={`${item.entityType}-${item.entityId}-${item.pageNumber ?? ""}`}
              >
                <div className="card-top">
                  <span className="tag">{entityLabel(item.entityType)}</span>
                  <span>
                    صلة {Number(item.score).toFixed(1)} — تحقق{" "}
                    {item.verificationLevel}
                  </span>
                </div>
                <h2>
                  <Link to={resultLink(item)}>{item.titleAr}</Link>
                </h2>
                <p className="parent-title">
                  {item.legislationTitle} — {item.officialNumber}/{item.year}
                </p>
                <p>
                  <Highlight text={item.snippet} terms={item.matchedTerms} />
                </p>
                <dl className="inline-meta">
                  <div>
                    <dt>النوع</dt>
                    <dd>{item.typeName}</dd>
                  </div>
                  <div>
                    <dt>الجهة</dt>
                    <dd>{item.authorityName}</dd>
                  </div>
                  {item.pageNumber && (
                    <div>
                      <dt>الصفحة</dt>
                      <dd>{item.pageNumber}</dd>
                    </div>
                  )}
                  {item.validFrom && (
                    <div>
                      <dt>النسخة</dt>
                      <dd>
                        {item.validFrom} — {item.validTo ?? "مستمرة"}
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>
          {result.data && result.data.meta.pageCount > 1 && (
            <nav className="pagination" aria-label="صفحات نتائج البحث">
              <button
                disabled={page <= 1}
                onClick={() => update("page", String(page - 1))}
              >
                السابق
              </button>
              <span>
                صفحة {page} من {result.data.meta.pageCount}
              </span>
              <button
                disabled={page >= result.data.meta.pageCount}
                onClick={() => update("page", String(page + 1))}
              >
                التالي
              </button>
            </nav>
          )}
        </>
      )}
      {q && (
        <AnalyticsPanel
          data={analytics.data}
          loading={analytics.loading}
          error={analytics.error}
        />
      )}
    </div>
  );
}

function FacetSelect({
  label,
  name,
  values,
  value,
  change,
}: {
  label: string;
  name: string;
  values: Facet[];
  value: string;
  change: (key: string, value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => change(name, e.target.value)}>
        <option value="">الكل</option>
        {values.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
            {item.count ? ` (${item.count})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
function SaveSearch({ query }: { query: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="save-search">
      <button className="button secondary" onClick={() => setOpen(!open)}>
        حفظ البحث
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            try {
              await apiRequest("/me/saved-searches", {
                body: { name: form.get("name"), query },
              });
              setMessage("حُفظ البحث في حسابك.");
              setOpen(false);
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "تعذر الحفظ.",
              );
            }
          }}
        >
          <input
            name="name"
            required
            placeholder="اسم البحث"
            aria-label="اسم البحث المحفوظ"
          />
          <button className="button">حفظ</button>
        </form>
      )}
      {message && <span role="status">{message}</span>}
    </div>
  );
}
function entityLabel(value: string) {
  return (
    (
      {
        LEGISLATION: "تشريع",
        ARTICLE_VERSION: "مادة",
        AMENDMENT: "تعديل",
        ANNEX_PAGE: "صفحة ملحق",
        RELATION: "علاقة قانونية",
      } as Record<string, string>
    )[value] ?? value
  );
}
function resultLink(item: SearchResponse["items"][number]) {
  if (item.entityType === "ANNEX_PAGE")
    return `/ar/legislations/${item.legislationId}/regulations?annex=${item.annexId ?? ""}&page=${item.pageNumber ?? 1}`;
  return item.articleId
    ? `/ar/legislations/${item.legislationId}#article-${item.articleId}`
    : `/ar/legislations/${item.legislationId}`;
}
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const clean = terms.filter(Boolean);
  if (!clean.length) return <>{text}</>;
  const expression = new RegExp(
    `(${clean.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "giu",
  );
  return (
    <>
      {text
        .split(expression)
        .map((part, index) =>
          clean.some(
            (term) =>
              part.localeCompare(term, "ar", { sensitivity: "base" }) === 0,
          ) ? (
            <mark key={index}>{part}</mark>
          ) : (
            <Fragment key={index}>{part}</Fragment>
          ),
        )}
    </>
  );
}
function AnalyticsPanel({
  data,
  loading,
  error,
}: {
  data: Analytics | null;
  loading: boolean;
  error: Error | null;
}) {
  if (loading)
    return (
      <section className="analytics-panel">
        <h2>جار إعداد التحليلات…</h2>
      </section>
    );
  if (error || !data) return null;
  const maximum = Math.max(1, ...data.timeline.map((item) => item.count));
  return (
    <section className="analytics-panel" aria-labelledby="analytics-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow dark">قراءة كمية للنتائج</span>
          <h2 id="analytics-title">لوحة التحليل</h2>
        </div>
      </div>
      <div className="analytics-metrics">
        <div>
          <strong>{data.totalResults}</strong>
          <span>نتيجة</span>
        </div>
        <div>
          <strong>{data.uniqueLegislations}</strong>
          <span>تشريعات</span>
        </div>
        <div>
          <strong>{data.references}</strong>
          <span>إحالات مرتبطة</span>
        </div>
      </div>
      <div className="analytics-grid">
        <article className="card">
          <h3>التوزيع الزمني</h3>
          <div className="bar-chart">
            {data.timeline.map((item) => (
              <div key={item.year}>
                <span>{item.year}</span>
                <i style={{ width: `${(item.count / maximum) * 100}%` }} />
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="card">
          <h3>العبارات المصاحبة</h3>
          <div className="term-cloud">
            {data.cooccurring.map((item) => (
              <span key={item.term}>
                {item.term} <small>{item.count}</small>
              </span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
