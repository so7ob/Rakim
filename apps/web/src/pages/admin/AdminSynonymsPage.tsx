import { useMemo, useState, type FormEvent } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { SearchReindexAction } from "../../components/admin/SearchReindexAction";
interface Synonym {
  setId: string;
  versionNo: number;
  status: string;
  id: string | null;
  termAr: string | null;
  synonymAr: string | null;
  publishedAt: string | null;
}
export function AdminSynonymsPage() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("search.synonym.create");
  const canDelete = hasPermission("search.synonym.delete");
  const canActivate = hasPermission("search.synonym_set.activate");
  const data = useApi<Synonym[]>("/admin/synonyms");
  const [msg, setMsg] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Synonym | null>(null);
  const [activating, setActivating] = useState<Synonym | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sets = useMemo(
    () =>
      Array.from(
        new Map((data.data ?? []).map((item) => [item.setId, item])).values(),
      ),
    [data.data],
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const f = new FormData(formElement);
    setSubmitting(true);
    setSubmitError("");
    try {
      await apiRequest("/admin/synonyms", {
        body: { term: f.get("term"), synonym: f.get("synonym") },
      });
      setCreating(false);
      setMsg("أضيف المرادف إلى نسخة قاموس مسودة.");
      data.retry();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "تعذر الإضافة.");
    } finally {
      setSubmitting(false);
    }
  };
  const activate = async (id: string) => {
    try {
      await apiRequest(`/admin/synonym-sets/${id}/activate`, {
        body: { reason: "اعتماد ونشر قاموس المرادفات بعد المراجعة" },
      });
      setMsg("نُشرت نسخة القاموس وأصبحت متاحة للبحث مباشرة.");
      setActivating(null);
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر النشر.");
    }
  };
  const remove = async (id: string) => {
    try {
      await apiRequest(`/admin/synonyms/${id}`, { method: "DELETE" });
      setMsg("حُذف المرادف من المسودة.");
      setDeleting(null);
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر الحذف.");
    }
  };
  return (
    <section>
      <AdminPageHeader
        title="قاموس البحث القانوني"
        eyebrow="قابل للإصدار والمراجعة"
        description="إدارة نسخ المرادفات القانونية المستخدمة في توسيع نتائج البحث."
        breadcrumbs={[
          { label: "لوحة التحكم", to: "/ar/admin" },
          { label: "إدارة البحث" },
          { label: "قاموس المرادفات" },
        ]}
        actions={
          <>
            <SearchReindexAction
              onSuccess={(count) =>
                setMsg(`اكتملت إعادة بناء الفهرس لعدد ${count} سجل.`)
              }
            />
            {canCreate && (
              <button
                type="button"
                className="button"
                onClick={() => setCreating(true)}
              >
                + إضافة مرادف
              </button>
            )}
          </>
        }
      />
      {creating && canCreate && (
        <AdminDialog
          title="إضافة مرادف إلى المسودة"
          onClose={() => setCreating(false)}
        >
          <form className="edit-form" onSubmit={submit}>
            {submitError && (
              <p className="form-error" role="alert">
                {submitError}
              </p>
            )}
            <label>
              المصطلح
              <input name="term" required />
            </label>
            <label>
              المرادف
              <input name="synonym" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
                disabled={submitting}
              >
                إلغاء
              </button>
              <button className="button" disabled={submitting}>
                {submitting ? "جار الإضافة…" : "إضافة لمسودة"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
      {msg && (
        <p className="form-message" role="status">
          {msg}
        </p>
      )}
      <div className="dictionary-versions">
        {sets.map((set) => (
          <article className="admin-card" key={set.setId}>
            <h2>
              الإصدار {set.versionNo} <StatusBadge status={set.status} />
            </h2>
            {set.publishedAt && (
              <p>نشر في {new Date(set.publishedAt).toLocaleString("ar-YE")}</p>
            )}
            {canActivate && set.status === "DRAFT" && (
              <button className="button" onClick={() => setActivating(set)}>
                اعتماد هذا الإصدار ونشره
              </button>
            )}
          </article>
        ))}
      </div>
      {data.loading ? (
        <LoadingCards />
      ) : data.error ? (
        <ErrorPanel message={data.error.message} retry={data.retry} />
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>الإصدار</th>
                <th>الحالة</th>
                <th>المصطلح</th>
                <th>المرادف</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((item, index) => (
                <tr key={item.id ?? `${item.setId}-${index}`}>
                  <td>{item.versionNo}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.termAr ?? "—"}</td>
                  <td>{item.synonymAr ?? "—"}</td>
                  <td>
                    {canDelete && item.id && item.status === "DRAFT" && (
                      <button
                        className="link-button danger"
                        onClick={() => setDeleting(item)}
                      >
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deleting?.id && (
        <ConfirmDialog
          title={`حذف المرادف «${deleting.termAr}»؟`}
          description={`سيحذف الربط مع «${deleting.synonymAr}» من نسخة القاموس المسودة فقط.`}
          confirmLabel="حذف المرادف"
          onClose={() => setDeleting(null)}
          onConfirm={() => remove(deleting.id!)}
        />
      )}
      {activating && (
        <ConfirmDialog
          title={`نشر الإصدار ${activating.versionNo}؟`}
          description="ستصبح هذه النسخة هي القاموس المستخدم في توسيع البحث."
          confirmLabel="اعتماد ونشر"
          destructive={false}
          onClose={() => setActivating(null)}
          onConfirm={() => activate(activating.setId)}
        />
      )}
    </section>
  );
}
