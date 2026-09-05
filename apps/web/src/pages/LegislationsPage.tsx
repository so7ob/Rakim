import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LegislationAutocomplete } from "../components/LegislationAutocomplete";
import { EmptyPanel, ErrorPanel, LoadingCards } from "../components/StatePanel";
import { UiIcon } from "../components/UiIcon";
import { useApi } from "../hooks/use-api";
import { legalStatusLabels } from "../legal-format";
import type { FilterOption, LegislationSummary, ListResponse } from "../types";

export function LegislationsPage({ archived = false }: { archived?: boolean }) {
  const [params, setParams] = useSearchParams();
  const queryParams = new URLSearchParams(params);
  if (archived) queryParams.set("archived", "1");
  const { data, error, loading, retry } = useApi<ListResponse>(
    `/legislations?${queryParams.toString()}`,
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const updateYear = (year: string) => {
    const next = new URLSearchParams(params);
    if (next.get("yearFrom") === year && next.get("yearTo") === year) {
      next.delete("yearFrom");
      next.delete("yearTo");
    } else {
      next.set("yearFrom", year);
      next.set("yearTo", year);
    }
    next.delete("page");
    setParams(next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update("q", String(form.get("q") ?? ""));
  };
  const clear = () => setParams({});
  const page = Number(params.get("page") ?? 1);

  return (
    <>
      <section className="public-page-hero legislations-index-hero">
        <div className="container">
          <nav className="detail-breadcrumb" aria-label="مسار التنقل">
            <Link to="/ar">الصفحة الرئيسية</Link>
            <span aria-hidden="true">/</span>
            <span>{archived ? "أرشيف التشريعات" : "التشريعات"}</span>
          </nav>
          <h1>{archived ? "أرشيف التشريعات" : "التشريعات"}</h1>
          <p>
            {archived
              ? "استعرض النصوص التشريعية الملغاة والمؤرشفة والرجوع إلى سجلها التاريخي."
              : "تصفح التشريعات اليمنية وابحث فيها بحسب النوع والسنة والجهة والحالة."}
          </p>
        </div>
      </section>

      <div className="container legislation-catalog-overlap">
        <div className="legislation-catalog">
          <aside className="catalog-filters" aria-label="تصفية التشريعات">
            <form className="catalog-search" onSubmit={submit}>
              <LegislationAutocomplete
                initialValue={params.get("q") ?? ""}
                placeholder="بحث في التشريعات"
              />
              <button type="submit" aria-label="بحث">
                <UiIcon name="search" />
              </button>
            </form>
            <div className="catalog-filter-heading">
              <h2>تصنيف بواسطة</h2>
              <button type="button" onClick={clear} aria-label="مسح التصنيفات">
                مسح الكل
              </button>
            </div>
            <ChoiceFilter
              title="نوع التشريع"
              name="type"
              value={params.get("type") ?? ""}
              options={data?.filters.types ?? []}
              onChange={(value) => update("type", value)}
              initiallyOpen
            />
            <ChoiceFilter
              title="سنة الإصدار"
              name="year"
              value={
                params.get("yearFrom") === params.get("yearTo")
                  ? (params.get("yearFrom") ?? "")
                  : ""
              }
              options={(data?.filters.years ?? []).map((item) => ({
                code: String(item.year),
                name: String(item.year),
                count: item.count,
              }))}
              onChange={updateYear}
              limited
            />
            <ChoiceFilter
              title="الجهة المصدرة"
              name="authority"
              value={params.get("authority") ?? ""}
              options={data?.filters.authorities ?? []}
              onChange={(value) => update("authority", value)}
            />
            <ChoiceFilter
              title="حالة التشريع"
              name="status"
              value={params.get("status") ?? ""}
              options={[
                { code: "IN_FORCE", name: "ساري" },
                { code: "AMENDED", name: "معدّل" },
                { code: "REPEALED", name: "ملغى" },
              ]}
              onChange={(value) => update("status", value)}
            />
          </aside>

          <section className="catalog-results" aria-labelledby="catalog-title">
            <header className="catalog-results-top">
              <div>
                <h2 id="catalog-title">
                  {archived ? "التشريعات المؤرشفة" : "قائمة التشريعات"}
                </h2>
                <span className="results-heading" aria-live="polite">
                  <strong>
                    {loading ? "جار العد…" : `${data?.meta.total ?? 0} نتيجة`}
                  </strong>
                </span>
              </div>
              <label className="catalog-sort">
                <span>ترتيب حسب</span>
                <select
                  value={params.get("sort") ?? "newest"}
                  onChange={(event) => update("sort", event.target.value)}
                >
                  <option value="newest">الأحدث</option>
                  <option value="oldest">الأقدم</option>
                  <option value="number">الرقم</option>
                  <option value="title">العنوان</option>
                  <option value="reviewed">آخر مراجعة</option>
                </select>
              </label>
            </header>

            {loading ? (
              <LoadingCards />
            ) : error ? (
              <ErrorPanel message={error.message} retry={retry} />
            ) : !data?.items.length ? (
              <EmptyPanel />
            ) : (
              <>
                <div className="laws-table" role="table" aria-label="التشريعات">
                  <div className="laws-table-head" role="row">
                    <span role="columnheader">اسم التشريع</span>
                    <span role="columnheader">رقم التشريع</span>
                    <span role="columnheader">سنة الإصدار</span>
                    <span role="columnheader" className="sr-only">
                      الإجراءات
                    </span>
                  </div>
                  <div className="laws-table-body" role="rowgroup">
                    {data.items.map((item) => (
                      <LegislationRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
                <nav className="pagination" aria-label="صفحات النتائج">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => update("page", String(page - 1))}
                  >
                    السابق
                  </button>
                  <span>
                    صفحة {page} من {data.meta.pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={page >= data.meta.pageCount}
                    onClick={() => update("page", String(page + 1))}
                  >
                    التالي
                  </button>
                </nav>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function ChoiceFilter({
  title,
  name,
  value,
  options,
  onChange,
  limited = false,
  initiallyOpen = false,
}: {
  title: string;
  name: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  limited?: boolean;
  initiallyOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = limited && !expanded ? options.slice(0, 6) : options;
  return (
    <details className="catalog-filter-group" open={initiallyOpen}>
      <summary>{title}</summary>
      <div>
        {visible.map((option) => (
          <label key={option.code}>
            <input
              type="checkbox"
              name={name}
              value={option.code}
              checked={value === option.code}
              onChange={() =>
                onChange(value === option.code ? "" : option.code)
              }
            />
            <span>{option.name}</span>
            {option.count !== undefined && <small>{option.count}</small>}
          </label>
        ))}
        {limited && options.length > 6 && (
          <button
            className="catalog-show-more"
            type="button"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "عرض أقل" : "عرض المزيد"}
          </button>
        )}
      </div>
    </details>
  );
}

function LegislationRow({ item }: { item: LegislationSummary }) {
  const [message, setMessage] = useState("");
  return (
    <article className="legislation-card law-list-row" role="row">
      <div className="law-row-title" role="cell">
        <span>{item.typeName}</span>
        <h2>
          <Link to={`/ar/legislations/${item.id}`}>{item.titleAr}</Link>
        </h2>
        <small>{legalStatusLabels[item.legalStatus] ?? item.legalStatus}</small>
      </div>
      <span className="law-row-number" role="cell">
        {item.officialNumber}
      </span>
      <span className="law-row-year" role="cell">
        {item.year}
      </span>
      <div className="law-row-actions" role="cell" aria-label="إجراءات التشريع">
        <Link
          to={`/ar/legislations/${item.id}/download`}
          aria-label={`تنزيل ${item.titleAr}`}
        >
          <UiIcon name="download" />
        </Link>
        <button
          type="button"
          aria-label={`مشاركة ${item.titleAr}`}
          onClick={async () => {
            const url = `${location.origin}/ar/legislations/${item.id}`;
            if (navigator.share)
              await navigator.share({ title: item.titleAr, url });
            else await navigator.clipboard?.writeText(url);
            setMessage("نُسخ رابط التشريع.");
          }}
        >
          <UiIcon name="share" />
        </button>
        <Link to="/ar/login" aria-label={`إضافة ${item.titleAr} إلى المفضلة`}>
          <UiIcon name="heart" />
        </Link>
      </div>
      {message && (
        <span className="sr-only" role="status">
          {message}
        </span>
      )}
    </article>
  );
}
