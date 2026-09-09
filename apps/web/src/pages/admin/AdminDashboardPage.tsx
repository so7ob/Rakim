import { useState } from "react";
import { useApi } from "../../hooks/use-api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { SearchReindexAction } from "../../components/admin/SearchReindexAction";
interface Dashboard {
  workflow: Array<{ status: string; count: number }>;
  imports: Array<{ status: string; count: number }>;
  quality: Array<{ severity: string; count: number }>;
  jobs: Array<{ status: string; count: number }>;
}
export function AdminDashboardPage() {
  const { data, error, loading, retry } = useApi<Dashboard>("/admin/dashboard");
  const [message, setMessage] = useState("");
  return (
    <section>
      <AdminPageHeader
        title="لوحة الإدارة"
        eyebrow="نظرة تشغيلية"
        description="ملخص دورة المحتوى والاستيراد والمهام الخلفية."
        breadcrumbs={[{ label: "لوحة الإدارة" }]}
        actions={
          <>
            <button className="button secondary" onClick={retry}>
              تحديث
            </button>
            <SearchReindexAction
              onSuccess={(count) =>
                setMessage(`اكتملت إعادة بناء الفهرس لعدد ${count} سجل.`)
              }
            />
          </>
        }
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : (
        <>
          <div className="metric-grid">
            {data?.workflow.map((item) => (
              <article className="metric-card" key={item.status}>
                <StatusBadge status={item.status} />
                <strong>{item.count}</strong>
                <span>عنصر محتوى</span>
              </article>
            ))}
          </div>
          <div className="admin-grid">
            <section className="admin-card">
              <h2>الاستيراد</h2>
              {data?.imports.length ? (
                data.imports.map((item) => (
                  <div className="summary-row" key={item.status}>
                    <StatusBadge status={item.status} />
                    <strong>{item.count}</strong>
                  </div>
                ))
              ) : (
                <p>لا توجد عمليات استيراد.</p>
              )}
            </section>
            <section className="admin-card">
              <h2>المهام الخلفية</h2>
              {data?.jobs.length ? (
                data.jobs.map((item) => (
                  <div className="summary-row" key={item.status}>
                    <StatusBadge status={item.status} />
                    <strong>{item.count}</strong>
                  </div>
                ))
              ) : (
                <p>الطابور فارغ.</p>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
