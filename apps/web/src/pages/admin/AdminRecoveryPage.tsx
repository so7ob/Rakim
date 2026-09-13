import { useState } from "react";
import { apiRequest } from "../../api";
import { useApi } from "../../hooks/use-api";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { UserManagementTabs } from "../../components/admin/UserManagementTabs";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
interface Recovery {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  status: string;
  createdAt: string;
  reason: string | null;
  handledBy: string | null;
}
const labels: Record<string, string> = {
  PENDING: "بانتظار التحقق",
  ISSUED: "صدر رابط الاستعادة",
  COMPLETED: "اكتملت الاستعادة",
  REJECTED: "مرفوض",
  EXPIRED: "انتهت صلاحية الرابط",
};
export function AdminRecoveryPage() {
  const state = useApi<Recovery[]>("/admin/recovery-requests");
  const [target, setTarget] = useState<Recovery | null>(null),
    [action, setAction] = useState<"issue" | "reject">("issue");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [link, setLink] = useState("");
  return (
    <section>
      <AdminPageHeader
        title="طلبات استعادة الوصول"
        description="تحقق من هوية صاحب الحساب عبر قناة موثوقة قبل إصدار رابط الاستعادة. تظهر الطلبات ضمن نطاق سلطتك على المستخدمين."
        actions={
          <button className="button secondary" onClick={state.retry}>
            تحديث
          </button>
        }
      />
      <UserManagementTabs />
      {state.loading ? (
        <LoadingCards />
      ) : state.error ? (
        <ErrorPanel message={state.error.message} retry={state.retry} />
      ) : (
        <section className="admin-card">
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>الحالة</th>
                  <th>تاريخ الطلب</th>
                  <th>المعالجة</th>
                </tr>
              </thead>
              <tbody>
                {state.data?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.displayName}</strong>
                      <small>{r.username}</small>
                    </td>
                    <td>{labels[r.status]}</td>
                    <td>{new Date(r.createdAt).toLocaleString("ar-YE")}</td>
                    <td>
                      {r.status === "PENDING" ? (
                        <>
                          {(["issue", "reject"] as const).map((a) => (
                            <button
                              key={a}
                              className="button secondary"
                              onClick={() => {
                                setTarget(r);
                                setAction(a);
                                setError("");
                              }}
                            >
                              {a === "issue" ? "إصدار رابط" : "رفض الطلب"}
                            </button>
                          ))}
                        </>
                      ) : (
                        <>
                          {r.handledBy}
                          <small>{r.reason}</small>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!state.data?.length && <p>لا توجد طلبات متاحة ضمن صلاحياتك.</p>}
        </section>
      )}
      {target && (
        <AdminDialog
          title={`${action === "issue" ? "إصدار رابط" : "رفض الطلب"}: ${target.username}`}
          onClose={() => {
            if (!saving) setTarget(null);
          }}
        >
          <form
            className="edit-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              const f = new FormData(e.currentTarget);
              setSaving(true);
              setError("");
              try {
                const result = await apiRequest<{ token?: string }>(
                  `/admin/recovery-requests/${target.id}`,
                  {
                    body: {
                      action,
                      reason: f.get("reason"),
                      identityVerified: f.has("verified"),
                    },
                  },
                );
                if (result.token)
                  setLink(
                    `${window.location.origin}/ar/reset-password#${result.token}`,
                  );
                setTarget(null);
                state.retry();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "تعذرت معالجة الطلب.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {action === "issue" && (
              <label className="setting-toggle">
                <input
                  type="checkbox"
                  name="verified"
                  required
                  disabled={saving}
                />{" "}
                تحققت من هوية صاحب الحساب عبر قناة موثوقة
              </label>
            )}
            <label>
              سبب المعالجة
              <textarea
                name="reason"
                minLength={3}
                maxLength={1000}
                required
                disabled={saving}
              />
            </label>
            <button className="button" disabled={saving}>
              {saving ? "جار الحفظ…" : "تأكيد المعالجة"}
            </button>
          </form>
        </AdminDialog>
      )}
      {link && (
        <AdminDialog title="رابط الاستعادة المؤقت" onClose={() => setLink("")}>
          <p>
            سلّم الرابط لصاحب الحساب بعد التحقق من هويته. يظهر مرة واحدة فقط،
            وينتهي خلال 15 دقيقة. لا يُرسل تلقائياً.
          </p>
          <label>
            رابط الاستعادة
            <input
              dir="ltr"
              value={link}
              readOnly
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button className="button" onClick={() => setLink("")}>
            تم تسليم الرابط
          </button>
        </AdminDialog>
      )}
    </section>
  );
}
