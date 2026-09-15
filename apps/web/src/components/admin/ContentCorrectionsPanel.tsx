import { useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../api";
import { useApi } from "../../hooks/use-api";
import { AdminDialog } from "./AdminDialog";
import { ErrorPanel } from "../StatePanel";
import { PolicyChecks, type PolicyCheck } from "./PolicyChecks";
interface Draft {
  id: string;
  target_kind: string;
  target_id: string;
  status: string;
  effective_from: string;
  reason: string;
  before: Record<string, unknown>;
  payload: Record<string, unknown>;
  canApprove: boolean;
  canPublish: boolean;
  canCancel: boolean;
}
export function ContentCorrectionsPanel({
  lawId,
  articles,
  annexes,
  onChange,
}: {
  lawId: string;
  articles: Array<{ id: string; currentLabel: string }>;
  annexes: Array<{ id: string; titleAr: string }>;
  onChange: () => void;
}) {
  const drafts = useApi<Draft[]>(`/admin/corrections/legislations/${lawId}`);
  const capabilities = useApi<
    Array<{ kind: string; allowed: boolean; policyCheck: PolicyCheck }>
  >(`/admin/corrections/legislations/${lawId}/available`);
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("LEGISLATION"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [policyErrors, setPolicyErrors] = useState<PolicyCheck[]>([]);
  const [action, setAction] = useState<{ id: string; action: string } | null>(
    null,
  );
  const allowed =
    capabilities.data?.find((item) => item.kind === kind)?.allowed ?? false;
  const refresh = () => {
    drafts.retry();
    onChange();
  };
  const failed = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "تعذر حفظ التصحيح.");
    setPolicyErrors(
      cause instanceof ApiError
        ? ((cause.details?.policyChecks as PolicyCheck[]) ?? [])
        : [],
    );
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setPolicyErrors([]);
    try {
      const payload =
        kind === "ARTICLE"
          ? { text: form.get("text") }
          : kind === "LEGISLATION"
            ? { preambleText: form.get("text") }
            : { titleAr: form.get("text") };
      await apiRequest(
        `/admin/corrections/${kind}/${kind === "LEGISLATION" ? lawId : form.get("targetId")}`,
        {
          body: {
            payload,
            effectiveFrom: form.get("date"),
            reason: form.get("reason"),
          },
        },
      );
      setOpen(false);
      refresh();
    } catch (cause) {
      failed(cause);
    } finally {
      setBusy(false);
    }
  };
  const transition = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setError("");
    setPolicyErrors([]);
    try {
      await apiRequest(`/admin/corrections/${action.id}`, {
        body: {
          action: action.action,
          reason: new FormData(event.currentTarget).get("reason"),
        },
      });
      setAction(null);
      refresh();
    } catch (cause) {
      failed(cause);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="admin-card">
      <h2>مسودات التصحيح</h2>
      <p>
        يبقى المحتوى المنشور ظاهرًا حتى اعتماد التصحيح ونشره. تُحفظ النسخة
        السابقة في السجل التاريخي.
      </p>
      {capabilities.data?.some((item) => item.allowed) && (
        <button
          className="button primary"
          onClick={() => {
            setError("");
            setPolicyErrors([]);
            setOpen(true);
          }}
        >
          إنشاء مسودة تصحيح
        </button>
      )}
      <PolicyChecks
        checks={
          capabilities.data
            ?.filter((item) => !item.allowed)
            .map((item) => item.policyCheck) ?? []
        }
      />
      {drafts.error && (
        <ErrorPanel message={drafts.error.message} retry={drafts.retry} />
      )}
      {drafts.loading && <p role="status">جار تحميل التصحيحات…</p>}
      {!drafts.loading && drafts.data?.length === 0 && (
        <p>لا توجد مسودات تصحيح.</p>
      )}
      {drafts.data?.map((draft) => (
        <details key={draft.id} className="admin-card">
          <summary>
            {
              (
                {
                  ARTICLE: "تصحيح مادة",
                  LEGISLATION: "تصحيح الديباجة",
                  ANNEX: "تصحيح ملحق",
                } as Record<string, string>
              )[draft.target_kind]
            }{" "}
            —{" "}
            {
              (
                {
                  DRAFT: "مسودة",
                  APPROVED: "معتمد",
                  PUBLISHED: "منشور",
                  CANCELLED: "ملغى",
                } as Record<string, string>
              )[draft.status]
            }
          </summary>
          <p>{draft.reason}</p>
          <p>تاريخ الأثر: {draft.effective_from.slice(0, 10)}</p>
          <h3>المحتوى السابق</h3>
          <div className="correction-text">
            {Object.values(draft.before)
              .filter((value) => typeof value === "string")
              .join("\n")}
          </div>
          <h3>التصحيح المقترح</h3>
          <div className="correction-text">
            {Object.values(draft.payload).join("\n")}
          </div>
          {[
            ["approve", "اعتماد التصحيح", draft.canApprove],
            ["publish", "نشر التصحيح", draft.canPublish],
            ["cancel", "إلغاء التصحيح", draft.canCancel],
          ].map(
            ([key, label, enabled]) =>
              enabled && (
                <button
                  key={String(key)}
                  className="button secondary"
                  onClick={() => {
                    setError("");
                    setPolicyErrors([]);
                    setAction({ id: draft.id, action: String(key) });
                  }}
                >
                  {label}
                </button>
              ),
          )}
        </details>
      ))}
      {open && (
        <AdminDialog
          title="إنشاء مسودة تصحيح"
          description="حدد المحتوى وتاريخ أثر التصحيح؛ لن يتغير المنشور عند حفظ المسودة."
          onClose={() => setOpen(false)}
          dirty
          size="large"
        >
          <form className="edit-form" onSubmit={create}>
            <label>
              نوع المحتوى
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="LEGISLATION">ديباجة التشريع</option>
                <option value="ARTICLE">نص مادة</option>
                <option value="ANNEX">عنوان ملحق</option>
              </select>
            </label>
            {kind !== "LEGISLATION" && (
              <label>
                السجل
                <select name="targetId" required>
                  {(kind === "ARTICLE"
                    ? articles.map((item) => ({
                        id: item.id,
                        label: `المادة ${item.currentLabel}`,
                      }))
                    : annexes.map((item) => ({
                        id: item.id,
                        label: item.titleAr,
                      }))
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              المحتوى المصحح
              <textarea name="text" required rows={8} />
            </label>
            <label>
              تاريخ أثر التصحيح
              <input
                name="date"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <p>يجب أن يلي تاريخ بداية النسخة السابقة وألا يتجاوز اليوم.</p>
            <label>
              سبب التصحيح
              <input name="reason" required minLength={3} maxLength={1000} />
            </label>
            <PolicyChecks
              checks={
                capabilities.data
                  ?.filter((item) => item.kind === kind)
                  .map((item) => item.policyCheck) ?? []
              }
            />
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <PolicyChecks checks={policyErrors} />
            <button className="button primary" disabled={busy || !allowed}>
              {busy ? "جار الحفظ…" : "حفظ مسودة التصحيح"}
            </button>
          </form>
        </AdminDialog>
      )}
      {action && (
        <AdminDialog
          title="تأكيد إجراء التصحيح"
          onClose={() => setAction(null)}
          dirty
        >
          <form className="edit-form" onSubmit={transition}>
            <label>
              سبب الإجراء
              <input name="reason" required minLength={3} maxLength={1000} />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <PolicyChecks checks={policyErrors} />
            <button className="button primary" disabled={busy}>
              {busy ? "جار الحفظ…" : "تأكيد الإجراء"}
            </button>
          </form>
        </AdminDialog>
      )}
    </section>
  );
}
