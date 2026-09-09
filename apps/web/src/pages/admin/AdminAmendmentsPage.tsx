import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../hooks/use-api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
interface Operation {
  id?: string;
  articleId?: string;
  articleLabel?: string;
  operationType: string;
  citationText: string;
  newText?: string;
  newLabel?: string;
  sortKey?: string;
  paragraphLocator?: string;
  replacementFrom?: string;
  isActive?: boolean;
}
interface Document {
  id: string;
  revision: number;
  titleAr: string;
  legislationId: string;
  legislationTitle: string;
  sourceDocumentId: string;
  sourceName: string;
  instrumentLegislationId?: string;
  issueDate?: string;
  effectiveFrom: string;
  status: string;
  isActive: boolean;
  operations: Operation[];
}
interface Candidates {
  articles: Array<{
    id: string;
    legislationId: string;
    currentLabel: string;
    legislationTitle: string;
  }>;
  sources: Array<{ id: string; originalName: string }>;
  legislations: Array<{ id: string; titleAr: string }>;
}
const labels: Record<string, string> = {
  ADD: "إضافة مادة جديدة",
  REPLACE: "استبدال نص / عبارة",
  CORRECT: "تصحيح",
  REPEAL: "إلغاء قانوني",
  DELETE: "حذف قانوني للنص",
  RENUMBER: "إعادة ترقيم",
};
const emptyOperation = (): Operation => ({
  operationType: "REPLACE",
  citationText: "",
  articleId: "",
  newText: "",
  newLabel: "",
  sortKey: "",
  replacementFrom: "",
  paragraphLocator: "",
});
export function AdminAmendmentsPage() {
  const { tab = "list" } = useParams(),
    auth = useAuth(),
    navigate = useNavigate();
  const data = useApi<Document[]>("/admin/amendments");
  const [editing, setEditing] = useState<Document | null>(null),
    [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<{
    document: Document;
    action: "review" | "publish";
  } | null>(null);
  const [reason, setReason] = useState("");
  return (
    <section>
      <AdminPageHeader
        title="وثائق التعديل"
        eyebrow="مسودة ← مراجعة مستقلة ← نشر"
        description="تُحفظ عناصر الوثيقة معاً، ويطبّق نشرها في معاملة واحدة مع حفظ النصوص السابقة."
        actions={
          tab === "list" && auth.hasPermission("amendment.create") ? (
            <button
              className="button"
              onClick={() => navigate("/ar/admin/amendments/create")}
            >
              + إضافة وثيقة تعديل
            </button>
          ) : undefined
        }
      />
      <AdminTabs
        label="تبويبات وثائق التعديل"
        items={[
          { label: "الوثائق", to: "/ar/admin/amendments/list" },
          ...(auth.hasPermission("amendment.create")
            ? [{ label: "إضافة وثيقة", to: "/ar/admin/amendments/create" }]
            : []),
        ]}
      />
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {tab === "create" && auth.hasPermission("amendment.create") && (
        <AmendmentForm
          onDone={() => {
            setMessage("حُفظت وثيقة التعديل وعناصرها.");
            data.retry();
            navigate("/ar/admin/amendments/list");
          }}
        />
      )}
      {tab === "list" &&
        (data.loading ? (
          <LoadingCards />
        ) : data.error ? (
          <ErrorPanel message={data.error.message} retry={data.retry} />
        ) : (
          <div className="admin-list">
            {data.data?.map((doc) => (
              <article className="admin-card" key={doc.id}>
                <header>
                  <StatusBadge status={doc.status} />
                  <h2>{doc.titleAr}</h2>
                  <p>
                    {doc.legislationTitle} — {doc.effectiveFrom}
                  </p>
                  <p>المصدر: {doc.sourceName}</p>
                </header>
                <div className="admin-entity-actions">
                  <LifecycleActions
                    kind="amendments"
                    id={doc.id}
                    label={doc.titleAr}
                    onDone={data.retry}
                  />
                  {doc.status === "DRAFT" &&
                    auth.hasPermission("amendment.update") && (
                      <button
                        className="button secondary"
                        onClick={() => setEditing(doc)}
                      >
                        تعديل الوثيقة وعناصرها
                      </button>
                    )}
                  {doc.isActive &&
                    ((doc.status === "DRAFT" &&
                      auth.hasPermission("amendment.review")) ||
                      (doc.status === "REVIEWED" &&
                        auth.hasPermission("amendment.publish"))) && (
                      <button
                        className="button"
                        onClick={() => {
                          setReason("");
                          setConfirmation({
                            document: doc,
                            action:
                              doc.status === "DRAFT" ? "review" : "publish",
                          });
                        }}
                      >
                        {doc.status === "DRAFT"
                          ? "اعتماد المراجعة"
                          : "نشر وتطبيق جميع العناصر"}
                      </button>
                    )}
                </div>
                <h3>عناصر الوثيقة ({doc.operations.length})</h3>
                {doc.operations.map((op, index) => (
                  <section className="admin-list-card" key={op.id}>
                    <h4>
                      {index + 1}. {labels[op.operationType]} — المادة{" "}
                      {op.operationType === "ADD"
                        ? op.newLabel
                        : op.articleLabel}
                    </h4>
                    <p>{op.citationText}</p>
                    {op.replacementFrom && (
                      <p>العبارة الأصلية: {op.replacementFrom}</p>
                    )}
                    {op.newText && (
                      <details>
                        <summary>النص المقترح</summary>
                        <p className="legal-text compact">{op.newText}</p>
                      </details>
                    )}
                    {op.id && (
                      <div className="admin-entity-actions">
                        <LifecycleActions
                          kind="amendment-operations"
                          id={op.id}
                          label={`عنصر ${index + 1} من ${doc.titleAr}`}
                          onDone={data.retry}
                        />
                      </div>
                    )}
                  </section>
                ))}
              </article>
            ))}
          </div>
        ))}
      {editing && (
        <AdminDialog
          title={`تعديل ${editing.titleAr}`}
          size="large"
          onClose={() => setEditing(null)}
        >
          <AmendmentForm
            document={editing}
            onDone={() => {
              setEditing(null);
              data.retry();
              setMessage("حُفظت الوثيقة دون فقد عناصرها الأخرى.");
            }}
          />
        </AdminDialog>
      )}
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation.action === "review"
              ? "اعتماد مراجعة الوثيقة"
              : "نشر وثيقة التعديل"
          }
          description={`${confirmation.document.titleAr}: سيشمل الإجراء جميع العناصر الفعالة. النشر ينشئ نسخاً زمنية ويحفظ النصوص السابقة.`}
          confirmLabel="تأكيد"
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            if (reason.trim().length < 3) throw new Error("سبب الإجراء مطلوب.");
            await apiRequest(
              `/admin/amendments/${confirmation.document.id}/${confirmation.action}`,
              { body: { reason } },
            );
            setConfirmation(null);
            data.retry();
          }}
        >
          <label>
            سبب الإجراء
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
    </section>
  );
}
function AmendmentForm({
  document: doc,
  onDone,
}: {
  document?: Document;
  onDone: () => void;
}) {
  const auth = useAuth();
  const candidates = useApi<Candidates>("/admin/amendments/candidates");
  const [operations, setOperations] = useState<Operation[]>(
    doc?.operations.map((o) => ({ ...o })) ?? [emptyOperation()],
  );
  const [legislationId, setLegislationId] = useState(doc?.legislationId ?? "");
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const update = (index: number, key: keyof Operation, value: string) =>
    setOperations((old) =>
      old.map((op, i) => (i === index ? { ...op, [key]: value } : op)),
    );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await apiRequest(`/admin/amendments${doc ? `/${doc.id}` : ""}`, {
        method: doc ? "PATCH" : "POST",
        body: {
          legislationId,
          titleAr: f.get("titleAr"),
          sourceDocumentId: f.get("sourceDocumentId"),
          instrumentLegislationId:
            f.get("instrumentLegislationId") || undefined,
          issueDate: f.get("issueDate") || undefined,
          effectiveFrom: f.get("effectiveFrom"),
          ...(doc ? { revision: doc.revision, reason: f.get("reason") } : {}),
          operations: operations.map((op) => ({
            id: op.id,
            articleId: op.operationType === "ADD" ? undefined : op.articleId,
            operationType: op.operationType,
            citationText: op.citationText,
            newText: op.newText ?? undefined,
            newLabel: op.newLabel ?? undefined,
            sortKey: op.sortKey ?? undefined,
            paragraphLocator: op.paragraphLocator ?? undefined,
            replacementFrom: op.replacementFrom ?? undefined,
          })),
        },
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  if (candidates.loading) return <LoadingCards />;
  if (candidates.error)
    return (
      <ErrorPanel message={candidates.error.message} retry={candidates.retry} />
    );
  return (
    <form className="admin-card edit-form" onSubmit={submit}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={saving}>
        <div className="form-grid">
          <label>
            عنوان وثيقة التعديل
            <input
              name="titleAr"
              defaultValue={doc?.titleAr}
              required
              minLength={3}
              maxLength={1000}
            />
          </label>
          <label>
            التشريع المستهدف
            <select
              aria-label="التشريع المستهدف"
              value={legislationId}
              onChange={(e) => setLegislationId(e.target.value)}
              required
              disabled={!!doc}
            >
              <option value="">اختر تشريعاً…</option>
              {candidates.data?.legislations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titleAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            المصدر المدقق
            <select
              aria-label="المصدر المدقق"
              name="sourceDocumentId"
              defaultValue={doc?.sourceDocumentId ?? ""}
              required
            >
              <option value="">اختر المصدر…</option>
              {candidates.data?.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.originalName}
                </option>
              ))}
            </select>
          </label>
          <label>
            تشريع أداة التعديل (اختياري)
            <select
              name="instrumentLegislationId"
              defaultValue={doc?.instrumentLegislationId ?? ""}
            >
              <option value="">دون ربط إضافي</option>
              {candidates.data?.legislations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.titleAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            تاريخ إصدار الوثيقة
            <input
              type="date"
              name="issueDate"
              defaultValue={doc?.issueDate ?? ""}
            />
          </label>
          <label>
            بدء الأثر القانوني
            <input
              type="date"
              name="effectiveFrom"
              defaultValue={doc?.effectiveFrom}
              required
            />
          </label>
        </div>
        <h2>عناصر الوثيقة</h2>
        {operations.map((op, index) => (
          <fieldset className="admin-list-card" key={op.id ?? index}>
            <legend>
              عنصر {index + 1}
              {op.isActive === false ? " (معطل إدارياً)" : ""}
            </legend>
            <div className="form-grid">
              <label>
                نوع العملية
                <select
                  aria-label="نوع العملية"
                  value={op.operationType}
                  onChange={(e) =>
                    update(index, "operationType", e.target.value)
                  }
                >
                  {Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {op.operationType !== "ADD" && (
                <label>
                  المادة المستهدفة
                  <select
                    aria-label="المادة المستهدفة"
                    value={op.articleId ?? ""}
                    required
                    onChange={(e) => update(index, "articleId", e.target.value)}
                  >
                    <option value="">اختر المادة…</option>
                    {candidates.data?.articles
                      .filter((a) => a.legislationId === legislationId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          المادة {a.currentLabel} — {a.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {["ADD", "RENUMBER"].includes(op.operationType) && (
                <label>
                  رقم المادة الجديد
                  <input
                    value={op.newLabel ?? ""}
                    required
                    maxLength={120}
                    onChange={(e) => update(index, "newLabel", e.target.value)}
                  />
                </label>
              )}
              {op.operationType === "ADD" && (
                <label>
                  مفتاح ترتيب المادة الجديدة
                  <input
                    value={op.sortKey ?? ""}
                    required
                    maxLength={120}
                    onChange={(e) => update(index, "sortKey", e.target.value)}
                  />
                </label>
              )}
            </div>
            <label>
              نص الاستناد
              <textarea
                value={op.citationText}
                required
                minLength={3}
                maxLength={5000}
                onChange={(e) => update(index, "citationText", e.target.value)}
              />
            </label>
            {["ADD", "REPLACE", "CORRECT"].includes(op.operationType) && (
              <>
                <label>
                  النص الجديد
                  <textarea
                    aria-label="النص الجديد"
                    value={op.newText ?? ""}
                    required
                    maxLength={100000}
                    rows={7}
                    onChange={(e) => update(index, "newText", e.target.value)}
                  />
                </label>
                {op.operationType !== "ADD" && (
                  <>
                    <label>
                      العبارة الأصلية المراد استبدالها (اتركها فارغة لاستبدال
                      النص الكامل)
                      <textarea
                        value={op.replacementFrom ?? ""}
                        onChange={(e) =>
                          update(index, "replacementFrom", e.target.value)
                        }
                        maxLength={10000}
                      />
                    </label>
                    <label>
                      موضع العبارة (اختياري)
                      <input
                        value={op.paragraphLocator ?? ""}
                        maxLength={160}
                        onChange={(e) =>
                          update(index, "paragraphLocator", e.target.value)
                        }
                      />
                    </label>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              className="link-button danger"
              disabled={
                operations.length === 1 ||
                (Boolean(doc) && !auth.hasPermission("amendment.delete"))
              }
              onClick={() => setRemoving(index)}
            >
              حذف هذا العنصر من المسودة
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="button secondary"
          disabled={
            operations.length >= 200 || !auth.hasPermission("amendment.create")
          }
          onClick={() => setOperations((old) => [...old, emptyOperation()])}
        >
          + إضافة عنصر إلى الوثيقة
        </button>
        {doc && (
          <label>
            سبب التعديل
            <input name="reason" required minLength={3} maxLength={1000} />
          </label>
        )}
      </fieldset>
      <button className="button" disabled={saving}>
        {saving ? "جار حفظ الوثيقة…" : "حفظ الوثيقة وجميع عناصرها"}
      </button>
      {removing !== null && (
        <ConfirmDialog
          title={`حذف العنصر ${removing + 1}`}
          description="سيحذف العنصر عند حفظ الوثيقة، وتبقى العناصر الأخرى كما هي."
          confirmLabel="إزالة العنصر"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            setOperations((old) => old.filter((_, i) => i !== removing));
            setRemoving(null);
          }}
        />
      )}
    </form>
  );
}
