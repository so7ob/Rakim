import { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { LegislationCard } from "../components/LegislationCard";
import { EmptyPanel, ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
import type { ListResponse } from "../types";
import { LegislationAutocomplete } from "../components/LegislationAutocomplete";

export function LegislationsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error, loading, retry } = useApi<ListResponse>(
    `/legislations?${query}`,
  );
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    update("q", String(form.get("q") ?? ""));
  };
  const page = Number(params.get("page") ?? 1);
  return (
    <div className="container page-shell">
      <header className="page-title">
        <span className="eyebrow dark">قاعدة موحدة</span>
        <h1>التشريعات</h1>
        <p>فلترة واستعراض القوانين والقرارات واللوائح والاتفاقيات المنشورة.</p>
      </header>
      <form
        className="filter-panel"
        onSubmit={submit}
        aria-label="بحث ومرشحات التشريعات"
      >
        <div className="filter-search">
          <label htmlFor="list-q">عبارة البحث</label>
          <div>
            <LegislationAutocomplete
              initialValue={params.get("q") ?? ""}
              placeholder="مثال: المال العام"
            />
            <button>تطبيق</button>
          </div>
        </div>
        <label>
          النوع
          <select
            value={params.get("type") ?? ""}
            onChange={(e) => update("type", e.target.value)}
          >
            <option value="">كل الأنواع</option>
            {data?.filters.types.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الجهة
          <select
            value={params.get("authority") ?? ""}
            onChange={(e) => update("authority", e.target.value)}
          >
            <option value="">كل الجهات</option>
            {data?.filters.authorities.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الحالة
          <select
            value={params.get("status") ?? ""}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="IN_FORCE">نافذ</option>
            <option value="AMENDED">معدل</option>
            <option value="REPEALED">ملغى</option>
          </select>
        </label>
        <label>
          الموضوع
          <select
            value={params.get("subject") ?? ""}
            onChange={(e) => update("subject", e.target.value)}
          >
            <option value="">كل الموضوعات</option>
            {data?.filters.subjects.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          النفاذ
          <select
            value={params.get("effect") ?? ""}
            onChange={(e) => update("effect", e.target.value)}
          >
            <option value="">كل الفترات</option>
            <option value="current">نافذ الآن</option>
            <option value="future">مستقبلي</option>
            <option value="ended">منتهي النفاذ</option>
          </select>
        </label>
        <label>
          التعديلات
          <select
            value={params.get("hasAmendments") ?? ""}
            onChange={(e) => update("hasAmendments", e.target.value)}
          >
            <option value="">الكل</option>
            <option value="true">له تعديلات</option>
            <option value="false">بلا تعديلات</option>
          </select>
        </label>
        <label>
          درجة التحقق
          <select
            value={params.get("verification") ?? ""}
            onChange={(e) => update("verification", e.target.value)}
          >
            <option value="">كل الدرجات</option>
            {["A", "B", "C", "D"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          الفرز
          <select
            value={params.get("sort") ?? "newest"}
            onChange={(e) => update("sort", e.target.value)}
          >
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="number">الرقم</option>
            <option value="title">العنوان</option>
            <option value="reviewed">آخر مراجعة</option>
          </select>
        </label>
      </form>
      <div className="results-heading" aria-live="polite">
        <strong>
          {loading ? "جار العد…" : `${data?.meta.total ?? 0} نتيجة`}
        </strong>
        {params.toString() && (
          <button className="link-button" onClick={() => setParams({})}>
            مسح المرشحات
          </button>
        )}
      </div>
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : !data?.items.length ? (
        <EmptyPanel />
      ) : (
        <>
          <div className="cards list-cards">
            {data.items.map((item) => (
              <LegislationCard key={item.id} item={item} />
            ))}
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
    </div>
  );
}
