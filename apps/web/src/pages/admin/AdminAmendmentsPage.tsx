import { useOperationPolicies } from "../../hooks/use-operation-policies";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { AdminRowActions } from "../../components/admin/AdminRowActions";
import { AdministrativeStatusBadge } from "../../components/admin/LegislationStatus";
export interface Operation {
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
  isActive?: boolean | number;
}
export interface Document {
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
  createdAt?: string;
  reviewedAt?: string;
  publishedAt?: string;
  createdBy?: string;
  reviewedBy?: string;
  instrumentLegislationTitle?: string;
  status: string;
  isActive: boolean | number;
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
export const amendmentOperationLabels: Record<string, string> = {
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
  const policies = useOperationPolicies();
  const { tab = "list" } = useParams(),
    auth = useAuth(),
    navigate = useNavigate();
  const data = useApi<Document[]>("/admin/amendments");
  const [creating, setCreating] = useState(false);
  const closeCreate = () => {
    setCreating(false);
    if (tab === "create")
      navigate("/ar/admin/amendments/list", { replace: true });
  };
  const [message, setMessage] = useState("");
  return (
    <section>
      <AdminPageHeader
        title="وثائق التعديل"
        eyebrow="مسودة ← مراجعة مستقلة ← نشر"
        description="تُحفظ عناصر الوثيقة معاً، ويطبّق نشرها في معاملة واحدة مع حفظ النصوص السابقة."
        actions={
          auth.hasPermission("amendment.create") ? (
            <button className="button" onClick={() => setCreating(true)}>
              + إضافة وثيقة تعديل
            </button>
          ) : undefined
        }
      />
      <AdminTabs
        label="تبويبات وثائق التعديل"
        items={[{ label: "الوثائق", to: "/ar/admin/amendments/list" }]}
      />
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {(creating || tab === "create") &&
        auth.hasPermission("amendment.create") && (
          <AmendmentFormDialog
            onClose={closeCreate}
            onDone={() => {
              setMessage("حُفظت وثيقة التعديل وعناصرها.");
              data.retry();
              closeCreate();
            }}
          />
        )}
      {data.loading ? (
        <LoadingCards />
      ) : data.error ? (
        <ErrorPanel message={data.error.message} retry={data.retry} />
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>وثيقة التعديل</th>
                <th>التشريع المستهدف</th>
                <th>تاريخ الأثر</th>
                <th>العناصر</th>
                <th>سير العمل</th>
                <th>الحالة الإدارية</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {data.data?.length ? (
                data.data.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <Link to={`/ar/admin/amendments/${doc.id}/general`}>
                        <strong>{doc.titleAr}</strong>
                      </Link>
                      <small>المصدر: {doc.sourceName}</small>
                    </td>
                    <td>{doc.legislationTitle}</td>
                    <td>
                      {doc.effectiveFrom}
                      {doc.issueDate && <small>الإصدار: {doc.issueDate}</small>}
                    </td>
                    <td>{doc.operations.length}</td>
                    <td>
                      <StatusBadge status={doc.status} />
                    </td>
                    <td>
                      <AdministrativeStatusBadge
                        active={Boolean(doc.isActive)}
                      />
                    </td>
                    <td>
                      <AdminRowActions
                        label={`إجراءات وثيقة التعديل ${doc.titleAr}`}
                      >
                        <Link
                          className="button secondary"
                          to={`/ar/admin/amendments/${doc.id}/general`}
                        >
                          عرض
                        </Link>
                        {(doc.status === "DRAFT" ||
                          policies.allows("EDIT_AMENDMENT_REVIEWED")) &&
                          (doc.status !== "PUBLISHED" ||
                            auth.hasPermission("amendment.create")) &&
                          Boolean(doc.isActive) &&
                          auth.hasPermission("amendment.update") && (
                            <Link
                              className="link-button"
                              to={`/ar/admin/amendments/${doc.id}/general`}
                              state={{ openEdit: true }}
                            >
                              تعديل
                            </Link>
                          )}
                        <LifecycleActions
                          kind="amendments"
                          id={doc.id}
                          label={doc.titleAr}
                          showStatus={false}
                          onDone={data.retry}
                        />
                      </AdminRowActions>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>لا توجد وثائق تعديل.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export function AmendmentFormDialog({
  document: doc,
  onDone,
  onClose,
}: {
  document?: Document;
  onDone: (id?: string) => void;
  onClose: () => void;
}) {
  const auth = useAuth();
  const candidates = useApi<Candidates>("/admin/amendments/candidates");
  const [operations, setOperations] = useState<Operation[]>(
    doc?.operations.map((o) => ({ ...o })) ?? [emptyOperation()],
  );
  const [legislationId, setLegislationId] = useState(doc?.legislationId ?? "");
  const [dirty, setDirty] = useState(false);
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
      const saved = await apiRequest<{ id: string }>(
        `/admin/amendments${doc ? `/${doc.id}` : ""}`,
        {
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
        },
      );
      onDone(saved.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <AdminDialog
      title={doc ? `تعديل ${doc.titleAr}` : "إضافة وثيقة تعديل"}
      size="large"
      dirty={dirty && !saving}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      {candidates.loading ? (
        <LoadingCards />
      ) : candidates.error ? (
        <ErrorPanel
          message={candidates.error.message}
          retry={candidates.retry}
        />
      ) : (
        <form
          className="edit-form"
          onSubmit={submit}
          onChange={() => setDirty(true)}
        >
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
                  {op.isActive !== undefined && !Boolean(op.isActive)
                    ? " (معطل إدارياً)"
                    : ""}
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
                      {Object.entries(amendmentOperationLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {op.operationType !== "ADD" && (
                    <label>
                      المادة المستهدفة
                      <select
                        aria-label="المادة المستهدفة"
                        value={op.articleId ?? ""}
                        required
                        onChange={(e) =>
                          update(index, "articleId", e.target.value)
                        }
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
                        onChange={(e) =>
                          update(index, "newLabel", e.target.value)
                        }
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
                        onChange={(e) =>
                          update(index, "sortKey", e.target.value)
                        }
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
                    onChange={(e) =>
                      update(index, "citationText", e.target.value)
                    }
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
                        onChange={(e) =>
                          update(index, "newText", e.target.value)
                        }
                      />
                    </label>
                    {op.operationType !== "ADD" && (
                      <>
                        <label>
                          العبارة الأصلية المراد استبدالها (اتركها فارغة
                          لاستبدال النص الكامل)
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
                operations.length >= 200 ||
                !auth.hasPermission("amendment.create")
              }
              onClick={() => {
                setDirty(true);
                setOperations((old) => [...old, emptyOperation()]);
              }}
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
                setDirty(true);
                setOperations((old) => old.filter((_, i) => i !== removing));
                setRemoving(null);
              }}
            />
          )}
        </form>
      )}
    </AdminDialog>
  );
}
