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
  const { data, error, loading, retry } = useApi<{
    items: Audit[];
    meta: { total: number };
  }>("/admin/audit");
  return (
    <section>
      <header className="admin-title">
        <div>
          <span className="eyebrow dark">غير قابل للتحرير</span>
          <h1>سجل التدقيق</h1>
        </div>
        <button className="button secondary" onClick={retry}>
          تحديث
        </button>
      </header>
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : (
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
                <time>{new Date(item.occurredAt).toLocaleString("ar-YE")}</time>
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
                    <pre>{JSON.stringify(item.afterValue, null, 2) ?? "—"}</pre>
                  </dd>
                </div>
              </dl>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
