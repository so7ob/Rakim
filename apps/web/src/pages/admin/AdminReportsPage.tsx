import { useState } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
interface Report {
  id: string;
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
  const update = async (item: Report, status: string) => {
    try {
      await apiRequest(`/admin/reports/${item.id}`, {
        method: "PATCH",
        body: {
          status,
          reason: `تحديث البلاغ إلى ${status} بعد فحص مدير المحتوى`,
        },
      });
      setMsg("حُدث البلاغ وسُجل الإجراء.");
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر تحديث البلاغ.");
    }
  };
  return (
    <section>
      <AdminPageHeader
        title="البلاغات"
        eyebrow="ملاحظات الجمهور والباحثين"
        description="فرز البلاغات المرتبطة بالمحتوى ومتابعة معالجتها."
        breadcrumbs={[
          { label: "لوحة التحكم", to: "/admin" },
          { label: "الحوكمة" },
          { label: "البلاغات" },
        ]}
      />
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
