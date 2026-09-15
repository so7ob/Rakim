import { useOperationPolicies } from "../../hooks/use-operation-policies";
import { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { EntityDetails } from "../../components/admin/EntityDetails";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { AdministrativeStatusBadge } from "../../components/admin/LegislationStatus";
import { useApi } from "../../hooks/use-api";
import {
  AmendmentFormDialog,
  amendmentOperationLabels,
  type Document,
} from "./AdminAmendmentsPage";

export function AdminAmendmentDetailPage() {
  const policies = useOperationPolicies();
  const { id, tab = "general" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const item = useApi<Document>(id ? `/admin/amendments/${id}` : null);
  const [editing, setEditing] = useState(() =>
    Boolean((location.state as { openEdit?: boolean } | null)?.openEdit),
  );
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<"review" | "publish" | null>(
    null,
  );
  const [reason, setReason] = useState("");

  useEffect(() => {
    if ((location.state as { openEdit?: boolean } | null)?.openEdit)
      navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  if (!id) return <Navigate to="/ar/admin/amendments/list" replace />;
  if (!new Set(["general", "operations"]).has(tab))
    return <Navigate to={`/ar/admin/amendments/${id}/general`} replace />;
  if (item.loading) return <LoadingCards />;
  if (item.error || !item.data)
    return (
      <ErrorPanel
        message={item.error?.message ?? "وثيقة التعديل غير موجودة."}
        retry={item.retry}
      />
    );

  const document = item.data;
  const canEdit =
    Boolean(document.isActive) &&
    (document.status === "DRAFT" ||
      policies.allows("EDIT_AMENDMENT_REVIEWED")) &&
    (document.status !== "PUBLISHED" ||
      auth.hasPermission("amendment.create")) &&
    auth.hasPermission("amendment.update");
  const canReview =
    Boolean(document.isActive) &&
    document.status === "DRAFT" &&
    auth.hasPermission("amendment.review");
  const canPublish =
    Boolean(document.isActive) &&
    (document.status === "REVIEWED" ||
      (document.status === "DRAFT" &&
        policies.allows("AMENDMENT_WORKFLOW_ORDER"))) &&
    auth.hasPermission("amendment.publish");
  const openDecision = (action: "review" | "publish") => {
    setReason("");
    setConfirmation(action);
  };

  return (
    <section>
      <AdminPageHeader
        eyebrow="تفاصيل وثيقة التعديل"
        title={document.titleAr}
        description={`${document.legislationTitle} — ${document.operations.length} عنصر تعديل`}
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "وثائق التعديل", to: "/ar/admin/amendments/list" },
          { label: document.titleAr },
        ]}
        status={<StatusBadge status={document.status} />}
        actions={
          <>
            {canEdit && (
              <button
                className="button secondary"
                onClick={() => setEditing(true)}
              >
                تعديل الوثيقة وعناصرها
              </button>
            )}
            {canReview && (
              <button className="button" onClick={() => openDecision("review")}>
                اعتماد المراجعة
              </button>
            )}
            {canPublish && (
              <button
                className="button"
                onClick={() => openDecision("publish")}
              >
                نشر وتطبيق جميع العناصر
              </button>
            )}
          </>
        }
      />
      <AdminTabs
        label="تبويبات تفاصيل وثيقة التعديل"
        items={[
          {
            label: "بيانات الوثيقة",
            to: `/ar/admin/amendments/${document.id}/general`,
          },
          {
            label: "عناصر التعديل",
            to: `/ar/admin/amendments/${document.id}/operations`,
            count: document.operations.length,
          },
        ]}
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <div className="admin-entity-actions">
        <LifecycleActions
          kind="amendments"
          id={document.id}
          label={document.titleAr}
          showStatus={false}
          onDone={(action) => {
            if (action === "delete") navigate("/ar/admin/amendments/list");
            else item.retry();
          }}
        />
      </div>

      {tab === "general" && (
        <section className="admin-card">
          <h2>بيانات الوثيقة</h2>
          <EntityDetails
            items={[
              { label: "العنوان", value: document.titleAr, wide: true },
              {
                label: "التشريع المستهدف",
                value: (
                  <Link
                    to={`/ar/admin/content/${document.legislationId}/general`}
                  >
                    {document.legislationTitle}
                  </Link>
                ),
              },
              {
                label: "أداة التعديل",
                value:
                  document.instrumentLegislationId &&
                  document.instrumentLegislationTitle ? (
                    <Link
                      to={`/ar/admin/content/${document.instrumentLegislationId}/general`}
                    >
                      {document.instrumentLegislationTitle}
                    </Link>
                  ) : (
                    "—"
                  ),
              },
              { label: "المصدر", value: document.sourceName },
              { label: "تاريخ الإصدار", value: document.issueDate || "—" },
              { label: "بدء الأثر القانوني", value: document.effectiveFrom },
              { label: "عدد عناصر التعديل", value: document.operations.length },
              {
                label: "سير العمل",
                value: <StatusBadge status={document.status} />,
              },
              {
                label: "الحالة الإدارية",
                value: (
                  <AdministrativeStatusBadge
                    active={Boolean(document.isActive)}
                  />
                ),
              },
              { label: "منشئ الوثيقة", value: document.createdBy || "—" },
              { label: "تاريخ الإنشاء", value: document.createdAt || "—" },
              { label: "المراجع", value: document.reviewedBy || "—" },
              { label: "تاريخ المراجعة", value: document.reviewedAt || "—" },
              { label: "تاريخ النشر", value: document.publishedAt || "—" },
            ]}
          />
        </section>
      )}

      {tab === "operations" && (
        <section className="admin-list" aria-labelledby="operations-title">
          <h2 id="operations-title">عناصر التعديل</h2>
          {document.operations.length ? (
            document.operations.map((operation, index) => {
              const articleLabel =
                operation.operationType === "ADD"
                  ? operation.newLabel
                  : operation.articleLabel;
              return (
                <article className="admin-list-card" key={operation.id}>
                  <header>
                    <div>
                      <h3>
                        {index + 1}.{" "}
                        {amendmentOperationLabels[operation.operationType]}
                      </h3>
                      <p>المادة {articleLabel || "—"}</p>
                    </div>
                    <span className="tag">
                      {Boolean(operation.isActive)
                        ? "فعال إدارياً"
                        : "معطل إدارياً"}
                    </span>
                  </header>
                  <EntityDetails
                    items={[
                      {
                        label: "نص الاستناد",
                        value: operation.citationText,
                        wide: true,
                      },
                      {
                        label: "موضع الفقرة",
                        value: operation.paragraphLocator || "—",
                      },
                      {
                        label: "العبارة الأصلية",
                        value: operation.replacementFrom || "—",
                        wide: true,
                      },
                      {
                        label: "الرقم الجديد",
                        value: operation.newLabel || "—",
                      },
                      {
                        label: "مفتاح الترتيب",
                        value: operation.sortKey || "—",
                      },
                      {
                        label: "النص المقترح",
                        value: operation.newText ? (
                          <span className="legal-text compact">
                            {operation.newText}
                          </span>
                        ) : (
                          "—"
                        ),
                        wide: true,
                      },
                    ]}
                  />
                  {operation.id && (
                    <div className="admin-entity-actions">
                      <LifecycleActions
                        kind="amendment-operations"
                        id={operation.id}
                        label={`عنصر ${index + 1} من ${document.titleAr}`}
                        showStatus={false}
                        onDone={item.retry}
                      />
                    </div>
                  )}
                </article>
              );
            })
          ) : (
            <p>لا تحتوي الوثيقة عناصر تعديل فعالة.</p>
          )}
        </section>
      )}

      {editing && canEdit && (
        <AmendmentFormDialog
          document={document}
          onClose={() => setEditing(false)}
          onDone={(savedId) => {
            setEditing(false);
            if (savedId && savedId !== document.id) {
              window.location.assign(`/ar/admin/amendments/${savedId}/general`);
              return;
            }
            setMessage("حُفظت الوثيقة دون فقد عناصرها الأخرى.");
            item.retry();
          }}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation === "review"
              ? "اعتماد مراجعة الوثيقة"
              : "نشر وثيقة التعديل"
          }
          description={`${document.titleAr}: سيشمل الإجراء جميع العناصر الفعالة. النشر ينشئ نسخاً زمنية ويحفظ النصوص السابقة.`}
          confirmLabel="تأكيد"
          onClose={() => setConfirmation(null)}
          onConfirm={async () => {
            if (reason.trim().length < 3) throw new Error("سبب الإجراء مطلوب.");
            await apiRequest(
              `/admin/amendments/${document.id}/${confirmation}`,
              { body: { reason } },
            );
            setConfirmation(null);
            setMessage(
              confirmation === "review"
                ? "تم اعتماد مراجعة الوثيقة."
                : "تم نشر الوثيقة وتطبيق عناصرها.",
            );
            item.retry();
          }}
        >
          <label>
            سبب الإجراء
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </ConfirmDialog>
      )}
    </section>
  );
}
