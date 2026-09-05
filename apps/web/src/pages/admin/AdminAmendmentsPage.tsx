import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";

interface Amendment {
  id: string;
  operationId: string;
  titleAr: string;
  status: string;
  issueDate: string | null;
  effectiveFrom: string;
  legislationTitle: string;
  createdBy: string | null;
  reviewedBy: string | null;
  operationType: string;
  articleLabel: string;
  paragraphLocator: string | null;
  proposedText: string | null;
  proposedLabel: string | null;
  citationText: string;
  sourceName: string;
}
interface Candidates {
  articles: Array<{
    id: string;
    currentLabel: string;
    legislationTitle: string;
    currentText: string;
  }>;
  sources: Array<{ id: string; originalName: string }>;
}
const labels: Record<string, string> = {
  ADD: "إضافة",
  REPLACE: "استبدال",
  DELETE: "حذف",
  REPEAL: "إلغاء",
  RENUMBER: "إعادة ترقيم",
  CORRECT: "تصحيح",
};

export function AdminAmendmentsPage() {
  const { tab = "list" } = useParams();
  const auth = useAuth();
  const data = useApi<Amendment[]>("/admin/amendments");
  const candidates = useApi<Candidates>(
    auth.hasPermission("amendment.create")
      ? "/admin/amendments/candidates"
      : null,
  );
  const [msg, setMsg] = useState("");
  const act = async (item: Amendment, action: "review" | "publish") => {
    try {
      await apiRequest(`/admin/amendments/${item.id}/${action}`, {
        body: {
          reason:
            action === "review"
              ? "مراجعة الأداة والنطاق والنص والمصدر"
              : "نشر التعديل وتطبيق النسخة الزمنية الجديدة",
        },
      });
      setMsg(
        action === "review"
          ? "تمت مراجعة التعديل."
          : "نُشر التعديل وأنشئت نسخة زمنية جديدة.",
      );
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء.");
    }
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiRequest("/admin/amendments", { body: Object.fromEntries(form) });
      setMsg("أنشئت مسودة التعديل وأصبحت جاهزة لمراجع قانوني مستقل.");
      formElement.reset();
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر إنشاء التعديل.");
    }
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow="إنشاء ← مراجعة مستقلة ← نشر"
        title="عمليات التعديل"
        description="قائمة مستقلة لمسار التعديل ونموذج منفصل لإنشاء المسودة."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إدارة المحتوى" },
          { label: "التعديلات" },
        ]}
      />
      <AdminTabs
        label="إدارة التعديلات"
        items={[
          {
            label: "قائمة التعديلات",
            to: "/ar/admin/amendments/list",
            count: data.data?.length,
          },
          ...(auth.hasPermission("amendment.create")
            ? [{ label: "إنشاء تعديل", to: "/ar/admin/amendments/create" }]
            : []),
        ]}
      />
      {tab === "create" && auth.hasPermission("amendment.create") && (
        <form className="admin-card edit-form" onSubmit={create}>
          <h2>تسجيل مسودة تعديل</h2>
          <div className="form-columns">
            <label>
              المادة المستهدفة
              <select name="articleId" required>
                <option value="">اختر المادة</option>
                {candidates.data?.articles.map((article) => (
                  <option key={article.id} value={article.id}>
                    {article.legislationTitle} — المادة {article.currentLabel}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المصدر المدقق
              <select name="sourceDocumentId" required>
                <option value="">اختر المصدر</option>
                {candidates.data?.sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.originalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              نوع العملية
              <select name="operationType">
                <option value="REPLACE">استبدال</option>
                <option value="ADD">إضافة</option>
                <option value="DELETE">حذف</option>
                <option value="REPEAL">إلغاء</option>
                <option value="RENUMBER">إعادة ترقيم</option>
                <option value="CORRECT">تصحيح</option>
              </select>
            </label>
            <label>
              تاريخ الأثر
              <input name="effectiveFrom" type="date" required />
            </label>
            <label>
              تاريخ الأداة
              <input name="issueDate" type="date" />
            </label>
            <label>
              محدد الفقرة
              <input
                name="paragraphLocator"
                placeholder="اختياري: p-2 أو البند أ"
              />
            </label>
            <label>
              الرقم الجديد
              <input name="newLabel" placeholder="مطلوب لإعادة الترقيم" />
            </label>
          </div>
          <label>
            عنوان أداة التعديل
            <input name="titleAr" required />
          </label>
          <label>
            نص الاستشهاد بالمصدر
            <textarea name="citationText" required />
          </label>
          <label>
            النص الموحد المقترح كاملًا
            <textarea
              name="newText"
              rows={7}
              placeholder="مطلوب للإضافة والاستبدال والتصحيح؛ اتركه فارغًا للإلغاء"
            />
          </label>
          <button className="button">حفظ المسودة</button>
        </form>
      )}
      {msg && (
        <p className="form-message" role="status">
          {msg}
        </p>
      )}
      {tab === "list" &&
        (data.loading ? (
          <LoadingCards />
        ) : data.error ? (
          <ErrorPanel message={data.error.message} retry={data.retry} />
        ) : (
          <div className="admin-list">
            {data.data?.map((item) => (
              <article
                className="admin-card amendment-workflow"
                key={item.operationId}
              >
                <header>
                  <div>
                    <StatusBadge status={item.status} />
                    <h2>{item.titleAr}</h2>
                    <p>
                      {item.legislationTitle} — المادة {item.articleLabel}
                    </p>
                  </div>
                  <span className="tag">
                    {labels[item.operationType] ?? item.operationType}
                  </span>
                </header>
                <dl className="inline-meta">
                  <div>
                    <dt>بدء الأثر</dt>
                    <dd>{item.effectiveFrom}</dd>
                  </div>
                  <div>
                    <dt>المصدر</dt>
                    <dd>{item.sourceName}</dd>
                  </div>
                  <div>
                    <dt>المنشئ</dt>
                    <dd>{item.createdBy ?? "بيانات سابقة"}</dd>
                  </div>
                  <div>
                    <dt>المراجع</dt>
                    <dd>{item.reviewedBy ?? "لم يراجع"}</dd>
                  </div>
                </dl>
                <p>{item.citationText}</p>
                {item.proposedText && (
                  <details>
                    <summary>النص المقترح</summary>
                    <p className="legal-text compact">{item.proposedText}</p>
                  </details>
                )}
                <div className="row-actions">
                  {item.status === "DRAFT" &&
                    auth.hasPermission("amendment.review") && (
                      <button
                        className="button"
                        onClick={() => act(item, "review")}
                      >
                        اعتماد المراجعة
                      </button>
                    )}
                  {item.status === "REVIEWED" &&
                    auth.hasPermission("amendment.publish") && (
                      <button
                        className="button"
                        onClick={() => act(item, "publish")}
                      >
                        نشر وتطبيق التعديل
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
        ))}
    </section>
  );
}
