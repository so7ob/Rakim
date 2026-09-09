import { useState } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
interface Issue {
  id?: string;
  issue_code?: string;
  issueCode?: string;
  severity: string;
  message_ar?: string;
  messageAr?: string;
  legislationTitle?: string;
  sourceName?: string;
}
export function AdminQualityPage() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("quality.resolve");
  const { data, error, loading, retry } = useApi<{
    stored: Issue[];
    live: Issue[];
  }>("/admin/quality");
  const [msg, setMsg] = useState("");
  const issues = [...(data?.stored ?? []), ...(data?.live ?? [])];
  const resolve = async (issue: Issue, status: "RESOLVED" | "IGNORED") => {
    if (!issue.id) return;
    try {
      await apiRequest(`/admin/quality/${issue.id}`, {
        method: "PATCH",
        body: {
          status,
          note:
            status === "RESOLVED"
              ? "تمت معالجة المشكلة والتحقق منها"
              : "تم تجاهل التنبيه مع مراجعة بشرية",
        },
      });
      setMsg("حُدثت مشكلة الجودة وسُجل القرار.");
      retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر تحديث المشكلة.");
    }
  };
  return (
    <section>
      <AdminPageHeader
        title="جودة البيانات"
        eyebrow="بوابة ما قبل النشر"
        description="مراجعة مشكلات الاكتمال والاتساق قبل النشر."
        breadcrumbs={[
          { label: "لوحة التحكم", to: "/ar/admin" },
          { label: "الحوكمة" },
          { label: "جودة البيانات" },
        ]}
        actions={
          <button className="button secondary" onClick={retry}>
            إعادة الفحص
          </button>
        }
      />
      {msg && (
        <p role="status" className="form-message">
          {msg}
        </p>
      )}
      {loading ? (
        <LoadingCards />
      ) : error ? (
        <ErrorPanel message={error.message} retry={retry} />
      ) : !issues.length ? (
        <div className="state-panel">
          <h2>لا توجد مشكلات مفتوحة</h2>
          <p>اجتازت السجلات فحوص الاكتمال الحالية.</p>
        </div>
      ) : (
        <div className="admin-list">
          {issues.map((issue, index) => (
            <article className="admin-card quality-row" key={issue.id ?? index}>
              <StatusBadge status={issue.severity} />
              <div>
                <h2>{issue.message_ar ?? issue.messageAr}</h2>
                <p>{issue.legislationTitle ?? issue.sourceName ?? "فحص عام"}</p>
                <code>{issue.issue_code ?? issue.issueCode}</code>
                {canManage && issue.id && (
                  <div className="row-actions">
                    <button
                      className="button secondary"
                      onClick={() => resolve(issue, "RESOLVED")}
                    >
                      تم الحل
                    </button>
                    <button
                      className="link-button"
                      onClick={() => resolve(issue, "IGNORED")}
                    >
                      تجاهل بمبرر
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
