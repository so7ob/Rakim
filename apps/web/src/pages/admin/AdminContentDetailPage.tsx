import { useOperationPolicies } from "../../hooks/use-operation-policies";
import { ContentCorrectionsPanel } from "../../components/admin/ContentCorrectionsPanel";
import {
  LegislationStatus,
  LegalStatusBadge,
} from "../../components/admin/LegislationStatus";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { RecordFormDialog } from "../../components/admin/RecordFormDialog";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import {
  StructureTree,
  structureNodeName,
  type StructureNodeItem,
} from "../../components/admin/StructureTree";
import { ArticleAssignmentDialog } from "../../components/admin/ArticleAssignmentDialog";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { EntityDetails } from "../../components/admin/EntityDetails";
import { AnnexContentView } from "../../components/AnnexContentView";
import { PolicyChecks } from "../../components/admin/PolicyChecks";
import {
  AnnexContentFields,
  type AnnexDetail,
  type AnnexOptions,
} from "../../components/admin/AnnexContentFields";
interface Detail {
  id: string;
  display_code: string | null;
  title_ar: string;
  summary_ar: string | null;
  official_number: string | null;
  year: number;
  status: string;
  effective_from: string | null;
  issue_date: string | null;
  publication_date: string | null;
  repeal_date: string | null;
  legal_status: string;
  is_active: boolean | number;
  verification_level: string;
  typeName?: string;
  versions: Array<{ preambleText: string | null }>;
  type_id: string;
  authority_id: string;
  gazette: {
    issueNumber: string;
    publicationDate: string | null;
    publisher: string | null;
    notes: string | null;
  } | null;
  selectedSubjectIds: string[];
  references: {
    types: Array<{ id: string; name: string }>;
    authorities: Array<{ id: string; name: string }>;
    subjects: Array<{ id: string; name: string }>;
    legislationOptions: Array<{ id: string; name: string }>;
    relationTypes: Array<{ code: string; labelAr: string }>;
  };
  sources: Array<{
    id: string;
    originalName: string;
    extractionStatus: string;
    ocrConfidence: number | null;
    obtainedFrom: string;
    pageCount: number | null;
    mediaType: string;
    sha256: string;
    byteSize: number;
    sourceRole: "EXTRACTION" | "OFFICIAL_PDF" | "SUPPORTING";
  }>;
  structures: StructureNodeItem[];
  annexes: Array<{
    id: string;
    annexType: string;
    annexTypeLabel: string;
    titleAr: string;
    status: string;
    versionCount: number;
    reviewedBy: string | null;
    reviewerName: string | null;
    reviewedAt: string | null;
    workflowRevision: number;
    pendingCorrectionId: string | null;
    actions: AnnexDetail["actions"];
  }>;
  relations: Array<{
    id: string;
    relationType: string;
    targetLegislationId: string;
    targetTitle: string;
    scopeText: string | null;
    effectiveFrom: string | null;
    sourceDocumentId: string | null;
    reviewStatus: string;
    relationTypeLabel: string;
    reviewedBy: string | null;
    reviewerName: string | null;
    reviewedAt: string | null;
    publishedBy: string | null;
    publisherName: string | null;
    publishedAt: string | null;
    workflowRevision: number;
    editFingerprint: string;
    actions: Record<
      "review" | "publish" | "reject" | "return",
      { available: boolean; allowed: boolean; message: string | null }
    >;
  }>;
  articles: Array<{
    id: string;
    currentLabel: string;
    publishedLabel: string;
    sortKey: string;
    structureNodeId: string | null;
    versionNo: number;
    textOriginal?: string;
    textPreview?: string;
    status: string;
    validFrom: string;
  }>;
  events: Array<{
    id: string;
    action: string;
    from_status: string;
    to_status: string;
    actorName: string;
    reason: string;
    created_at: string;
  }>;
  responsibilities: Array<{ duty: string; userName: string }>;
}
export function AdminContentDetailPage() {
  const policies = useOperationPolicies();
  const { id, tab = "general" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const item = useApi<Detail>(
    id
      ? `/admin/legislations/${id}${
          tab === "articles" ? "?articleContent=full" : ""
        }`
      : null,
  );
  const [linkingSource, setLinkingSource] = useState(false);
  const [creatingArticle, setCreatingArticle] = useState(false);
  const sourceOptions = useApi<Array<{ id: string; originalName: string }>>(
    auth.hasPermission("source.view") ? "/admin/source-options" : null,
  );
  const annexOptions = useApi<AnnexOptions>(
    id && auth.hasPermission("legislation.view")
      ? "/admin/annexes/options"
      : null,
  );
  const [msg, setMsg] = useState("");
  const [metadataOpen, setMetadataOpen] = useState(() =>
    Boolean((location.state as { openEdit?: boolean } | null)?.openEdit),
  );
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [selectedStructureId, setSelectedStructureId] = useState<string | null>(
    null,
  );
  const [assignmentNodeId, setAssignmentNodeId] = useState<string | null>(null);
  useEffect(() => {
    const structures = item.data?.structures ?? [];
    if (
      tab === "structure" &&
      structures.length &&
      !structures.some((node) => node.id === selectedStructureId)
    )
      setSelectedStructureId(structures[0]!.id);
  }, [item.data, selectedStructureId, tab]);
  if (item.loading) return <LoadingCards />;
  if (item.error || !item.data)
    return (
      <ErrorPanel
        message={item.error?.message ?? "غير موجود"}
        retry={item.retry}
      />
    );
  const law = item.data;
  const isDraft = ["INBOX", "DRAFT", "IN_REVIEW"].includes(law.status);
  const canEditMetadata =
    (isDraft && auth.hasPermission("legislation.update")) ||
    (!isDraft && auth.hasPermission("legislation.published_metadata.update"));
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setMetadataSaving(true);
    try {
      await apiRequest(`/admin/legislations/${id}`, {
        method: "PATCH",
        body: {
          displayCode: f.get("displayCode"),
          titleAr: f.get("titleAr"),
          summaryAr: f.get("summaryAr"),
          officialNumber: f.get("officialNumber"),
          year: Number(f.get("year")),
          typeId: f.get("typeId"),
          authorityId: f.get("authorityId"),
          effectiveFrom: f.get("effectiveFrom"),
          issueDate: f.get("issueDate"),
          publicationDate: f.get("publicationDate"),
          repealDate: f.get("repealDate"),
          legalStatus: f.get("legalStatus"),
          verificationLevel: f.get("verificationLevel"),
          gazetteIssueNumber: f.get("gazetteIssueNumber"),
          gazettePublicationDate: f.get("gazettePublicationDate"),
          gazettePublisher: f.get("gazettePublisher"),
          gazetteNotes: f.get("gazetteNotes"),
          subjectIds: f.getAll("subjectIds"),
          ...(isDraft ? { preambleText: f.get("preambleText") } : {}),
          reason: f.get("reason"),
        },
      });
      setMsg("حُفظت التغييرات وسُجلت.");
      setMetadataDirty(false);
      setMetadataOpen(false);
      item.retry();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "تعذر الحفظ.");
    } finally {
      setMetadataSaving(false);
    }
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow={`${law.typeName ?? "تشريع"} · ${law.year}`}
        title={law.title_ar}
        description={
          law.summary_ar ?? "إدارة بيانات التشريع ونصه ومصادره ودورة اعتماده."
        }
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "التشريعات", to: "/ar/admin/content" },
          { label: law.title_ar },
        ]}
        status={
          <LegislationStatus
            workflow={law.status}
            legal={law.legal_status}
            active={law.is_active}
          />
        }
        actions={
          tab === "general" && canEditMetadata ? (
            <button
              type="button"
              className="button"
              onClick={() => setMetadataOpen(true)}
            >
              تعديل البيانات
            </button>
          ) : undefined
        }
      />
      <AdminTabs
        label="أقسام التشريع"
        items={[
          { label: "البيانات العامة", to: `/ar/admin/content/${id}/general` },
          {
            label: "النص والمواد",
            to: `/ar/admin/content/${id}/articles`,
            count: law.articles.length,
          },
          {
            label: "البنية",
            to: `/ar/admin/content/${id}/structure`,
            count: law.structures.length,
          },
          {
            label: "الملاحق والجداول",
            to: `/ar/admin/content/${id}/annexes`,
            count: law.annexes.length,
          },
          {
            label: "العلاقات",
            to: `/ar/admin/content/${id}/relations`,
            count: law.relations.length,
          },
          {
            label: "المصادر",
            to: `/ar/admin/content/${id}/sources`,
            count: law.sources.length,
          },
          {
            label: "مسودات التصحيح",
            to: `/ar/admin/content/${id}/corrections`,
          },
          {
            label: "سير العمل",
            to: `/ar/admin/content/${id}/workflow`,
            count: law.events.length,
          },
        ]}
      />
      {msg && (
        <p role="status" className="form-message admin-content-message">
          {msg}
        </p>
      )}
      {tab === "corrections" && (
        <ContentCorrectionsPanel
          lawId={law.id}
          articles={law.articles}
          annexes={law.annexes}
          annexOptions={annexOptions.data}
          sources={law.sources}
          onChange={item.retry}
        />
      )}
      {metadataOpen && canEditMetadata && (
        <AdminDialog
          title="تعديل بيانات التشريع"
          description="تظهر التغييرات في شاشة العرض بعد تأكيد الخادم."
          size="large"
          dirty={metadataDirty}
          onClose={() => setMetadataOpen(false)}
        >
          <form
            className="edit-form"
            onSubmit={save}
            onInput={() => setMetadataDirty(true)}
          >
            {!isDraft && (
              <p className="form-warning">
                هذا تصحيح بيانات وصفية منشورة يسجل قبل/بعد. النص والديباجة
                المنشوران لا يعدلان في مكانهما.
              </p>
            )}
            <label>
              العنوان
              <input name="titleAr" defaultValue={law.title_ar} required />
            </label>
            <label>
              الملخص
              <textarea name="summaryAr" defaultValue={law.summary_ar ?? ""} />
            </label>
            {isDraft && (
              <label>
                الديباجة
                <textarea
                  name="preambleText"
                  defaultValue={law.versions[0]?.preambleText ?? ""}
                />
              </label>
            )}
            <div className="form-columns">
              <label>
                رمز العرض الدائم
                <input
                  name="displayCode"
                  defaultValue={law.display_code ?? ""}
                />
              </label>
              <label>
                الرقم
                <input
                  name="officialNumber"
                  defaultValue={law.official_number ?? ""}
                />
              </label>
              <label>
                السنة
                <input
                  name="year"
                  type="number"
                  defaultValue={law.year}
                  required
                />
              </label>
              <label>
                تاريخ الإصدار
                <input
                  name="issueDate"
                  type="date"
                  defaultValue={law.issue_date?.slice(0, 10) ?? ""}
                />
              </label>
              <label>
                تاريخ النشر
                <input
                  name="publicationDate"
                  type="date"
                  defaultValue={law.publication_date?.slice(0, 10) ?? ""}
                />
              </label>
              <label>
                تاريخ النفاذ
                <input
                  name="effectiveFrom"
                  type="date"
                  defaultValue={law.effective_from?.slice(0, 10) ?? ""}
                />
              </label>
              <label>
                تاريخ الإلغاء
                <input
                  name="repealDate"
                  type="date"
                  defaultValue={law.repeal_date?.slice(0, 10) ?? ""}
                />
              </label>
              <label>
                النوع
                <select name="typeId" defaultValue={law.type_id}>
                  {law.references.types.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الجهة
                <select name="authorityId" defaultValue={law.authority_id}>
                  {law.references.authorities.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الحالة القانونية
                <select name="legalStatus" defaultValue={law.legal_status}>
                  <option value="IN_FORCE">ساري</option>
                  <option value="AMENDED">معدل</option>
                  <option value="PARTIALLY_REPEALED">ملغى جزئيًا</option>
                  <option value="REPEALED">ملغى</option>
                  <option value="SUSPENDED">موقوف</option>
                  <option value="UNKNOWN">غير محدد</option>
                </select>
              </label>
              <label>
                درجة التحقق
                <select
                  name="verificationLevel"
                  defaultValue={law.verification_level}
                >
                  {["A", "B", "C", "D"].map((level) => (
                    <option key={level}>{level}</option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="admin-fieldset">
              <legend>بيانات الجريدة الرسمية</legend>
              <div className="form-columns">
                <label>
                  عدد الجريدة
                  <input
                    name="gazetteIssueNumber"
                    defaultValue={law.gazette?.issueNumber ?? ""}
                  />
                </label>
                <label>
                  تاريخ الجريدة
                  <input
                    name="gazettePublicationDate"
                    type="date"
                    defaultValue={law.gazette?.publicationDate ?? ""}
                  />
                </label>
                <label>
                  الناشر
                  <input
                    name="gazettePublisher"
                    defaultValue={law.gazette?.publisher ?? ""}
                  />
                </label>
              </div>
              <label>
                ملاحظات الجريدة
                <textarea
                  name="gazetteNotes"
                  defaultValue={law.gazette?.notes ?? ""}
                />
              </label>
            </fieldset>
            <fieldset className="admin-fieldset checkbox-grid">
              <legend>الموضوعات والتصنيفات</legend>
              {law.references.subjects.map((subject) => (
                <label key={subject.id}>
                  <input
                    type="checkbox"
                    name="subjectIds"
                    value={subject.id}
                    defaultChecked={law.selectedSubjectIds.includes(subject.id)}
                  />
                  {subject.name}
                </label>
              ))}
            </fieldset>
            <label>
              سبب التعديل
              <input
                name="reason"
                required
                placeholder="سبب واضح يظهر في سجل التدقيق"
              />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setMetadataOpen(false)}
                disabled={metadataSaving}
              >
                إلغاء
              </button>
              <button className="button" disabled={metadataSaving}>
                {metadataSaving ? "جار الحفظ…" : "حفظ التغييرات"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
      <div className="admin-entity-actions">
        <LifecycleActions
          kind="legislations"
          showStatus={false}
          id={law.id}
          label={law.title_ar}
          onDone={(action) => {
            if (action === "delete") navigate("/ar/admin/content");
            else item.retry();
          }}
        />
      </div>
      {tab === "general" && (
        <section className="admin-card">
          <h2>البيانات العامة</h2>
          {!canEditMetadata && (
            <p className="form-warning">
              هذه البيانات متاحة للعرض فقط وفق صلاحيات حسابك وحالة التشريع.
            </p>
          )}
          <EntityDetails
            items={[
              { label: "العنوان", value: law.title_ar, wide: true },
              { label: "الملخص", value: law.summary_ar || "—", wide: true },
              ...(isDraft
                ? [
                    {
                      label: "الديباجة",
                      value: law.versions[0]?.preambleText || "—",
                      wide: true,
                    },
                  ]
                : []),
              { label: "رمز العرض", value: law.display_code || "—" },
              { label: "الرقم", value: law.official_number || "—" },
              { label: "السنة", value: law.year },
              {
                label: "النوع",
                value:
                  law.references.types.find((entry) => entry.id === law.type_id)
                    ?.name ||
                  law.typeName ||
                  "—",
              },
              {
                label: "الجهة",
                value:
                  law.references.authorities.find(
                    (entry) => entry.id === law.authority_id,
                  )?.name || "—",
              },
              {
                label: "الحالة القانونية",
                value: <LegalStatusBadge status={law.legal_status} />,
              },
              { label: "درجة التحقق", value: law.verification_level },
              {
                label: "تاريخ الإصدار",
                value: law.issue_date?.slice(0, 10) || "—",
              },
              {
                label: "تاريخ النشر",
                value: law.publication_date?.slice(0, 10) || "—",
              },
              {
                label: "تاريخ النفاذ",
                value: law.effective_from?.slice(0, 10) || "—",
              },
              {
                label: "تاريخ الإلغاء",
                value: law.repeal_date?.slice(0, 10) || "—",
              },
              { label: "عدد الجريدة", value: law.gazette?.issueNumber || "—" },
              {
                label: "تاريخ الجريدة",
                value: law.gazette?.publicationDate || "—",
              },
              { label: "ناشر الجريدة", value: law.gazette?.publisher || "—" },
              {
                label: "ملاحظات الجريدة",
                value: law.gazette?.notes || "—",
                wide: true,
              },
              {
                label: "الموضوعات والتصنيفات",
                value:
                  law.references.subjects
                    .filter((subject) =>
                      law.selectedSubjectIds.includes(subject.id),
                    )
                    .map((subject) => subject.name)
                    .join("، ") || "—",
                wide: true,
              },
            ]}
          />
        </section>
      )}
      {tab === "articles" &&
        (["INBOX", "DRAFT"].includes(law.status) ||
          (["IN_REVIEW", "APPROVED_FOR_PUBLISHING"].includes(law.status) &&
            policies.allows("CREATE_ARTICLE_REVIEWED"))) &&
        auth.hasPermission("article.create") && (
          <button className="button" onClick={() => setCreatingArticle(true)}>
            + إضافة مادة
          </button>
        )}
      {creatingArticle && (
        <RecordFormDialog
          title="إضافة مادة إلى المسودة"
          path={`/admin/legislations/${id}/articles`}
          fields={[
            {
              name: "currentLabel",
              label: "رقم المادة",
              required: true,
              maxLength: 120,
            },
            {
              name: "sortKey",
              label: "مفتاح الترتيب",
              required: true,
              maxLength: 120,
            },
            {
              name: "structureNodeId",
              label: "الموقع في الهيكل",
              options: law.structures.map((n) => ({
                value: n.id,
                label: n.titleAr,
              })),
            },
            {
              name: "sourceDocumentId",
              label: "المصدر",
              required: true,
              options: (sourceOptions.data ?? law.sources).map((s) => ({
                value: s.id,
                label: s.originalName,
              })),
            },
            {
              name: "validFrom",
              label: "بداية النفاذ",
              type: "date",
              required: true,
            },
            {
              name: "text",
              label: "نص المادة",
              type: "textarea",
              required: true,
            },
            { name: "reason", label: "سبب الإضافة", required: true },
          ]}
          onClose={() => setCreatingArticle(false)}
          onDone={() => {
            setCreatingArticle(false);
            item.retry();
          }}
        />
      )}
      {tab === "articles" && law.articles.length > 0 && (
        <section className="admin-card">
          <h2>مواد النسخة الحالية</h2>
          <p>
            تُحفظ تعديلات النص المنشور كمسودات تصحيح عند وجود استثناء من
            السياسة، وتُنشر من تبويب مسودات التصحيح.
          </p>
          <div className="draft-articles">
            {law.articles.map((article) => (
              <ArticleEditor
                key={article.id}
                article={article}
                nodes={law.structures}
                editable={
                  auth.hasPermission("article.update") &&
                  (article.status === "DRAFT" ||
                    policies.allows("EDIT_ARTICLE_HISTORY"))
                }
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            ))}
          </div>
        </section>
      )}
      {tab === "articles" && law.articles.length === 0 && (
        <AdminEmptyState
          title="لا توجد مواد"
          description="لم تُضف مواد قانونية إلى النسخة الحالية بعد."
        />
      )}
      {tab === "structure" && (
        <div className="structure-management-layout">
          <section className="admin-card structure-tree-panel">
            <header>
              <div>
                <h2>البنية القانونية</h2>
                <p>الأعداد المعروضة للمواد التابعة مباشرة لكل عنصر فقط.</p>
              </div>
            </header>
            {law.structures.length ? (
              <StructureTree
                nodes={law.structures}
                selectedId={selectedStructureId}
                onSelect={setSelectedStructureId}
              />
            ) : (
              <p>لا توجد بنية هرمية مسجلة لهذا التشريع.</p>
            )}
            {auth.hasPermission("structure.create") && (
              <NewStructureEditor
                id={law.id}
                nodes={law.structures}
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            )}
          </section>
          {selectedStructureId &&
            (() => {
              const node = law.structures.find(
                (candidate) => candidate.id === selectedStructureId,
              );
              if (!node) return null;
              const directArticles = law.articles.filter(
                (article) => article.structureNodeId === node.id,
              );
              return (
                <section className="admin-card structure-node-details">
                  <header>
                    <div>
                      <span className="eyebrow dark">العنصر المحدد</span>
                      <h2>{structureNodeName(node)}</h2>
                      <p>{directArticles.length} مادة تابعة مباشرة.</p>
                    </div>
                    {auth.hasPermission("article.update") && isDraft && (
                      <button
                        type="button"
                        className="button"
                        onClick={() => setAssignmentNodeId(node.id)}
                      >
                        ربط المواد
                      </button>
                    )}
                  </header>
                  {auth.hasPermission("structure.update") && (
                    <StructureEditor
                      key={node.id}
                      node={node}
                      nodes={law.structures}
                      editable
                      done={(message) => {
                        setMsg(message);
                        item.retry();
                      }}
                    />
                  )}
                  <div className="direct-article-list">
                    <h3>المواد التابعة مباشرة</h3>
                    {directArticles.length ? (
                      <ul>
                        {directArticles.map((article) => (
                          <li key={article.id}>
                            <strong>المادة {article.currentLabel}</strong>
                            <span>
                              {article.textPreview ?? "دون معاينة نصية"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty-state">
                        لا توجد مواد مرتبطة مباشرة بهذا العنصر.
                      </p>
                    )}
                  </div>
                </section>
              );
            })()}
        </div>
      )}
      {assignmentNodeId &&
        (() => {
          const node = law.structures.find(
            (candidate) => candidate.id === assignmentNodeId,
          );
          return node ? (
            <ArticleAssignmentDialog
              legislationId={law.id}
              node={node}
              onClose={() => setAssignmentNodeId(null)}
              onSuccess={(result) => {
                setAssignmentNodeId(null);
                setMsg(
                  `حُفظت ${result.summary.changedCount} تغييرات: ${result.summary.assignedCount} ربط، ${result.summary.movedCount} نقل، ${result.summary.unassignedCount} فك ربط.`,
                );
                item.retry();
              }}
            />
          ) : null;
        })()}
      {tab === "annexes" && (
        <section className="admin-card">
          <h2>اللوائح والجداول والملاحق</h2>
          <p>
            اختر النوع وطريقة المحتوى المناسبة؛ تبقى النسخ التاريخية محفوظة.
          </p>
          {annexOptions.loading && <LoadingCards />}
          {annexOptions.error && (
            <ErrorPanel
              message={annexOptions.error.message}
              retry={annexOptions.retry}
            />
          )}
          <div className="draft-articles">
            {law.annexes.length === 0 &&
              !auth.hasPermission("annex.update") && (
                <p>لا توجد ملاحق أو جداول مسجلة.</p>
              )}
            {annexOptions.data &&
              law.annexes.map((annex) => (
                <AnnexEditor
                  key={annex.id}
                  annex={annex}
                  options={annexOptions.data!}
                  sources={law.sources}
                  legislationId={law.id}
                  editable={
                    auth.hasPermission("annex.update") &&
                    (["DRAFT", "REVIEWED", "PUBLISHED"].includes(
                      annex.status,
                    ) ||
                      (annex.status === "REPLACED" &&
                        auth.hasPermission("annex.replace")) ||
                      (annex.status === "REPEALED" &&
                        auth.hasPermission("annex.repeal")))
                  }
                  canReplace={auth.hasPermission("annex.replace")}
                  canRepeal={auth.hasPermission("annex.repeal")}
                  done={(message) => {
                    setMsg(message);
                    item.retry();
                  }}
                />
              ))}
            {annexOptions.data && auth.hasPermission("annex.create") && (
              <NewAnnexEditor
                id={law.id}
                sources={law.sources}
                options={annexOptions.data!}
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            )}
          </div>
        </section>
      )}
      {tab === "relations" && (
        <section className="admin-card">
          <h2>العلاقات القانونية</h2>
          <div className="draft-articles">
            {law.relations.length === 0 &&
              !auth.hasPermission("relation.update") && (
                <p>لا توجد علاقات قانونية مسجلة.</p>
              )}
            {law.relations.map((relation) => (
              <RelationEditor
                key={relation.id}
                relation={relation}
                options={law.references.legislationOptions}
                relationTypes={law.references.relationTypes}
                sources={law.sources}
                editable={
                  auth.hasPermission("relation.update") &&
                  relation.reviewStatus === "UNREVIEWED"
                }
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            ))}
            {auth.hasPermission("relation.create") && (
              <NewRelationEditor
                id={law.id}
                options={law.references.legislationOptions}
                relationTypes={law.references.relationTypes}
                sources={law.sources}
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            )}
          </div>
        </section>
      )}
      {tab === "workflow" && (
        <section className="admin-card">
          <h2>الإجراء التالي</h2>
          <WorkflowActions
            status={law.status}
            draftArticleCount={
              law.articles.filter((article) => article.status === "DRAFT")
                .length
            }
            permissions={auth.user?.permissions ?? []}
            id={law.id}
            done={(result) => {
              item.retry();
              setMsg(
                result.to === "PUBLISHED"
                  ? `تم نشر التشريع و${result.publishedArticleCount} نسخة مادة معًا.`
                  : "تم انتقال الحالة بنجاح.",
              );
            }}
            setMessage={setMsg}
          />
        </section>
      )}
      {tab === "sources" && (
        <div className="admin-entity-actions">
          {auth.hasPermission("source.upload") && (
            <Link className="button secondary" to="/ar/admin/imports/upload">
              رفع مصدر أو مرفق جديد
            </Link>
          )}
          {auth.hasPermission("source.update") &&
            ["INBOX", "DRAFT"].includes(law.status) && (
              <button className="button" onClick={() => setLinkingSource(true)}>
                ربط مصدر أو تعديل دوره
              </button>
            )}
        </div>
      )}
      {linkingSource && (
        <RecordFormDialog
          title="ربط مصدر بالتشريع"
          path={`/admin/legislations/${id}/sources`}
          fields={[
            {
              name: "sourceDocumentId",
              label: "المصدر",
              required: true,
              options: (sourceOptions.data ?? law.sources).map((s) => ({
                value: s.id,
                label: s.originalName,
              })),
            },
            {
              name: "sourceRole",
              label: "دور المصدر",
              required: true,
              options: [
                { value: "EXTRACTION", label: "مصدر النص" },
                { value: "OFFICIAL_PDF", label: "الوثيقة الرسمية PDF" },
                { value: "SUPPORTING", label: "مرفق داعم" },
              ],
            },
            { name: "reason", label: "سبب الربط", required: true },
          ]}
          onClose={() => setLinkingSource(false)}
          onDone={() => {
            setLinkingSource(false);
            item.retry();
          }}
        />
      )}
      {tab === "sources" && (
        <div className="admin-grid">
          <section className="admin-card">
            <h2>المصادر</h2>
            {law.sources.length === 0 && (
              <p>لا توجد وثائق مصدر مرتبطة بهذا التشريع.</p>
            )}
            {law.sources.map((source) => (
              <SourceEditor
                legislationId={law.id}
                key={source.id}
                source={source}
                editable={auth.hasPermission("source.update")}
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            ))}
          </section>
        </div>
      )}
      {tab === "workflow" && (
        <div className="admin-grid">
          <section className="admin-card">
            <h2>فصل المسؤوليات</h2>
            {law.responsibilities.length === 0 && (
              <p>لا توجد مسؤوليات مسجلة على هذا التشريع.</p>
            )}
            {law.responsibilities.map((r, i) => (
              <p key={`${r.duty}-${i}`}>
                {r.duty}: {r.userName}
              </p>
            ))}
          </section>
          <section className="admin-card wide">
            <h2>سجل سير العمل</h2>
            {law.events.length === 0 && <p>لم تسجل انتقالات لسير العمل بعد.</p>}
            {law.events.map((event) => (
              <article className="timeline-row" key={event.id}>
                <StatusBadge status={event.to_status} />
                <div>
                  <strong>{event.actorName}</strong>
                  <p>{event.reason}</p>
                </div>
                <time>
                  {new Date(event.created_at).toLocaleString("ar-YE")}
                </time>
              </article>
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="state-panel">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

function structurePath(node: StructureNodeItem, nodes: StructureNodeItem[]) {
  const path: string[] = [];
  const visited = new Set<string>();
  let current: StructureNodeItem | undefined = node;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(structureNodeName(current));
    current = nodes.find((candidate) => candidate.id === current?.parentId);
  }
  return path.join(" / ");
}

function ArticleEditor({
  article,
  nodes,
  editable,
  done,
}: {
  article: Detail["articles"][number];
  nodes: Detail["structures"];
  editable: boolean;
  done: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const structure = nodes.find((node) => node.id === article.structureNodeId);
  return (
    <article className="admin-list-card">
      <header>
        <div>
          <h3>المادة {article.currentLabel}</h3>
          <p>
            {structure ? structurePath(structure, nodes) : "دون موقع في البنية"}
          </p>
        </div>
        <StatusBadge status={article.status} />
      </header>
      <EntityDetails
        items={[
          { label: "الرقم المنشور", value: article.publishedLabel },
          { label: "النسخة", value: article.versionNo },
          { label: "مفتاح الترتيب", value: article.sortKey },
          { label: "بداية النفاذ", value: article.validFrom },
          {
            label: "الموقع في البنية",
            value: structure ? structurePath(structure, nodes) : "غير مرتبطة",
          },
          {
            label: "النص",
            value: article.textOriginal ?? article.textPreview ?? "—",
            wide: true,
          },
        ]}
      />
      <div className="admin-entity-actions">
        <LifecycleActions
          kind="articles"
          id={article.id}
          label={article.currentLabel}
          onDone={() => done("حُدّثت حالة السجل.")}
        />
      </div>
      {editable && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing(true)}
          >
            تعديل المادة
          </button>
        </div>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل المادة ${article.currentLabel}`}
          description="محرر واسع للنص القانوني وبيانات موضع المادة."
          size="large"
          dirty={dirty}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onInput={() => setDirty(true)}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setSaving(true);
              setError("");
              try {
                const result = await apiRequest<{ correctionId?: string }>(
                  `/admin/articles/${article.id}/metadata`,
                  {
                    method: "PATCH",
                    body: {
                      currentLabel: form.get("currentLabel"),
                      publishedLabel: form.get("publishedLabel"),
                      sortKey: form.get("sortKey"),
                      structureNodeId: form.get("structureNodeId") || undefined,
                      validFrom: form.get("validFrom"),
                      text: form.get("text"),
                      reason: form.get("reason"),
                    },
                  },
                );
                setDirty(false);
                setEditing(false);
                done(
                  result.correctionId
                    ? "حُفظت مسودة التصحيح؛ اعتمدها وانشرها من تبويب مسودات التصحيح."
                    : `حُفظ نص المادة ${article.currentLabel}.`,
                );
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر حفظ المادة.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                رقم/وسم المادة الحالي
                <input
                  name="currentLabel"
                  defaultValue={article.currentLabel}
                  required
                />
              </label>
              <label>
                الرقم كما نُشر
                <input
                  name="publishedLabel"
                  defaultValue={article.publishedLabel}
                  required
                />
              </label>
              <label>
                مفتاح الترتيب
                <input name="sortKey" defaultValue={article.sortKey} required />
              </label>
              <label>
                الباب أو الفصل
                <select
                  name="structureNodeId"
                  defaultValue={article.structureNodeId ?? ""}
                >
                  <option value="">بدون عقدة</option>
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.titleAr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                بداية نفاذ النسخة
                <input
                  name="validFrom"
                  type="date"
                  defaultValue={article.validFrom}
                  required
                />
              </label>
            </div>
            <label>
              النص
              <textarea
                name="text"
                defaultValue={article.textOriginal ?? ""}
                required
                rows={7}
              />
            </label>
            <label>
              سبب التعديل
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الحفظ…" : "حفظ المادة"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </article>
  );
}

function StructureEditor({
  node,
  nodes,
  editable,
  done,
}: {
  node: Detail["structures"][number];
  nodes: Detail["structures"];
  editable: boolean;
  done: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const parent = nodes.find((entry) => entry.id === node.parentId);
  return (
    <div>
      <EntityDetails
        items={[
          { label: "العنوان", value: node.titleAr },
          { label: "النوع", value: node.nodeType },
          { label: "الوسم", value: node.labelAr || "—" },
          { label: "مفتاح الترتيب", value: node.sortKey },
          {
            label: "العنصر الأب",
            value: parent ? structureNodeName(parent) : "بلا أب",
          },
          { label: "عدد المواد المباشرة", value: node.directArticleCount },
        ]}
      />
      <div className="admin-entity-actions">
        <LifecycleActions
          kind="structure"
          id={node.id}
          label={node.titleAr}
          onDone={() => done("حُدّثت حالة السجل.")}
        />
      </div>
      {editable && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing(true)}
          >
            تعديل العنصر
          </button>
        </div>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل ${node.titleAr}`}
          dirty={dirty}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onInput={() => setDirty(true)}
            onSubmit={async (event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/structure/${node.id}`, {
                  method: "PATCH",
                  body: {
                    nodeType: f.get("nodeType"),
                    parentId: f.get("parentId"),
                    labelAr: f.get("labelAr"),
                    titleAr: f.get("titleAr"),
                    sortKey: f.get("sortKey"),
                    reason: f.get("reason"),
                  },
                });
                setDirty(false);
                setEditing(false);
                done("حُفظ عنصر الهيكل وسُجل التعديل.");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر الحفظ.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                النوع
                <select name="nodeType" defaultValue={node.nodeType}>
                  {[
                    "PREAMBLE",
                    "BOOK",
                    "PART",
                    "TITLE",
                    "CHAPTER",
                    "SECTION",
                    "SUBSECTION",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                العنوان
                <input name="titleAr" defaultValue={node.titleAr} required />
              </label>
              <label>
                الوسم
                <input name="labelAr" defaultValue={node.labelAr ?? ""} />
              </label>
              <label>
                مفتاح الترتيب
                <input name="sortKey" defaultValue={node.sortKey} required />
              </label>
              <label>
                العنصر الأب
                <select name="parentId" defaultValue={node.parentId ?? ""}>
                  <option value="">بلا أب</option>
                  {nodes
                    .filter((x) => x.id !== node.id)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.titleAr}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              سبب التعديل
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الحفظ…" : "حفظ الهيكل"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </div>
  );
}

function NewStructureEditor({
  id,
  nodes,
  done,
}: {
  id: string;
  nodes: Detail["structures"];
  done: (x: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="admin-entity-actions">
      <button
        type="button"
        className="button"
        onClick={() => setCreating(true)}
      >
        + إضافة عنصر بنية
      </button>
      {creating && (
        <AdminDialog
          title="إضافة باب أو فصل أو قسم"
          onClose={() => setCreating(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const f = new FormData(formElement);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/legislations/${id}/structure`, {
                  body: {
                    nodeType: f.get("nodeType"),
                    parentId: f.get("parentId"),
                    labelAr: f.get("labelAr"),
                    titleAr: f.get("titleAr"),
                    sortKey: f.get("sortKey"),
                    reason: f.get("reason"),
                  },
                });
                done("أضيف عنصر الهيكل.");
                setCreating(false);
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذرت الإضافة.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                النوع
                <select name="nodeType">
                  {[
                    "BOOK",
                    "PART",
                    "TITLE",
                    "CHAPTER",
                    "SECTION",
                    "SUBSECTION",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                العنوان
                <input name="titleAr" required />
              </label>
              <label>
                الوسم
                <input name="labelAr" />
              </label>
              <label>
                الترتيب
                <input name="sortKey" required placeholder="010.020" />
              </label>
              <label>
                الأب
                <select name="parentId">
                  <option value="">بلا أب</option>
                  {nodes.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.titleAr}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              سبب الإضافة
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الإضافة…" : "إضافة"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </div>
  );
}

function AnnexEditor({
  annex,
  options,
  sources,
  legislationId,
  editable,
  canReplace,
  canRepeal,
  done,
}: {
  annex: Detail["annexes"][number];
  options: AnnexOptions;
  sources: Detail["sources"];
  legislationId: string;
  editable: boolean;
  canReplace: boolean;
  canRepeal: boolean;
  done: (message: string) => void;
}) {
  const [viewing, setViewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [transitioning, setTransitioning] = useState<
    "review" | "publish" | "return" | null
  >(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const detail = useApi<AnnexDetail>(`/admin/annexes/${annex.id}`);
  const statusLabel =
    annex.status === "REVIEWED" ? "مراجع وجاهز للنشر" : undefined;
  const actionLabels = {
    review: "اعتماد المراجعة",
    publish: "نشر",
    return: "إعادة إلى المسودة",
  } as const;
  return (
    <article className="admin-list-card">
      <header>
        <div>
          <h3>{annex.titleAr}</h3>
          <p>{annex.versionCount} إصدار محفوظ</p>
        </div>
        <StatusBadge status={annex.status} label={statusLabel} />
      </header>
      <EntityDetails
        items={[
          { label: "النوع", value: annex.annexTypeLabel },
          {
            label: "الحالة",
            value: <StatusBadge status={annex.status} label={statusLabel} />,
          },
          ...(annex.reviewerName
            ? [
                { label: "راجع المحتوى", value: annex.reviewerName },
                {
                  label: "وقت المراجعة",
                  value: new Date(annex.reviewedAt!).toLocaleString("ar-YE"),
                },
              ]
            : []),
        ]}
      />
      <div className="admin-entity-actions">
        <button
          type="button"
          className="button secondary"
          onClick={() => setViewing(true)}
          disabled={detail.loading || Boolean(detail.error)}
        >
          عرض
        </button>
        {detail.data &&
          (["review", "publish", "return"] as const).map((action) => {
            const decision = detail.data!.actions[action];
            return decision.available ? (
              <button
                key={action}
                type="button"
                className={action === "publish" ? "button" : "button secondary"}
                disabled={!decision.allowed}
                title={decision.message ?? undefined}
                onClick={() => {
                  setTransitionReason("");
                  setTransitioning(action);
                }}
              >
                {actionLabels[action]}
              </button>
            ) : null;
          })}
        <LifecycleActions
          kind="annexes"
          id={annex.id}
          label={annex.titleAr}
          onDone={() => done("حُدّثت حالة السجل.")}
        />
      </div>
      {detail.data?.actions.publish.available && (
        <PolicyChecks checks={detail.data.actions.publish.policyChecks} />
      )}
      {annex.pendingCorrectionId && (
        <p>
          لهذا الملحق مسودة تصحيح قائمة.{" "}
          <Link to={`/ar/admin/content/${legislationId}/corrections`}>
            عرض مسودة التصحيح
          </Link>
        </p>
      )}
      {editable && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing(true)}
          >
            تعديل الملحق
          </button>
        </div>
      )}
      {viewing && detail.data && (
        <AdminDialog
          title={`عرض ${detail.data.titleAr}`}
          description="معاينة النسخة المحفوظة داخل الإدارة."
          size="large"
          onClose={() => setViewing(false)}
        >
          <AnnexAdminPreview detail={detail.data} />
        </AdminDialog>
      )}
      {transitioning && detail.data && (
        <AdminDialog
          title={actionLabels[transitioning]}
          description={`سيُطبّق الإجراء على «${detail.data.titleAr}» بعد إعادة التحقق من الحالة والسياسات.`}
          size="large"
          onClose={() => setTransitioning(null)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/annexes/${annex.id}/transition`, {
                  body: {
                    action: transitioning,
                    editFingerprint: detail.data!.editFingerprint,
                    reason: transitionReason,
                  },
                });
                setTransitioning(null);
                detail.retry();
                done(`تم تنفيذ «${actionLabels[transitioning]}» وتسجيله.`);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "تعذر تنفيذ الإجراء.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <AnnexAdminPreview detail={detail.data} compact />
            {detail.data.actions[transitioning].policyChecks.length > 0 && (
              <PolicyChecks
                checks={detail.data.actions[transitioning].policyChecks}
              />
            )}
            <label>
              سبب الإجراء
              <input
                value={transitionReason}
                onChange={(event) => setTransitionReason(event.target.value)}
                minLength={3}
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setTransitioning(null)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار التنفيذ…" : actionLabels[transitioning]}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل ${annex.titleAr}`}
          onClose={() => setEditing(false)}
        >
          {detail.loading ? (
            <LoadingCards />
          ) : detail.error || !detail.data ? (
            <ErrorPanel
              message={detail.error?.message ?? "تعذر تحميل الملحق."}
              retry={detail.retry}
            />
          ) : (
            <form
              className="edit-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const f = new FormData(event.currentTarget);
                const contentFormat = String(f.get("contentFormat"));
                const contentChanged = Boolean(
                  detail.data &&
                  (String(f.get("titleAr")) !== detail.data.titleAr ||
                    String(f.get("annexType")) !== detail.data.annexType ||
                    contentFormat !== detail.data.version.contentFormat ||
                    String(f.get("sourceDocumentId")) !==
                      detail.data.version.sourceDocumentId ||
                    String(f.get("validFrom")) !==
                      detail.data.version.validFrom ||
                    (contentFormat === "TEXT" &&
                      String(f.get("textContent")) !==
                        (detail.data.version.textContent ?? "")) ||
                    (contentFormat === "STRUCTURED_TABLE" &&
                      String(f.get("structuredTableJson")) !==
                        (detail.data.version.structuredTableJson ?? ""))),
                );
                if (
                  detail.data?.status === "REVIEWED" &&
                  contentChanged &&
                  !window.confirm(
                    "سيعيد تعديل المحتوى هذا الملحق إلى المسودة ويلغي اعتماد المراجعة. هل تريد المتابعة؟",
                  )
                )
                  return;
                setSaving(true);
                setError("");
                try {
                  const result = await apiRequest<{ correctionId?: string }>(
                    `/admin/annexes/${annex.id}`,
                    {
                      method: "PATCH",
                      body: {
                        annexType: f.get("annexType"),
                        titleAr: f.get("titleAr"),
                        contentFormat,
                        ...(contentFormat === "TEXT"
                          ? { textContent: f.get("textContent") }
                          : {}),
                        ...(contentFormat === "STRUCTURED_TABLE"
                          ? {
                              structuredTableJson: f.get("structuredTableJson"),
                            }
                          : {}),
                        sourceDocumentId: f.get("sourceDocumentId"),
                        ...(f.get("validFrom")
                          ? { validFrom: f.get("validFrom") }
                          : {}),
                        ...(f.get("effectiveFrom")
                          ? { effectiveFrom: f.get("effectiveFrom") }
                          : {}),
                        ...(f.get("status") ? { status: f.get("status") } : {}),
                        editFingerprint: f.get("editFingerprint"),
                        reason: f.get("reason"),
                      },
                    },
                  );
                  setEditing(false);
                  done(
                    result.correctionId
                      ? "حُفظت مسودة تصحيح الملحق؛ تابعها من تبويب مسودات التصحيح."
                      : "حُفظ محتوى الملحق وبياناته.",
                  );
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "تعذر الحفظ.",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            >
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <AnnexContentFields
                options={options}
                sources={sources}
                legislationId={legislationId}
                initial={detail.data}
                canReplace={canReplace}
                canRepeal={canRepeal}
              />
              <label>
                سبب التعديل
                <input name="reason" required />
              </label>
              <div className="admin-entity-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  إلغاء
                </button>
                <button className="button" disabled={saving}>
                  {saving ? "جار الحفظ…" : "حفظ الملحق"}
                </button>
              </div>
            </form>
          )}
        </AdminDialog>
      )}
    </article>
  );
}

function AnnexAdminPreview({
  detail,
  compact = false,
}: {
  detail: AnnexDetail;
  compact?: boolean;
}) {
  const version = detail.version;
  const contentFile = version.contentFile ?? version.source;
  return (
    <div className="annex-admin-preview">
      <EntityDetails
        items={[
          { label: "النوع", value: detail.annexTypeLabel },
          {
            label: "الحالة",
            value: (
              <StatusBadge
                status={detail.status}
                label={
                  detail.status === "REVIEWED" ? "مراجع وجاهز للنشر" : undefined
                }
              />
            ),
          },
          { label: "تاريخ النفاذ", value: version.validFrom },
          { label: "المصدر", value: version.source.originalName },
        ]}
      />
      <AnnexContentView
        contentFormat={version.contentFormat}
        textContent={version.textContent}
        structuredTable={version.structuredTableJson}
        fileUrl={`/api/v1/admin/annexes/${detail.id}/file?version=${encodeURIComponent(version.versionId)}`}
        fileName={contentFile.originalName}
        mediaType={contentFile.mediaType}
        pageCount={contentFile.pageCount}
        title={detail.titleAr}
        compact={compact}
      />
      <p>
        المصدر الساند:{" "}
        <a
          href={`/api/v1/admin/annexes/${detail.id}/file?version=${encodeURIComponent(version.versionId)}&role=source`}
          target="_blank"
          rel="noreferrer"
        >
          {version.source.originalName}
        </a>
      </p>
      {version.attachment && (
        <p>
          المرفق المستقل:{" "}
          <a
            href={`/api/v1/admin/annexes/${detail.id}/file?version=${encodeURIComponent(version.versionId)}&role=attachment`}
            target="_blank"
            rel="noreferrer"
          >
            {version.attachment.originalName}
          </a>
        </p>
      )}
    </div>
  );
}

function NewAnnexEditor({
  id,
  sources,
  options,
  done,
}: {
  id: string;
  sources: Detail["sources"];
  options: AnnexOptions;
  done: (x: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!sources.length) return <p>اربط مصدرًا بالتشريع قبل إضافة ملحق.</p>;
  return (
    <div className="admin-entity-actions">
      <button
        type="button"
        className="button"
        onClick={() => setCreating(true)}
      >
        + إضافة ملحق
      </button>
      {creating && (
        <AdminDialog
          title="إضافة لائحة أو جدول أو ملحق"
          size="large"
          onClose={() => setCreating(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const f = new FormData(formElement);
              const contentFormat = String(f.get("contentFormat"));
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/legislations/${id}/annexes`, {
                  body: {
                    annexType: f.get("annexType"),
                    titleAr: f.get("titleAr"),
                    contentFormat,
                    validFrom: f.get("validFrom"),
                    sourceDocumentId: f.get("sourceDocumentId"),
                    ...(contentFormat === "TEXT"
                      ? { textContent: f.get("textContent") }
                      : {}),
                    ...(contentFormat === "STRUCTURED_TABLE"
                      ? {
                          structuredTableJson: f.get("structuredTableJson"),
                        }
                      : {}),
                    reason: f.get("reason"),
                  },
                });
                done("أضيف إصدار الملحق الأول.");
                setCreating(false);
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذرت الإضافة.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <AnnexContentFields
              options={options}
              sources={sources}
              legislationId={id}
            />
            <label>
              سبب الإضافة
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الإضافة…" : "إضافة الملحق"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </div>
  );
}

function RelationEditor({
  relation,
  options,
  relationTypes,
  sources,
  editable,
  done,
}: {
  relation: Detail["relations"][number];
  options: Detail["references"]["legislationOptions"];
  relationTypes: Detail["references"]["relationTypes"];
  sources: Detail["sources"];
  editable: boolean;
  done: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [transitioning, setTransitioning] = useState<
    "review" | "publish" | "reject" | "return" | null
  >(null);
  const [transitionReason, setTransitionReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const actionLabels = {
    review: "اعتماد المراجعة",
    publish: "نشر",
    reject: "رفض",
    return: "إعادة إلى المسودة",
  } as const;
  const statusLabel = {
    UNREVIEWED: "مسودة",
    REVIEWED: "مراجعة مكتملة وجاهزة للنشر",
    REJECTED: "مرفوضة",
    PUBLISHED: "منشورة",
  }[relation.reviewStatus];
  const blockedAction = Object.values(relation.actions).find(
    (action) => action.available && !action.allowed && action.message,
  );
  return (
    <article className="admin-list-card">
      <header>
        <div>
          <h3>{relation.targetTitle}</h3>
          <p>{relation.relationTypeLabel}</p>
        </div>
        <StatusBadge status={relation.reviewStatus} label={statusLabel} />
      </header>
      <EntityDetails
        items={[
          { label: "النطاق أو المادة", value: relation.scopeText || "—" },
          { label: "تاريخ الأثر", value: relation.effectiveFrom || "—" },
          {
            label: "مصدر الإثبات",
            value:
              sources.find((source) => source.id === relation.sourceDocumentId)
                ?.originalName || "—",
            wide: true,
          },
          ...(relation.reviewerName
            ? [
                { label: "راجع العلاقة", value: relation.reviewerName },
                {
                  label: "وقت المراجعة",
                  value: new Date(relation.reviewedAt!).toLocaleString("ar-YE"),
                },
              ]
            : []),
          ...(relation.publisherName
            ? [
                { label: "نشر العلاقة", value: relation.publisherName },
                {
                  label: "وقت النشر",
                  value: new Date(relation.publishedAt!).toLocaleString(
                    "ar-YE",
                  ),
                },
              ]
            : []),
        ]}
      />
      <div className="admin-entity-actions">
        {(["review", "publish", "reject", "return"] as const).map((action) => {
          const decision = relation.actions[action];
          return decision.available ? (
            <button
              key={action}
              type="button"
              className={action === "publish" ? "button" : "button secondary"}
              disabled={!decision.allowed}
              title={decision.message ?? undefined}
              onClick={() => {
                setError("");
                setTransitionReason("");
                setTransitioning(action);
              }}
            >
              {actionLabels[action]}
            </button>
          ) : null;
        })}
        <LifecycleActions
          kind="relations"
          id={relation.id}
          label={relation.targetTitle}
          onDone={() => done("حُدّثت حالة السجل.")}
        />
      </div>
      {blockedAction?.message && (
        <p className="field-hint">{blockedAction.message}</p>
      )}
      {editable && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing(true)}
          >
            تعديل العلاقة
          </button>
        </div>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل العلاقة مع ${relation.targetTitle}`}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/relations/${relation.id}`, {
                  method: "PATCH",
                  body: {
                    relationType: f.get("relationType"),
                    targetLegislationId: f.get("targetLegislationId"),
                    scopeText: f.get("scopeText"),
                    effectiveFrom: f.get("effectiveFrom"),
                    sourceDocumentId: f.get("sourceDocumentId") || undefined,
                    editFingerprint: relation.editFingerprint,
                    reason: f.get("reason"),
                  },
                });
                setEditing(false);
                done("حُفظت العلاقة القانونية.");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر الحفظ.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                التشريع المقابل
                <select
                  name="targetLegislationId"
                  defaultValue={relation.targetLegislationId}
                >
                  {options.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                نوع العلاقة
                <select
                  name="relationType"
                  defaultValue={relation.relationType}
                >
                  {relationTypes.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.labelAr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ الأثر
                <input
                  name="effectiveFrom"
                  type="date"
                  defaultValue={relation.effectiveFrom ?? ""}
                />
              </label>
              <label>
                مصدر الإثبات
                <select
                  name="sourceDocumentId"
                  defaultValue={relation.sourceDocumentId ?? ""}
                >
                  <option value="">بدون مصدر (للتشابه الموضوعي فقط)</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.originalName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              النطاق أو المادة
              <input name="scopeText" defaultValue={relation.scopeText ?? ""} />
            </label>
            <label>
              سبب التعديل
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الحفظ…" : "حفظ العلاقة"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
      {transitioning && (
        <AdminDialog
          title={actionLabels[transitioning]}
          description={
            transitioning === "return" && relation.reviewStatus === "PUBLISHED"
              ? "ستُسحب العلاقة من العرض العام والبحث حتى مراجعتها ونشرها مجددًا."
              : `سيُطبّق الإجراء على العلاقة مع «${relation.targetTitle}».`
          }
          onClose={() => setTransitioning(null)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/relations/${relation.id}/transition`, {
                  body: {
                    action: transitioning,
                    editFingerprint: relation.editFingerprint,
                    reason: transitionReason,
                  },
                });
                const completedAction = actionLabels[transitioning];
                setTransitioning(null);
                done(`تم تنفيذ «${completedAction}» وتسجيله.`);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "تعذر تنفيذ الإجراء.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <EntityDetails
              items={[
                { label: "التشريع المقابل", value: relation.targetTitle },
                { label: "نوع العلاقة", value: relation.relationTypeLabel },
                { label: "النطاق أو المادة", value: relation.scopeText || "—" },
                { label: "تاريخ الأثر", value: relation.effectiveFrom || "—" },
              ]}
            />
            <label>
              سبب الإجراء
              <input
                value={transitionReason}
                onChange={(event) => setTransitionReason(event.target.value)}
                minLength={3}
                required
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setTransitioning(null)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار التنفيذ…" : actionLabels[transitioning]}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </article>
  );
}

function NewRelationEditor({
  id,
  options,
  relationTypes,
  sources,
  done,
}: {
  id: string;
  options: Detail["references"]["legislationOptions"];
  relationTypes: Detail["references"]["relationTypes"];
  sources: Detail["sources"];
  done: (x: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="admin-entity-actions">
      <button
        type="button"
        className="button"
        onClick={() => setCreating(true)}
      >
        + إضافة علاقة
      </button>
      {creating && (
        <AdminDialog
          title="إضافة علاقة قانونية"
          onClose={() => setCreating(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const f = new FormData(formElement);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/legislations/${id}/relations`, {
                  body: {
                    targetLegislationId: f.get("targetLegislationId"),
                    relationType: f.get("relationType"),
                    scopeText: f.get("scopeText"),
                    effectiveFrom: f.get("effectiveFrom"),
                    sourceDocumentId: f.get("sourceDocumentId") || undefined,
                    reason: f.get("reason"),
                  },
                });
                done("أضيفت العلاقة القانونية.");
                setCreating(false);
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذرت الإضافة.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-columns">
              <label>
                التشريع المقابل
                <select name="targetLegislationId">
                  {options.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                نوع العلاقة
                <select name="relationType">
                  {relationTypes.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.labelAr}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ الأثر
                <input name="effectiveFrom" type="date" />
              </label>
              <label>
                مصدر الإثبات
                <select name="sourceDocumentId">
                  <option value="">بدون مصدر (للتشابه الموضوعي فقط)</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.originalName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              النطاق أو المادة
              <input name="scopeText" />
            </label>
            <label>
              سبب الإضافة
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الإضافة…" : "إضافة العلاقة"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </div>
  );
}

export function SourceEditor({
  source,
  legislationId,
  editable,
  done,
  showLifecycle = true,
}: {
  source: Detail["sources"][number];
  showLifecycle?: boolean;
  legislationId?: string;
  editable: boolean;
  done: (message: string) => void;
}) {
  const auth = useAuth();
  const [unlinking, setUnlinking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className="admin-list-card">
      <header>
        <div>
          <strong>{source.originalName}</strong>{" "}
          <span className="review-flag">
            {source.sourceRole === "OFFICIAL_PDF"
              ? "PDF رسمي للتنزيل"
              : source.sourceRole === "EXTRACTION"
                ? "مصدر الاستخراج"
                : "مصدر داعم"}
          </span>{" "}
        </div>
        <StatusBadge status={source.extractionStatus} />
      </header>
      <EntityDetails
        items={[
          { label: "النوع", value: source.mediaType },
          { label: "الحجم", value: `${source.byteSize} بايت` },
          { label: "جهة الحصول", value: source.obtainedFrom },
          { label: "عدد الصفحات", value: source.pageCount ?? "—" },
          { label: "دقة OCR", value: source.ocrConfidence ?? "—" },
          { label: "البصمة", value: source.sha256, wide: true },
        ]}
      />
      {showLifecycle && (
        <div className="admin-entity-actions">
          <LifecycleActions
            kind="sources"
            id={source.id}
            label={source.originalName}
            onDone={() => done("حُدّثت حالة السجل.")}
          />
        </div>
      )}
      {legislationId && auth.hasPermission("source.delete") && (
        <button
          className="link-button danger"
          onClick={() => setUnlinking(true)}
        >
          فك ارتباط المصدر
        </button>
      )}
      {unlinking && (
        <ConfirmDialog
          title={`فك ارتباط ${source.originalName}`}
          description="يفك الارتباط بهذه المسودة فقط ولا يحذف الملف. يمنع الخادم فك مصدر مثبت في نسخة تشريعية محفوظة."
          confirmLabel="فك الارتباط"
          onClose={() => setUnlinking(false)}
          onConfirm={async () => {
            await apiRequest(
              `/admin/legislations/${legislationId}/sources/${source.id}`,
              {
                method: "DELETE",
                body: {
                  reason: `فك ارتباط المصدر ${source.originalName} من المسودة`,
                },
              },
            );
            setUnlinking(false);
            done("فُك ارتباط المصدر.");
          }}
        />
      )}
      {editable && (
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => setEditing(true)}
          >
            تعديل المصدر
          </button>
        </div>
      )}
      {editing && (
        <AdminDialog
          title={`تعديل ${source.originalName}`}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              setSaving(true);
              setError("");
              try {
                await apiRequest(`/admin/sources/${source.id}`, {
                  method: "PATCH",
                  body: {
                    obtainedFrom: f.get("obtainedFrom"),
                    pageCount: f.get("pageCount")
                      ? Number(f.get("pageCount"))
                      : undefined,
                    extractionStatus: f.get("extractionStatus"),
                    reason: f.get("reason"),
                  },
                });
                setEditing(false);
                done("حُفظت بيانات المصدر.");
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر الحفظ.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <label>
              جهة الحصول
              <input
                name="obtainedFrom"
                defaultValue={source.obtainedFrom}
                required
              />
            </label>
            <div className="form-columns">
              <label>
                عدد الصفحات
                <input
                  name="pageCount"
                  type="number"
                  min="1"
                  defaultValue={source.pageCount ?? ""}
                />
              </label>
              <label>
                حالة الاستخراج
                <select
                  name="extractionStatus"
                  defaultValue={source.extractionStatus}
                >
                  {[
                    "PENDING",
                    "EXTRACTED",
                    "OCR_REQUIRED",
                    "OCR_UNREVIEWED",
                    "REVIEWED",
                    "FAILED",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              سبب التعديل
              <input name="reason" required />
            </label>
            <div className="admin-entity-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                إلغاء
              </button>
              <button className="button" disabled={saving}>
                {saving ? "جار الحفظ…" : "حفظ المصدر"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
    </article>
  );
}

function WorkflowActions({
  status,
  draftArticleCount,
  permissions,
  id,
  done,
  setMessage,
}: {
  status: string;
  draftArticleCount: number;
  permissions: string[];
  id: string;
  done: (result: { to: string; publishedArticleCount: number }) => void;
  setMessage: (x: string) => void;
}) {
  const policies = useOperationPolicies();
  const skipOrder =
    policies.allows("LEGISLATION_WORKFLOW_ORDER") &&
    ["INBOX", "DRAFT", "IN_REVIEW", "APPROVED_FOR_PUBLISHING"].includes(status);
  const actions = [] as Array<{ target: string; label: string }>;
  if (status === "INBOX" && permissions.includes("legislation.prepare"))
    actions.push({ target: "DRAFT", label: "تجهيز كمسودة" });
  if (
    (status === "DRAFT" || (skipOrder && status !== "IN_REVIEW")) &&
    permissions.includes("legislation.submit")
  )
    actions.push({ target: "IN_REVIEW", label: "إرسال للمراجعة" });
  if (status === "IN_REVIEW" && permissions.includes("legislation.return"))
    actions.push({ target: "DRAFT", label: "إعادة للمسودة" });
  if (
    (status === "IN_REVIEW" ||
      (skipOrder && status !== "APPROVED_FOR_PUBLISHING")) &&
    permissions.includes("legislation.approve")
  )
    actions.push({
      target: "APPROVED_FOR_PUBLISHING",
      label: "اعتماد للنشر",
    });
  if (
    (status === "APPROVED_FOR_PUBLISHING" || skipOrder) &&
    permissions.includes("legislation.publish")
  )
    actions.push({ target: "PUBLISHED", label: "نشر" });
  if (
    ["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"].includes(status) &&
    permissions.includes("legislation.archive")
  )
    actions.push({ target: "ARCHIVED", label: "أرشفة" });
  if (!actions.length)
    return <p>لا يوجد انتقال متاح لهذا الدور في الحالة الحالية.</p>;
  return (
    <>
      {draftArticleCount > 0 && (
        <p className="form-message" role="status">
          يوجد {draftArticleCount} نسخة مادة مسودة. لا تحتاج إلى اعتماد المواد
          منفردة؛ ستُنشر ذريًا مع التشريع عند تنفيذ خطوة «نشر».
        </p>
      )}
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const result = await apiRequest<{
              to: string;
              publishedArticleCount: number;
            }>(`/admin/legislations/${id}/workflow`, {
              body: { target: f.get("target"), reason: f.get("reason") },
            });
            done(result);
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "تعذر الانتقال.",
            );
          }
        }}
      >
        <select name="target">
          {actions.map((a) => (
            <option key={a.target} value={a.target}>
              {a.label}
            </option>
          ))}
        </select>
        <input name="reason" required placeholder="سبب الإجراء" />
        <button className="button">تنفيذ</button>
      </form>
    </>
  );
}
