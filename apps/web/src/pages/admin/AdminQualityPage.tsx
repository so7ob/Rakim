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
interface Issue {
  id?: string;
  legislationId?: string;
  status?: string;
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
  const [status, setStatus] = useState("OPEN");
  const [decision, setDecision] = useState<{
    issue: Issue;
    status: "RESOLVED" | "IGNORED";
  } | null>(null);
  const [reason, setReason] = useState("");
  const { data, error, loading, retry } = useApi<{
    stored: Issue[];
    live: Issue[];
  }>(`/admin/quality?status=${status}`);
  const [msg, setMsg] = useState("");
  const issues = [...(data?.stored ?? []), ...(data?.live ?? [])];
  const resolve = (issue: Issue, status: "RESOLVED" | "IGNORED") => {
    setReason("");
    setDecision({ issue, status });
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
      <label>
        حالة المشكلة{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">مفتوحة</option>
          <option value="RESOLVED">تم حلها</option>
          <option value="IGNORED">متجاهلة</option>
        </select>
      </label>
      {decision && (
        <ConfirmDialog
          title={
            decision.status === "IGNORED"
              ? "تجاهل المشكلة بمبرر"
              : "تأكيد حل المشكلة"
          }
          description={
            decision.issue.message_ar ??
            decision.issue.messageAr ??
            "مشكلة جودة"
          }
          confirmLabel="حفظ القرار"
          destructive={decision.status === "IGNORED"}
          onClose={() => setDecision(null)}
          onConfirm={async () => {
            if (reason.trim().length < 3)
              throw new Error("اكتب سبباً واضحاً من ثلاثة أحرف على الأقل.");
            await apiRequest(`/admin/quality/${decision.issue.id}`, {
              method: "PATCH",
              body: { status: decision.status, note: reason },
            });
            setDecision(null);
            setMsg("حُفظ القرار وسببه في سجل المعالجة.");
            retry();
          }}
        >
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
          <h2>لا توجد مشكلات بهذه الحالة</h2>
          <p>يمكنك تغيير الفلتر لعرض حالات المعالجة الأخرى.</p>
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
                {issue.legislationId && hasPermission("legislation.view") && (
                  <Link to={`/ar/admin/content/${issue.legislationId}`}>
                    فتح التشريع المعني
                  </Link>
                )}
                {issue.id && (
                  <DecisionHistory
                    path={`/admin/quality/${issue.id}/history`}
                  />
                )}
                {canManage && issue.id && status === "OPEN" && (
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
