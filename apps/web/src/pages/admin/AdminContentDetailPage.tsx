import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
interface Detail {
  id: string;
  title_ar: string;
  summary_ar: string | null;
  official_number: string | null;
  year: number;
  status: string;
  effective_from: string | null;
  versions: Array<{ preambleText: string | null }>;
  type_id: string;
  authority_id: string;
  references: {
    types: Array<{ id: string; name: string }>;
    authorities: Array<{ id: string; name: string }>;
  };
  sources: Array<{
    id: string;
    originalName: string;
    extractionStatus: string;
    ocrConfidence: number | null;
  }>;
  articles: Array<{
    id: string;
    currentLabel: string;
    versionNo: number;
    textOriginal: string;
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
  const { id } = useParams();
  const auth = useAuth();
  const item = useApi<Detail>(id ? `/admin/legislations/${id}` : null);
  const [msg, setMsg] = useState("");
  if (item.loading) return <LoadingCards />;
  if (item.error || !item.data)
    return (
      <ErrorPanel
        message={item.error?.message ?? "غير موجود"}
        retry={item.retry}
      />
    );
  const law = item.data;
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiRequest(`/admin/legislations/${id}`, {
        method: "PATCH",
        body: {
          titleAr: f.get("titleAr"),
          summaryAr: f.get("summaryAr"),
          officialNumber: f.get("officialNumber"),
          year: Number(f.get("year")),
          typeId: f.get("typeId"),
          authorityId: f.get("authorityId"),
          effectiveFrom: f.get("effectiveFrom"),
          preambleText: f.get("preambleText"),
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
      <Link className="back-dark" to="/ar/admin/content">
        ← العودة للمحتوى
      </Link>
      <header className="admin-title">
        <div>
          <StatusBadge status={law.status} />
          <h1>{law.title_ar}</h1>
        </div>
      </header>
      {auth.hasRole("DATA_ENTRY") &&
        ["INBOX", "DRAFT", "IN_REVIEW"].includes(law.status) && (
          <form className="admin-card edit-form" onSubmit={save}>
            <h2>البيانات الأساسية</h2>
            <label>
              العنوان
              <input name="titleAr" defaultValue={law.title_ar} required />
            </label>
            <label>
              الملخص
              <textarea name="summaryAr" defaultValue={law.summary_ar ?? ""} />
            </label>
            <label>
              الديباجة
              <textarea
                name="preambleText"
                defaultValue={law.versions[0]?.preambleText ?? ""}
              />
            </label>
            <div className="form-columns">
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
                النفاذ
                <input
                  name="effectiveFrom"
                  type="date"
                  defaultValue={law.effective_from?.slice(0, 10) ?? ""}
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
            </div>
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
      {law.articles.length > 0 && (
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
                editable={
                  auth.hasRole("DATA_ENTRY") && article.status === "DRAFT"
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
      <section className="admin-card">
        <h2>الإجراء التالي</h2>
        <WorkflowActions
          status={law.status}
          roles={auth.user?.roles ?? []}
          id={law.id}
          done={() => {
            item.retry();
            setMsg("تم انتقال الحالة بنجاح.");
          }}
          setMessage={setMsg}
        />
        {msg && (
          <p role="status" className="form-message">
            {msg}
          </p>
        )}
      </section>
      <div className="admin-grid">
        <section className="admin-card">
          <h2>المصادر</h2>
          {law.sources.map((source) => (
            <p key={source.id}>
              <strong>{source.originalName}</strong>
              <br />
              <StatusBadge status={source.extractionStatus} />
              {source.ocrConfidence && ` — ثقة ${source.ocrConfidence}%`}
            </p>
          ))}
        </section>
        <section className="admin-card">
          <h2>فصل المسؤوليات</h2>
          {law.responsibilities.map((r, i) => (
            <p key={`${r.duty}-${i}`}>
              {r.duty}: {r.userName}
            </p>
          ))}
        </section>
        <section className="admin-card wide">
          <h2>سجل سير العمل</h2>
          {law.events.map((event) => (
            <article className="timeline-row" key={event.id}>
              <StatusBadge status={event.to_status} />
              <div>
                <strong>{event.actorName}</strong>
                <p>{event.reason}</p>
              </div>
              <time>{new Date(event.created_at).toLocaleString("ar-YE")}</time>
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
function ArticleEditor({
  article,
  editable,
  done,
}: {
  article: Detail["articles"][number];
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
              await apiRequest(`/admin/articles/${article.id}`, {
                method: "PATCH",
                body: { text: form.get("text"), reason: form.get("reason") },
              });
              done(`حُفظ نص المادة ${article.currentLabel}.`);
            } catch (error) {
              done(error instanceof Error ? error.message : "تعذر حفظ المادة.");
            }
          }}
        >
          <label>
            النص
            <textarea
              name="text"
              defaultValue={article.textOriginal}
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
        <p className="legal-text compact">{article.textOriginal}</p>
      )}
    </details>
  );
}
function WorkflowActions({
  status,
  roles,
  id,
  done,
  setMessage,
}: {
  status: string;
  roles: string[];
  id: string;
  done: () => void;
  setMessage: (x: string) => void;
}) {
  const actions = [] as Array<{ target: string; label: string }>;
  if (status === "DRAFT" && roles.includes("DATA_ENTRY"))
    actions.push({ target: "IN_REVIEW", label: "إرسال للمراجعة" });
  if (status === "IN_REVIEW" && roles.includes("LEGAL_REVIEWER"))
    actions.push(
      { target: "DRAFT", label: "إعادة للمسودة" },
      { target: "APPROVED_FOR_PUBLISHING", label: "اعتماد للنشر" },
    );
  if (status === "APPROVED_FOR_PUBLISHING" && roles.includes("CONTENT_MANAGER"))
    actions.push({ target: "PUBLISHED", label: "نشر" });
  if (
    ["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"].includes(status) &&
    roles.includes("CONTENT_MANAGER")
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
