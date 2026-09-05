import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
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
  }>;
  structures: StructureNodeItem[];
  annexes: Array<{
    id: string;
    annexType: string;
    titleAr: string;
    status: string;
    versionCount: number;
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
  const { id, tab = "general" } = useParams();
  const auth = useAuth();
  const item = useApi<Detail>(
    id
      ? `/admin/legislations/${id}${
          tab === "articles" ? "?articleContent=full" : ""
        }`
      : null,
  );
  const [msg, setMsg] = useState("");
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
      item.retry();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "تعذر الحفظ.");
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
        status={<StatusBadge status={law.status} />}
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
      {tab === "general" && canEditMetadata && (
        <form className="admin-card edit-form" onSubmit={save}>
          <h2>كل بيانات التشريع المعروضة</h2>
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
              <input name="displayCode" defaultValue={law.display_code ?? ""} />
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
          <button className="button">حفظ</button>
        </form>
      )}
      {tab === "general" && !canEditMetadata && (
        <section className="admin-card">
          <h2>البيانات العامة</h2>
          <p className="form-warning">
            هذه البيانات متاحة للعرض فقط وفق صلاحيات حسابك وحالة التشريع.
          </p>
          <dl className="admin-summary-list">
            <div>
              <dt>رمز العرض</dt>
              <dd>{law.display_code ?? "—"}</dd>
            </div>
            <div>
              <dt>الرقم والسنة</dt>
              <dd>
                {law.official_number ?? "—"} / {law.year}
              </dd>
            </div>
            <div>
              <dt>الحالة القانونية</dt>
              <dd>{law.legal_status}</dd>
            </div>
            <div>
              <dt>درجة التحقق</dt>
              <dd>{law.verification_level}</dd>
            </div>
            <div>
              <dt>تاريخ الإصدار</dt>
              <dd>{law.issue_date?.slice(0, 10) ?? "—"}</dd>
            </div>
            <div>
              <dt>تاريخ النفاذ</dt>
              <dd>{law.effective_from?.slice(0, 10) ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}
      {tab === "articles" && law.articles.length > 0 && (
        <section className="admin-card">
          <h2>مواد النسخة الحالية</h2>
          <p>
            النص المستخرج قابل للتحرير ما دام مسودة فقط؛ لا يسمح النظام بتغيير
            نسخة منشورة في مكانها.
          </p>
          <div className="draft-articles">
            {law.articles.map((article) => (
              <ArticleEditor
                key={article.id}
                article={article}
                nodes={law.structures}
                editable={
                  auth.hasPermission("article.update") &&
                  article.status === "DRAFT"
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
            تعديل النوع والعنوان والحالة؛ تبقى إصدارات الملفات التاريخية محفوظة.
          </p>
          <div className="draft-articles">
            {law.annexes.length === 0 &&
              !auth.hasPermission("annex.update") && (
                <p>لا توجد ملاحق أو جداول مسجلة.</p>
              )}
            {law.annexes.map((annex) => (
              <AnnexEditor
                key={annex.id}
                annex={annex}
                editable={
                  auth.hasPermission("annex.update") &&
                  (annex.status === "DRAFT" ||
                    auth.hasPermission(
                      annex.status === "PUBLISHED"
                        ? "annex.publish"
                        : annex.status === "REPLACED"
                          ? "annex.replace"
                          : "annex.repeal",
                    ))
                }
                canPublish={auth.hasPermission("annex.publish")}
                canReplace={auth.hasPermission("annex.replace")}
                canRepeal={auth.hasPermission("annex.repeal")}
                done={(message) => {
                  setMsg(message);
                  item.retry();
                }}
              />
            ))}
            {auth.hasPermission("annex.create") && (
              <NewAnnexEditor
                id={law.id}
                sources={law.sources}
                canPublish={auth.hasPermission("annex.publish")}
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
                sources={law.sources}
                editable={
                  auth.hasPermission("relation.update") &&
                  (relation.reviewStatus === "UNREVIEWED" ||
                    auth.hasPermission("relation.review"))
                }
                canReview={auth.hasPermission("relation.review")}
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
                sources={law.sources}
                canReview={auth.hasPermission("relation.review")}
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
            permissions={auth.user?.permissions ?? []}
            id={law.id}
            done={() => {
              item.retry();
              setMsg("تم انتقال الحالة بنجاح.");
            }}
            setMessage={setMsg}
          />
        </section>
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
  return (
    <details className="draft-article">
      <summary>
        المادة {article.currentLabel} — النسخة {article.versionNo}{" "}
        <StatusBadge status={article.status} />
      </summary>
      {editable ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await apiRequest(`/admin/articles/${article.id}/metadata`, {
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
              });
              done(`حُفظ نص المادة ${article.currentLabel}.`);
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر حفظ المادة.");
            }
          }}
        >
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
          <button className="button secondary">حفظ المادة</button>
        </form>
      ) : (
        <p className="legal-text compact">
          {article.textOriginal ?? article.textPreview}
        </p>
      )}
    </details>
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
  return (
    <details className="draft-article">
      <summary>
        {node.titleAr} — {node.nodeType}
      </summary>
      {editable && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
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
              done("حُفظ عنصر الهيكل وسُجل التعديل.");
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر الحفظ.");
            }
          }}
        >
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
          <button className="button secondary">حفظ الهيكل</button>
        </form>
      )}
    </details>
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
  return (
    <details className="draft-article">
      <summary>+ إضافة باب أو فصل أو قسم</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const f = new FormData(formElement);
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
            formElement.reset();
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذرت الإضافة.");
          }
        }}
      >
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
        <button className="button">إضافة</button>
      </form>
    </details>
  );
}

function AnnexEditor({
  annex,
  editable,
  canPublish,
  canReplace,
  canRepeal,
  done,
}: {
  annex: Detail["annexes"][number];
  editable: boolean;
  canPublish: boolean;
  canReplace: boolean;
  canRepeal: boolean;
  done: (message: string) => void;
}) {
  return (
    <details className="draft-article">
      <summary>
        {annex.titleAr} — {annex.versionCount} إصدار
      </summary>
      {editable && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            try {
              await apiRequest(`/admin/annexes/${annex.id}`, {
                method: "PATCH",
                body: {
                  annexType: f.get("annexType"),
                  titleAr: f.get("titleAr"),
                  status: f.get("status"),
                  reason: f.get("reason"),
                },
              });
              done("حُفظت بيانات الملحق.");
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر الحفظ.");
            }
          }}
        >
          <div className="form-columns">
            <label>
              العنوان
              <input name="titleAr" defaultValue={annex.titleAr} required />
            </label>
            <label>
              النوع
              <select name="annexType" defaultValue={annex.annexType}>
                {[
                  "EXECUTIVE_REGULATION",
                  "TABLE",
                  "FORM",
                  "ANNEX",
                  "MAP",
                  "TARIFF",
                  "LIST",
                  "CORRECTION",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              الحالة
              <select name="status" defaultValue={annex.status}>
                {annex.status === "DRAFT" && <option>DRAFT</option>}
                {(annex.status === "PUBLISHED" || canPublish) && (
                  <option>PUBLISHED</option>
                )}
                {(annex.status === "REPLACED" || canReplace) && (
                  <option>REPLACED</option>
                )}
                {(annex.status === "REPEALED" || canRepeal) && (
                  <option>REPEALED</option>
                )}
              </select>
            </label>
          </div>
          <label>
            سبب التعديل
            <input name="reason" required />
          </label>
          <button className="button secondary">حفظ الملحق</button>
        </form>
      )}
    </details>
  );
}

function NewAnnexEditor({
  id,
  sources,
  canPublish,
  done,
}: {
  id: string;
  sources: Detail["sources"];
  canPublish: boolean;
  done: (x: string) => void;
}) {
  if (!sources.length) return <p>اربط مصدرًا بالتشريع قبل إضافة ملحق.</p>;
  return (
    <details className="draft-article">
      <summary>+ إضافة لائحة أو جدول أو ملحق</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const f = new FormData(formElement);
          try {
            await apiRequest(`/admin/legislations/${id}/annexes`, {
              body: {
                annexType: f.get("annexType"),
                titleAr: f.get("titleAr"),
                status: f.get("status"),
                validFrom: f.get("validFrom"),
                sourceDocumentId: f.get("sourceDocumentId"),
                structuredTableJson: f.get("structuredTableJson"),
                reason: f.get("reason"),
              },
            });
            done("أضيف إصدار الملحق الأول.");
            formElement.reset();
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذرت الإضافة.");
          }
        }}
      >
        <div className="form-columns">
          <label>
            العنوان
            <input name="titleAr" required />
          </label>
          <label>
            النوع
            <select name="annexType">
              {[
                "EXECUTIVE_REGULATION",
                "TABLE",
                "FORM",
                "ANNEX",
                "MAP",
                "TARIFF",
                "LIST",
                "CORRECTION",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            الحالة
            <select name="status">
              <option>DRAFT</option>
              {canPublish && <option>PUBLISHED</option>}
            </select>
          </label>
          <label>
            النفاذ
            <input name="validFrom" type="date" required />
          </label>
          <label>
            المصدر
            <select name="sourceDocumentId">
              {sources.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.originalName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          جدول منظم JSON اختياري
          <textarea
            name="structuredTableJson"
            placeholder='{"columns":["الحقل"],"rows":[["القيمة"]]}'
          />
        </label>
        <label>
          سبب الإضافة
          <input name="reason" required />
        </label>
        <button className="button">إضافة الملحق</button>
      </form>
    </details>
  );
}

function RelationEditor({
  relation,
  options,
  sources,
  editable,
  canReview,
  done,
}: {
  relation: Detail["relations"][number];
  options: Detail["references"]["legislationOptions"];
  sources: Detail["sources"];
  editable: boolean;
  canReview: boolean;
  done: (message: string) => void;
}) {
  return (
    <details className="draft-article">
      <summary>
        {relation.targetTitle} — {relation.relationType}
      </summary>
      {editable && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
            try {
              await apiRequest(`/admin/relations/${relation.id}`, {
                method: "PATCH",
                body: {
                  relationType: f.get("relationType"),
                  targetLegislationId: f.get("targetLegislationId"),
                  scopeText: f.get("scopeText"),
                  effectiveFrom: f.get("effectiveFrom"),
                  sourceDocumentId: f.get("sourceDocumentId") || undefined,
                  reviewStatus: f.get("reviewStatus"),
                  reason: f.get("reason"),
                },
              });
              done("حُفظت العلاقة القانونية.");
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر الحفظ.");
            }
          }}
        >
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
              <select name="relationType" defaultValue={relation.relationType}>
                {[
                  "AMENDS",
                  "REPEALS",
                  "IMPLEMENTS",
                  "BASED_ON",
                  "REFERS_TO",
                  "CORRECTS",
                  "TOPICALLY_RELATED",
                ].map((x) => (
                  <option key={x}>{x}</option>
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
              حالة المراجعة
              <select name="reviewStatus" defaultValue={relation.reviewStatus}>
                <option>UNREVIEWED</option>
                {canReview && <option>REVIEWED</option>}
                {canReview && <option>REJECTED</option>}
              </select>
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
          <button className="button secondary">حفظ العلاقة</button>
        </form>
      )}
    </details>
  );
}

function NewRelationEditor({
  id,
  options,
  sources,
  canReview,
  done,
}: {
  id: string;
  options: Detail["references"]["legislationOptions"];
  sources: Detail["sources"];
  canReview: boolean;
  done: (x: string) => void;
}) {
  return (
    <details className="draft-article">
      <summary>+ إضافة علاقة قانونية</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const f = new FormData(formElement);
          try {
            await apiRequest(`/admin/legislations/${id}/relations`, {
              body: {
                targetLegislationId: f.get("targetLegislationId"),
                relationType: f.get("relationType"),
                scopeText: f.get("scopeText"),
                effectiveFrom: f.get("effectiveFrom"),
                sourceDocumentId: f.get("sourceDocumentId") || undefined,
                reviewStatus: f.get("reviewStatus"),
                reason: f.get("reason"),
              },
            });
            done("أضيفت العلاقة القانونية.");
            formElement.reset();
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذرت الإضافة.");
          }
        }}
      >
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
              {[
                "AMENDS",
                "REPEALS",
                "IMPLEMENTS",
                "BASED_ON",
                "REFERS_TO",
                "CORRECTS",
                "TOPICALLY_RELATED",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            تاريخ الأثر
            <input name="effectiveFrom" type="date" />
          </label>
          <label>
            المراجعة
            <select name="reviewStatus">
              <option>UNREVIEWED</option>
              {canReview && <option>REVIEWED</option>}
              {canReview && <option>REJECTED</option>}
            </select>
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
        <button className="button">إضافة العلاقة</button>
      </form>
    </details>
  );
}

function SourceEditor({
  source,
  editable,
  done,
}: {
  source: Detail["sources"][number];
  editable: boolean;
  done: (message: string) => void;
}) {
  return (
    <details className="draft-article">
      <summary>
        <strong>{source.originalName}</strong>{" "}
        <StatusBadge status={source.extractionStatus} />
      </summary>
      <dl className="inline-meta">
        <div>
          <dt>النوع</dt>
          <dd>{source.mediaType}</dd>
        </div>
        <div>
          <dt>الحجم</dt>
          <dd>{source.byteSize} بايت</dd>
        </div>
        <div>
          <dt>البصمة</dt>
          <dd className="hash">{source.sha256}</dd>
        </div>
      </dl>
      {editable && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const f = new FormData(event.currentTarget);
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
              done("حُفظت بيانات المصدر.");
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر الحفظ.");
            }
          }}
        >
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
          <button className="button secondary">حفظ المصدر</button>
        </form>
      )}
    </details>
  );
}

function WorkflowActions({
  status,
  permissions,
  id,
  done,
  setMessage,
}: {
  status: string;
  permissions: string[];
  id: string;
  done: () => void;
  setMessage: (x: string) => void;
}) {
  const actions = [] as Array<{ target: string; label: string }>;
  if (status === "INBOX" && permissions.includes("legislation.prepare"))
    actions.push({ target: "DRAFT", label: "تجهيز كمسودة" });
  if (status === "DRAFT" && permissions.includes("legislation.submit"))
    actions.push({ target: "IN_REVIEW", label: "إرسال للمراجعة" });
  if (status === "IN_REVIEW" && permissions.includes("legislation.return"))
    actions.push({ target: "DRAFT", label: "إعادة للمسودة" });
  if (status === "IN_REVIEW" && permissions.includes("legislation.approve"))
    actions.push({
      target: "APPROVED_FOR_PUBLISHING",
      label: "اعتماد للنشر",
    });
  if (
    status === "APPROVED_FOR_PUBLISHING" &&
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
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        try {
          await apiRequest(`/admin/legislations/${id}/workflow`, {
            body: { target: f.get("target"), reason: f.get("reason") },
          });
          done();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "تعذر الانتقال.");
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
  );
}
