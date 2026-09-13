import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { DecisionHistory } from "../../components/admin/DecisionHistory";
import { useState } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
interface Report {
  id: string;
  legislationId?: string;
  entityType: string;
  entityId: string;
  category: string;
  details: string;
  status: string;
  createdAt: string;
  reporterName: string | null;
}
export function AdminReportsPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("report.update");
  const data = useApi<Report[]>("/admin/reports");
  const [msg, setMsg] = useState("");
  const [decision, setDecision] = useState<{
      item: Report;
      status: string;
    } | null>(null),
    [reason, setReason] = useState("");
  const update = (item: Report, status: string) => {
    setReason("");
    setDecision({ item, status });
  };
  return (
    <section>
      <AdminPageHeader
        title="البلاغات"
        eyebrow="ملاحظات الجمهور والباحثين"
        description="فرز البلاغات المرتبطة بالمحتوى ومتابعة معالجتها."
        breadcrumbs={[
          { label: "لوحة التحكم", to: "/ar/admin" },
          { label: "الحوكمة" },
          { label: "البلاغات" },
        ]}
      />
      {decision && (
        <ConfirmDialog
          title="معالجة البلاغ"
          description={decision.item.details}
          confirmLabel="حفظ القرار"
          destructive={decision.status === "REJECTED"}
          onClose={() => setDecision(null)}
          onConfirm={async () => {
            if (reason.trim().length < 3)
              throw new Error("اكتب سبباً واضحاً من ثلاثة أحرف على الأقل.");
            await apiRequest(`/admin/reports/${decision.item.id}`, {
              method: "PATCH",
              body: {
                status: decision.status,
                expectedStatus: decision.item.status,
                reason,
              },
            });
            setDecision(null);
            setMsg("حُفظت المعالجة وسببها.");
            data.retry();
          }}
        >
          <p>
            القرار:{" "}
            {
              {
                TRIAGED: "بدء المعالجة",
                RESOLVED: "حل البلاغ",
                REJECTED: "رفض البلاغ",
              }[decision.status]
            }
          </p>
          <label>
            سبب القرار
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              required
            />
          </label>
        </ConfirmDialog>
      )}
      {msg && (
        <p className="form-message" role="status">
          {msg}
        </p>
      )}
      {data.loading ? (
        <LoadingCards />
      ) : data.error ? (
        <ErrorPanel message={data.error.message} retry={data.retry} />
      ) : !data.data?.length ? (
        <div className="state-panel">
          <h2>لا توجد بلاغات</h2>
        </div>
      ) : (
        <div className="admin-list">
          {data.data.map((item) => (
            <article className="admin-card report-row" key={item.id}>
              <div>
                <StatusBadge status={item.status} />
                <h2>{item.category}</h2>
                <p>{item.details}</p>
                <small>
                  {item.reporterName ?? "مستخدم غير مسجل"} —{" "}
                  {new Date(item.createdAt).toLocaleString("ar-YE")}
                </small>
              </div>
              {item.legislationId && hasPermission("legislation.view") && (
                <Link to={`/ar/admin/content/${item.legislationId}`}>
                  فتح التشريع المعني
                </Link>
              )}
              <DecisionHistory path={`/admin/reports/${item.id}/history`} />
              {canManage && (
                <div className="row-actions">
                  {item.status === "OPEN" && (
                    <button
                      className="button secondary"
                      onClick={() => update(item, "TRIAGED")}
                    >
                      بدء المعالجة
                    </button>
                  )}{" "}
                  {!["RESOLVED", "REJECTED"].includes(item.status) && (
                    <>
                      <button
                        className="button"
                        onClick={() => update(item, "RESOLVED")}
                      >
                        حل البلاغ
                      </button>
                      <button
                        className="link-button danger"
                        onClick={() => update(item, "REJECTED")}
                      >
                        رفض
                      </button>
                    </>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
