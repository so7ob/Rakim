import { type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
interface Audit {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string | null;
  username: string | null;
  reason: string;
  occurredAt: string;
  beforeValue: unknown;
  afterValue: unknown;
}
export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const action = params.get("action") ?? "";
  const { data, error, loading, retry } = useApi<{
    items: Audit[];
    meta: { page: number; pageSize: number; total: number };
  }>(
    `/admin/audit?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ""}`,
  );
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(
      new FormData(event.currentTarget).get("action") ?? "",
    ).trim();
    setParams(value ? { action: value, page: "1" } : {});
  };
  return (
    <section>
      <AdminPageHeader
        title="سجل التدقيق"
        eyebrow="غير قابل للتحرير"
        description="سجل زمني للعمليات الحساسة وقيمها السابقة واللاحقة دون تضمين الأسرار."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "النظام والحوكمة" },
          { label: "سجل التدقيق" },
        ]}
        actions={
          <button className="button secondary" onClick={retry}>
            تحديث
          </button>
        }
      />
      <form className="admin-filterbar" onSubmit={filter}>
        <label>
          <span className="sr-only">تصفية بنوع العملية</span>
          <input
            name="action"
            defaultValue={action}
            placeholder="رمز العملية، مثل UPDATE_ROLE"
            dir="ltr"
          />
        </label>
        <button className="button secondary">تطبيق الفلتر</button>
        {action && (
          <button
            type="button"
            className="link-button"
            onClick={() => setParams({})}
          >
            مسح
          </button>
        )}
        <span>{data?.meta.total ?? 0} عملية</span>
      </form>
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : !data?.items.length ? (
        <div className="admin-card empty-state">
          <h2>لا توجد نتائج</h2>
          <p>لم يعثر السجل على عمليات تطابق الفلتر الحالي.</p>
        </div>
      ) : (
        <>
          <div className="audit-list full">
            {data?.items.map((item) => (
              <details className="admin-card" key={item.id}>
                <summary>
                  <div>
                    <strong>{item.action}</strong>
                    <span>
                      {item.actorName ?? "النظام"} — {item.reason}
                    </span>
                  </div>
                  <time>
                    {new Date(item.occurredAt).toLocaleString("ar-YE")}
                  </time>
                </summary>
                <dl>
                  <div>
                    <dt>الكيان</dt>
                    <dd>
                      {item.entityType} / {item.entityId}
                    </dd>
                  </div>
                  <div>
                    <dt>قبل</dt>
                    <dd>
                      <pre>
                        {JSON.stringify(item.beforeValue, null, 2) ?? "—"}
                      </pre>
                    </dd>
                  </div>
                  <div>
                    <dt>بعد</dt>
                    <dd>
                      <pre>
                        {JSON.stringify(item.afterValue, null, 2) ?? "—"}
                      </pre>
                    </dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
          <nav className="admin-pagination" aria-label="صفحات سجل التدقيق">
            <button
              disabled={page <= 1}
              onClick={() =>
                setParams(
                  action
                    ? { action, page: String(page - 1) }
                    : { page: String(page - 1) },
                )
              }
            >
              السابق
            </button>
            <span>
              صفحة {page} من{" "}
              {Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize))}
            </span>
            <button
              disabled={page * data.meta.pageSize >= data.meta.total}
              onClick={() =>
                setParams(
                  action
                    ? { action, page: String(page + 1) }
                    : { page: String(page + 1) },
                )
              }
            >
              التالي
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
