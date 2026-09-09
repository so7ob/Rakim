import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { RecordFormDialog } from "../../components/admin/RecordFormDialog";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { SourceEditor } from "./AdminContentDetailPage";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
interface ImportItem {
  id: string;
  sourceDocumentId: string;
  obtainedFrom: string;
  pageCount: number | null;
  status: string;
  detectedFormat: string;
  createdAt: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  extractionStatus: string;
  ocrConfidence: number | null;
  uploadedBy: string;
  legislationId: string | null;
  legislationTitle: string | null;
  attachmentCount: number;
  referencePdfName: string | null;
}
interface Refs {
  types: Array<{ id: string; name: string }>;
  authorities: Array<{ id: string; name: string }>;
}
interface AnalysisNode {
  key: string;
  kind: "BAB" | "FASL" | "QISM";
  label: string;
  title: string;
  parentKey: string | null;
  documentOrder: number;
  status: "CONFIRMED" | "REVIEW_REQUIRED";
}
interface AnalysisArticle {
  key: string;
  label: string;
  number: string;
  headingLabel: string;
  structureNodeKey: string | null;
  documentOrder: number;
  status: "CONFIRMED" | "REVIEW_REQUIRED";
  textExcerpt: string;
}
interface ImportAnalysis {
  schemaVersion: number;
  parser: string;
  nodes: AnalysisNode[];
  articles: AnalysisArticle[];
  issues: Array<{
    code: string;
    message: string;
    sourceLine?: number;
    excerpt?: string;
  }>;
  summary: {
    babs: number;
    fasls: number;
    qisms: number;
    articles: number;
    rootArticles: number;
    reviewRequired: number;
  };
}
export function AdminImportsPage() {
  const { tab = "queue" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const closeUpload = () => {
    setCreating(false);
    if (tab === "upload")
      navigate("/ar/admin/imports/queue", { replace: true });
  };
  const imports = useApi<ImportItem[]>("/imports");
  const refs = useApi<Refs>("/admin/references");
  const [message, setMessage] = useState("");
  const hasPendingImport = imports.data?.some(
    (item) =>
      ["UPLOADED", "QUEUED", "PROCESSING"].includes(item.status) ||
      ["PENDING", "QUEUED", "EXTRACTING"].includes(item.extractionStatus),
  );
  useEffect(() => {
    if (!hasPendingImport) return;
    const timer = window.setInterval(imports.retry, 2_000);
    return () => window.clearInterval(timer);
  }, [hasPendingImport, imports.retry]);
  return (
    <section>
      <AdminPageHeader
        eyebrow="المصدر منفصل عن النص"
        title="الاستيراد والمصادر"
        description="راقب طابور المصادر وأضف ملفات النص والمرفقات من نافذة الإضافة."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إدارة المحتوى" },
          { label: "الاستيراد والمصادر" },
        ]}
        actions={
          <>
            <button className="button secondary" onClick={imports.retry}>
              تحديث الحالات
            </button>
            {auth.hasPermission("source.upload") && (
              <button
                type="button"
                className="button"
                onClick={() => setCreating(true)}
              >
                + إضافة مصدر
              </button>
            )}
          </>
        }
      />
      <AdminTabs
        label="إدارة المصادر"
        items={[
          {
            label: "طابور المصادر",
            to: "/ar/admin/imports/queue",
            count: imports.data?.length,
          },
        ]}
      />
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {(creating || tab === "upload") &&
        auth.hasPermission("source.upload") && (
          <UploadSourceDialog
            onClose={closeUpload}
            onDone={(successMessage) => {
              closeUpload();
              setMessage(successMessage);
              imports.retry();
            }}
          />
        )}
      {imports.loading ? (
        <LoadingCards />
      ) : imports.error ? (
        <ErrorPanel message={imports.error.message} retry={imports.retry} />
      ) : (
        <div className="admin-list">
          {imports.data?.map((item) => (
            <article className="admin-card" key={item.id}>
              <div
                className="admin-entity-actions"
                role="group"
                aria-label={`إجراءات المصدر ${item.originalName}`}
              >
                <span>الحالة الإدارية:</span>
                <LifecycleActions
                  kind="sources"
                  id={item.sourceDocumentId}
                  label={item.originalName}
                  onDone={imports.retry}
                />
              </div>
              <details className="import-row">
                <summary>
                  <div>
                    <strong>{item.originalName}</strong>
                    <span>
                      {item.detectedFormat} —{" "}
                      {(Number(item.byteSize) / 1024).toFixed(1)} ك.ب —{" "}
                      {item.uploadedBy}
                      {Number(item.attachmentCount) > 0 &&
                        ` — PDF: ${item.referencePdfName}`}
                    </span>
                  </div>
                  <span>
                    حالة الاستيراد: <StatusBadge status={item.status} />
                  </span>
                </summary>
                <div className="import-details">
                  <dl>
                    <div>
                      <dt>SHA-256</dt>
                      <dd className="hash">{item.sha256}</dd>
                    </div>
                    <div>
                      <dt>حالة الاستخراج</dt>
                      <dd>{item.extractionStatus}</dd>
                    </div>
                    <div>
                      <dt>ثقة OCR</dt>
                      <dd>{item.ocrConfidence ?? "غير مطلوب"}</dd>
                    </div>
                  </dl>
                  {auth.hasPermission("source.review") &&
                    item.status === "READY_FOR_REVIEW" && (
                      <ReviewImport id={item.id} done={imports.retry} />
                    )}{" "}
                  {auth.hasPermission("source.draft.create") &&
                    !item.legislationId &&
                    ["READY_FOR_REVIEW", "REVIEWED"].includes(item.status) &&
                    refs.data && (
                      <CreateDraft
                        id={item.id}
                        refs={refs.data}
                        done={imports.retry}
                      />
                    )}{" "}
                  {item.legislationTitle && (
                    <p>
                      المسودة المرتبطة:{" "}
                      <Link
                        to={`/ar/admin/content/${item.legislationId}/structure`}
                      >
                        {item.legislationTitle}
                      </Link>
                    </p>
                  )}
                  <SourceEditor
                    source={{
                      ...item,
                      id: item.sourceDocumentId,
                      sourceRole: "EXTRACTION",
                    }}
                    editable={auth.hasPermission("source.update")}
                    showLifecycle={false}
                    done={imports.retry}
                  />
                  <ImportPreview
                    id={item.id}
                    mediaType={item.mediaType}
                    name={item.originalName}
                  />
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function UploadSourceDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    const body = new FormData(event.currentTarget);
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest("/imports", { body });
      setDirty(false);
      onDone(
        body.get("referencePdf") instanceof File &&
          (body.get("referencePdf") as File).size > 0
          ? "تم رفع ملف النص ونسخة PDF معًا، ووُضع النص في طابور الاستخراج."
          : "تم رفع المصدر ووضعه في طابور الاستخراج.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر رفع المصدر.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <AdminDialog
      title="إضافة مصدر"
      description="استعمل ملف النص لاستخراج المواد والبنية، وأرفق نسخة PDF الرسمية للمقارنة والتنزيل من صفحة التشريع."
      dirty={dirty && !busy}
      onClose={() => {
        if (!pending.current) onClose();
      }}
    >
      <form
        className="edit-form"
        onSubmit={upload}
        onChange={() => setDirty(true)}
      >
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <fieldset className="admin-fieldset edit-form" disabled={busy}>
          <label>
            ملف النص للاستخراج
            <input
              name="file"
              type="file"
              accept=".txt,.md,.docx,.pdf,.png,.jpg,.jpeg,.csv,.xlsx"
              required
            />
          </label>
          <label>
            نسخة PDF الرسمية (اختيارية)
            <input name="referencePdf" type="file" accept=".pdf" />
          </label>
          <label>
            جهة الحصول
            <input
              name="obtainedFrom"
              required
              placeholder="مثال: أرشيف الجريدة الرسمية"
            />
          </label>
        </fieldset>
        <button className="button" disabled={busy}>
          {busy ? "جار الرفع…" : "إضافة وبدء الاستخراج"}
        </button>
      </form>
    </AdminDialog>
  );
}

function ImportPreview({
  id,
  mediaType,
  name,
}: {
  id: string;
  mediaType: string;
  name: string;
}) {
  const auth = useAuth();
  const [addingAttachment, setAddingAttachment] = useState(false);
  const [removingAttachment, setRemovingAttachment] = useState<{
    sourceDocumentId: string;
    originalName: string;
  } | null>(null);
  const sources = useApi<Array<{ id: string; originalName: string }>>(
    addingAttachment ? "/admin/source-options" : null,
  );
  const { data, error, loading, retry } = useApi<{
    extracted_text: string;
    error_details: string | null;
    analysis: ImportAnalysis | null;
    attachments: Array<{
      sourceDocumentId: string;
      obtainedFrom: string;
      pageCount: number | null;
      ocrConfidence: number | null;
      extractionStatus: string;
      byteSize: number;
      sha256: string;
      originalName: string;
      mediaType: string;
      role: "OFFICIAL_PDF";
    }>;
  }>(`/imports/${id}`);
  if (loading) return <p>جار تحميل المعاينة…</p>;
  if (error)
    return (
      <button className="link-button" onClick={retry}>
        تعذر تحميل المعاينة
      </button>
    );
  const officialPdf = data?.attachments.find(
    (attachment) => attachment.role === "OFFICIAL_PDF",
  );
  const sourceUrl = officialPdf
    ? `/api/v1/imports/${id}/attachments/${officialPdf.sourceDocumentId}`
    : `/api/v1/imports/${id}/source`;
  const sourceName = officialPdf?.originalName ?? name;
  const viewable =
    Boolean(officialPdf) ||
    mediaType === "application/pdf" ||
    mediaType.startsWith("image/");
  return (
    <>
      {auth.hasPermission("source.update") && (
        <button
          className="button secondary"
          onClick={() => setAddingAttachment(true)}
        >
          إضافة مرفق PDF مدقق
        </button>
      )}
      {addingAttachment && (
        <RecordFormDialog
          title="إضافة مرفق إلى حزمة المصدر"
          path={`/imports/${id}/attachments`}
          fields={[
            {
              name: "sourceDocumentId",
              label: "المرفق المدقق",
              required: true,
              options: (sources.data ?? []).map((s) => ({
                value: s.id,
                label: s.originalName,
              })),
            },
            { name: "reason", label: "سبب الإضافة", required: true },
          ]}
          onClose={() => setAddingAttachment(false)}
          onDone={() => {
            setAddingAttachment(false);
            retry();
          }}
        />
      )}
      {data?.attachments.map((attachment) => (
        <section key={attachment.sourceDocumentId}>
          <SourceEditor
            source={{
              ...attachment,
              id: attachment.sourceDocumentId,
              sourceRole: attachment.role,
            }}
            editable={auth.hasPermission("source.update")}
            done={retry}
          />
          {auth.hasPermission("source.delete") && (
            <button
              className="link-button danger"
              onClick={() => setRemovingAttachment(attachment)}
            >
              إزالة ارتباط المرفق من الحزمة
            </button>
          )}
        </section>
      ))}
      {removingAttachment && (
        <ConfirmDialog
          title={`إزالة ${removingAttachment.originalName}`}
          description="يزال ارتباط الملف بالحزمة فقط. تمنع إزالة المرفق المثبت في تاريخ تشريعي أو المستخدم في تشريع حتى معالجة الارتباط المسموح."
          confirmLabel="إزالة الارتباط"
          onClose={() => setRemovingAttachment(null)}
          onConfirm={async () => {
            await apiRequest(
              `/imports/${id}/attachments/${removingAttachment.sourceDocumentId}`,
              {
                method: "DELETE",
                body: {
                  reason: `إزالة ارتباط ${removingAttachment.originalName} من حزمة المصدر`,
                },
              },
            );
            setRemovingAttachment(null);
            retry();
          }}
        />
      )}

      <StructureAnalysisPreview analysis={data?.analysis ?? null} />
      <h3>المقارنة مع المصدر</h3>
      <div className="source-compare">
        <section>
          <h4>النص المستخرج</h4>
          <pre className="extracted-preview">
            {data?.extracted_text || data?.error_details || "لا يوجد نص بعد."}
          </pre>
        </section>
        <section>
          <h4>الملف الأصلي</h4>
          {officialPdf && (
            <p className="form-hint">نسخة PDF الرسمية: {sourceName}</p>
          )}
          {viewable ? (
            <iframe title={`المصدر: ${sourceName}`} src={sourceUrl} />
          ) : (
            <a className="button secondary" href={sourceUrl} download>
              تنزيل المصدر للمقارنة
            </a>
          )}
        </section>
      </div>
    </>
  );
}

export function StructureAnalysisPreview({
  analysis,
}: {
  analysis: ImportAnalysis | null;
}) {
  if (!analysis) return <p>لم تكتمل نتيجة التحليل الهيكلي بعد.</p>;
  const children = new Map<string | null, AnalysisNode[]>();
  for (const node of analysis.nodes) {
    const items = children.get(node.parentKey) ?? [];
    items.push(node);
    children.set(node.parentKey, items);
  }
  const articles = new Map<string | null, AnalysisArticle[]>();
  for (const article of analysis.articles) {
    const items = articles.get(article.structureNodeKey) ?? [];
    items.push(article);
    articles.set(article.structureNodeKey, items);
  }
  const renderArticle = (article: AnalysisArticle) => (
    <li key={article.key} role="treeitem" className="import-article">
      {article.headingLabel || `المادة ${article.number}`}
      {article.status === "REVIEW_REQUIRED" && (
        <span className="review-flag">يحتاج مراجعة</span>
      )}
    </li>
  );
  const renderNode = (node: AnalysisNode) => {
    const descendants = [
      ...(children.get(node.key) ?? []).map((item) => ({
        type: "node" as const,
        item,
      })),
      ...(articles.get(node.key) ?? []).map((item) => ({
        type: "article" as const,
        item,
      })),
    ].sort((a, b) => a.item.documentOrder - b.item.documentOrder);
    return (
      <li key={node.key} role="treeitem">
        <details open>
          <summary>
            <strong>{node.label}</strong>
            {node.title !== node.label && <span> — {node.title}</span>}
            {node.status === "REVIEW_REQUIRED" && (
              <span className="review-flag">يحتاج مراجعة</span>
            )}
          </summary>
          {descendants.length > 0 && (
            <ul role="group">
              {descendants.map(({ type, item }) =>
                type === "node" ? renderNode(item) : renderArticle(item),
              )}
            </ul>
          )}
        </details>
      </li>
    );
  };
  const roots = [
    ...(children.get(null) ?? []).map((item) => ({
      type: "node" as const,
      item,
    })),
    ...(articles.get(null) ?? []).map((item) => ({
      type: "article" as const,
      item,
    })),
  ].sort((a, b) => a.item.documentOrder - b.item.documentOrder);
  return (
    <section className="structure-analysis" aria-labelledby="analysis-title">
      <h3 id="analysis-title">معاينة البنية القانونية</h3>
      <dl className="import-summary" aria-label="ملخص نتيجة التحليل">
        {[
          ["الأبواب", analysis.summary.babs],
          ["الفصول", analysis.summary.fasls],
          ["الأقسام", analysis.summary.qisms],
          ["المواد", analysis.summary.articles],
          ["مواد دون بنية", analysis.summary.rootArticles],
          ["تحتاج مراجعة", analysis.summary.reviewRequired],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {analysis.issues.length > 0 && (
        <div className="analysis-issues" role="status">
          <h4>ملاحظات التحليل</h4>
          <ul>
            {analysis.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                {issue.message}
                {issue.sourceLine ? ` (السطر ${issue.sourceLine})` : ""}
                {issue.excerpt ? <small>{issue.excerpt}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul
        className="import-structure-tree"
        role="tree"
        aria-label="بنية التشريع المستخرجة"
      >
        {roots.map(({ type, item }) =>
          type === "node" ? renderNode(item) : renderArticle(item),
        )}
      </ul>
    </section>
  );
}
function ReviewImport({ id, done }: { id: string; done: () => void }) {
  const [action, setAction] = useState("");
  return (
    <button
      className="button"
      onClick={async () => {
        try {
          await apiRequest(`/imports/${id}/review`, {
            body: {
              notes: "تمت مقارنة النص المستخرج بالمصدر في منطقة المراجعة",
            },
          });
          setAction("تم اعتماد مراجعة المصدر.");
          done();
        } catch (e) {
          setAction(e instanceof Error ? e.message : "تعذر الإجراء.");
        }
      }}
    >
      اعتماد مراجعة المصدر {action && <span className="sr-only">{action}</span>}
    </button>
  );
}
function CreateDraft({
  id,
  refs,
  done,
}: {
  id: string;
  refs: Refs;
  done: () => void;
}) {
  const [msg, setMsg] = useState("");
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        try {
          await apiRequest(`/imports/${id}/draft`, {
            body: {
              titleAr: form.get("titleAr"),
              officialNumber: form.get("officialNumber"),
              year: Number(form.get("year")),
              typeId: form.get("typeId"),
              authorityId: form.get("authorityId"),
              effectiveFrom: form.get("effectiveFrom"),
            },
          });
          setMsg("أنشئت المسودة.");
          done();
        } catch (error) {
          setMsg(
            error instanceof Error ? error.message : "تعذر إنشاء المسودة.",
          );
        }
      }}
    >
      <h3>تحويل إلى مسودة</h3>
      <input name="titleAr" required placeholder="العنوان الرسمي" />
      <input name="officialNumber" placeholder="الرقم" />
      <input
        name="year"
        type="number"
        min="1800"
        max="2200"
        required
        placeholder="السنة"
      />
      <select name="typeId" required>
        <option value="">النوع</option>
        {refs.types.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <select name="authorityId" required>
        <option value="">الجهة</option>
        {refs.authorities.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <input name="effectiveFrom" type="date" />
      <button className="button">إنشاء المسودة</button>
      {msg && <span role="status">{msg}</span>}
    </form>
  );
}
