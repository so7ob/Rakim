import { Link, useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
interface ContentItem {
  id: string;
  titleAr: string;
  officialNumber: string;
  year: number;
  status: string;
  typeName: string;
  authorityName: string;
  verificationLevel: string;
  updatedAt: string;
}
export function AdminContentPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const { data, error, loading, retry } = useApi<{
    items: ContentItem[];
    meta: { total: number; page: number; pageSize: number };
  }>(
    `/admin/legislations?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(page) })}`,
  );
  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!("page" in updates)) next.delete("page");
    setParams(next);
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow="INBOX ←→ PUBLISHED"
        title="التشريعات ودورة العمل"
        description="صفّ المسودات والتشريعات وافتح صفحة التفاصيل المقسمة بحسب نوع البيانات."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إدارة المحتوى" },
          { label: "التشريعات" },
        ]}
      />
      <form
        className="admin-filterbar"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          updateParams({ q: String(form.get("q") ?? "") });
        }}
      >
        <label>
          <span className="sr-only">البحث في التشريعات</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="العنوان أو الرقم…"
          />
        </label>
        <button className="button secondary">بحث</button>
        {q && (
          <button
            type="button"
            className="link-button"
            onClick={() => updateParams({ q: "" })}
          >
            مسح
          </button>
        )}
      </form>
      <div
        className="workflow-filters"
        role="group"
        aria-label="تصفية حالة العمل"
      >
        {[
          "",
          "DRAFT",
          "IN_REVIEW",
          "APPROVED_FOR_PUBLISHING",
          "PUBLISHED",
          "ARCHIVED",
        ].map((value) => (
          <button
            key={value}
            className={status === value ? "active" : ""}
            onClick={() => updateParams({ status: value })}
          >
            {value ? <StatusBadge status={value} /> : <span>الكل</span>}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>التشريع</th>
                <th>النوع/الجهة</th>
                <th>الحالة</th>
                <th>التحقق</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.titleAr}</strong>
                    <small>
                      رقم {item.officialNumber || "—"} لسنة {item.year}
                    </small>
                  </td>
                  <td>
                    {item.typeName}
                    <small>{item.authorityName}</small>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.verificationLevel}</td>
                  <td>
                    <Link
                      className="button secondary"
                      to={`/ar/admin/content/${item.id}`}
                    >
                      فتح
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{data?.meta.total ?? 0} عنصر</p>
        </div>
      )}
      {data && data.meta.total > data.meta.pageSize && (
        <nav className="admin-pagination" aria-label="صفحات التشريعات">
          <button
            disabled={page === 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            السابق
          </button>
          <span>
            صفحة {page} من {Math.ceil(data.meta.total / data.meta.pageSize)}
          </span>
          <button
            disabled={page >= Math.ceil(data.meta.total / data.meta.pageSize)}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            التالي
          </button>
        </nav>
      )}
    </section>
  );
}
