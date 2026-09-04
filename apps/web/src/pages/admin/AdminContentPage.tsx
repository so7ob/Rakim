import { Link, useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
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
  const { data, error, loading, retry } = useApi<{
    items: ContentItem[];
    meta: { total: number };
  }>(`/admin/legislations${status ? `?status=${status}` : ""}`);
  return (
    <section>
      <header className="admin-title">
        <div>
          <span className="eyebrow dark">INBOX ←→ PUBLISHED</span>
          <h1>المحتوى ودورة العمل</h1>
        </div>
      </header>
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
            onClick={() => setParams(value ? { status: value } : {})}
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
    </section>
  );
}
