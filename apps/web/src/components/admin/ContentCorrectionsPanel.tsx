import { useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "../../api";
import { useApi } from "../../hooks/use-api";
import { AdminDialog } from "./AdminDialog";
import { ErrorPanel, LoadingCards } from "../StatePanel";
import { PolicyChecks, type PolicyCheck } from "./PolicyChecks";
import { AnnexContentView, readStructuredTable } from "../AnnexContentView";
import {
  AnnexContentFields,
  type AnnexDetail,
  type AnnexOptions,
} from "./AnnexContentFields";
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
  annexOptions,
  sources,
  onChange,
}: {
  lawId: string;
  articles: Array<{ id: string; currentLabel: string }>;
  annexes: Array<{ id: string; titleAr: string; status: string }>;
  annexOptions?: AnnexOptions | null;
  sources: Array<{ id: string; originalName: string; mediaType: string }>;
  onChange: () => void;
}) {
  const drafts = useApi<Draft[]>(`/admin/corrections/legislations/${lawId}`);
  const capabilities = useApi<
    Array<{ kind: string; allowed: boolean; policyCheck: PolicyCheck }>
  >(`/admin/corrections/legislations/${lawId}/available`);
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("LEGISLATION"),
    [annexId, setAnnexId] = useState(
      annexes.find((annex) => annex.status === "PUBLISHED")?.id ??
        annexes[0]?.id ??
        "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [policyErrors, setPolicyErrors] = useState<PolicyCheck[]>([]);
  const [action, setAction] = useState<{ id: string; action: string } | null>(
    null,
  );
  const allowed =
    capabilities.data?.find((item) => item.kind === kind)?.allowed ?? false;
  const annexDetail = useApi<AnnexDetail>(
    open && kind === "ANNEX" && annexId ? `/admin/annexes/${annexId}` : null,
  );
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
      const contentFormat = String(form.get("contentFormat"));
      const payload =
        kind === "ARTICLE"
          ? { text: form.get("text") }
          : kind === "LEGISLATION"
            ? { preambleText: form.get("text") }
            : {
                titleAr: form.get("titleAr"),
                annexType: form.get("annexType"),
                contentFormat,
                textContent:
                  contentFormat === "TEXT" ? form.get("textContent") : null,
                structuredTable:
                  contentFormat === "STRUCTURED_TABLE"
                    ? readStructuredTable(form.get("structuredTableJson"))
                    : null,
                sourceDocumentId: form.get("sourceDocumentId"),
              };
      await apiRequest(
        `/admin/corrections/${kind}/${kind === "LEGISLATION" ? lawId : form.get("targetId")}`,
        {
          body: {
            payload,
            effectiveFrom: form.get(
              kind === "ANNEX" ? "effectiveFrom" : "date",
            ),
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
          <CorrectionContent
            kind={draft.target_kind}
            value={draft.before}
            annexOptions={annexOptions}
          />
          <h3>التصحيح المقترح</h3>
          <CorrectionContent
            kind={draft.target_kind}
            value={draft.payload}
            annexOptions={annexOptions}
          />
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
                onChange={(event) => {
                  const next = event.target.value;
                  setKind(next);
                  if (next === "ANNEX" && !annexId)
                    setAnnexId(
                      annexes.find((annex) => annex.status === "PUBLISHED")
                        ?.id ??
                        annexes[0]?.id ??
                        "",
                    );
                }}
              >
                <option value="LEGISLATION">ديباجة التشريع</option>
                <option value="ARTICLE">نص مادة</option>
                <option value="ANNEX">محتوى ملحق</option>
              </select>
            </label>
            {kind !== "LEGISLATION" && (
              <label>
                السجل
                <select
                  key={kind}
                  name="targetId"
                  required
                  value={kind === "ANNEX" ? annexId : undefined}
                  onChange={(event) => {
                    if (kind === "ANNEX") setAnnexId(event.target.value);
                  }}
                >
                  {(kind === "ARTICLE"
                    ? articles.map((item) => ({
                        id: item.id,
                        label: `المادة ${item.currentLabel}`,
                      }))
                    : annexes
                        .filter((item) => item.status === "PUBLISHED")
                        .map((item) => ({
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
            {kind === "ANNEX" ? (
              annexDetail.loading || !annexOptions ? (
                <LoadingCards />
              ) : annexDetail.error || !annexDetail.data ? (
                <ErrorPanel
                  message={
                    annexDetail.error?.message ?? "تعذر تحميل بيانات الملحق."
                  }
                  retry={annexDetail.retry}
                />
              ) : (
                <AnnexContentFields
                  key={annexDetail.data.id}
                  options={annexOptions}
                  sources={sources}
                  legislationId={lawId}
                  initial={annexDetail.data}
                  canPublish
                />
              )
            ) : (
              <>
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
              </>
            )}
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
            <button
              className="button primary"
              disabled={
                busy ||
                !allowed ||
                (kind === "ANNEX" && (!annexDetail.data || !annexOptions))
              }
            >
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

function CorrectionContent({
  kind,
  value,
  annexOptions,
}: {
  kind: string;
  value: Record<string, unknown>;
  annexOptions?: AnnexOptions | null;
}) {
  if (kind !== "ANNEX")
    return (
      <div className="correction-text">
        {Object.values(value)
          .filter((item) => typeof item === "string")
          .join("\n")}
      </div>
    );
  const format = String(value.contentFormat ?? "FILE") as
    "TEXT" | "STRUCTURED_TABLE" | "FILE";
  const typeLabel =
    annexOptions?.types.find((item) => item.code === value.annexType)
      ?.labelAr ?? String(value.annexType ?? "ملحق");
  return (
    <div className="correction-annex-preview">
      <p>
        <strong>{String(value.titleAr ?? "ملحق")}</strong> · {typeLabel}
      </p>
      {format === "FILE" ? (
        <p>ملف مرتبط بالمصدر المحدد لهذا التصحيح.</p>
      ) : (
        <AnnexContentView
          contentFormat={format}
          textContent={String(value.textContent ?? "")}
          structuredTable={value.structuredTable}
          title={String(value.titleAr ?? "ملحق")}
          compact
        />
      )}
    </div>
  );
}
