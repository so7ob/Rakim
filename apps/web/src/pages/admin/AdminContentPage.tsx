import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminRowActions } from "../../components/admin/AdminRowActions";
interface ContentItem {
  id: string;
  titleAr: string;
  officialNumber: string;
  year: number;
  status: string;
  typeName: string;
  authorityName: string;
  verificationLevel: string;
  updatedAt: string;
}
interface References {
  types: Array<{ id: string; name: string }>;
  authorities: Array<{ id: string; name: string }>;
}
interface CreatedLegislation {
  id: string;
  workflowStatus: string;
}
export function AdminContentPage() {
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const list = useApi<{
    items: ContentItem[];
    meta: { total: number; page: number; pageSize: number };
  }>(
    `/admin/legislations?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}), page: String(page) })}`,
  );
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createDirty, setCreateDirty] = useState(false);
  const [createError, setCreateError] = useState("");
  const [message, setMessage] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const references = useApi<References>(
    creating && auth.hasPermission("legislation.create")
      ? "/admin/references"
      : null,
  );
  const canEdit = (item: ContentItem) =>
    (["INBOX", "DRAFT", "IN_REVIEW"].includes(item.status) &&
      auth.hasPermission("legislation.update")) ||
    (!["INBOX", "DRAFT", "IN_REVIEW"].includes(item.status) &&
      auth.hasPermission("legislation.published_metadata.update"));
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setCreateError("");
    try {
      const created = await apiRequest<CreatedLegislation>("/legislations", {
        body: {
          titleAr: form.get("titleAr"),
          officialNumber: form.get("officialNumber") || undefined,
          year: Number(form.get("year")),
          typeId: form.get("typeId"),
          authorityId: form.get("authorityId"),
        },
      });
      setCreateDirty(false);
      setCreating(false);
      setCreatedId(created.id);
      setMessage("أضيفت مسودة التشريع، ويمكن فتحها أو تعديل بياناتها الآن.");
      if (status || q || page !== 1)
        setParams(new URLSearchParams(), { replace: true });
      else list.retry();
    } catch (reason) {
      setCreateError(
        reason instanceof Error ? reason.message : "تعذر إنشاء مسودة التشريع.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const updateParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!("page" in updates)) next.delete("page");
    setParams(next);
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow="INBOX ←→ PUBLISHED"
        title="التشريعات ودورة العمل"
        description="صفّ المسودات والتشريعات وافتح صفحة التفاصيل المقسمة بحسب نوع البيانات."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إدارة المحتوى" },
          { label: "التشريعات" },
        ]}
        actions={
          <>
            {auth.hasPermission("source.upload") && (
              <Link className="button secondary" to="/ar/admin/imports/upload">
                استيراد من ملف
              </Link>
            )}
            {auth.hasPermission("legislation.create") && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setCreateError("");
                  setCreateDirty(false);
                  setCreating(true);
                }}
              >
                + إضافة تشريع
              </button>
            )}
          </>
        }
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {creating && auth.hasPermission("legislation.create") && (
        <AdminDialog
          title="إضافة مسودة تشريع"
          description="أنشئ السجل الأساسي الآن، ثم أضف النص والبنية والمصادر من صفحة التشريع."
          dirty={createDirty}
          onClose={() => setCreating(false)}
        >
          {references.loading ? (
            <LoadingCards />
          ) : references.error || !references.data ? (
            <ErrorPanel
              message={
                references.error?.message ?? "تعذر تحميل الأنواع والجهات."
              }
              retry={references.retry}
            />
          ) : (
            <form
              className="edit-form"
              onInput={() => setCreateDirty(true)}
              onSubmit={create}
            >
              {createError && (
                <p className="form-error" role="alert">
                  {createError}
                </p>
              )}
              <label>
                عنوان التشريع
                <input name="titleAr" required minLength={3} maxLength={1000} />
              </label>
              <div className="form-columns">
                <label>
                  النوع
                  <select name="typeId" required defaultValue="">
                    <option value="">اختر النوع</option>
                    {references.data.types.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  الجهة
                  <select name="authorityId" required defaultValue="">
                    <option value="">اختر الجهة</option>
                    {references.data.authorities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  السنة
                  <input
                    name="year"
                    type="number"
                    min={1900}
                    max={2200}
                    defaultValue={new Date().getFullYear()}
                    required
                  />
                </label>
                <label>
                  الرقم الرسمي
                  <input name="officialNumber" maxLength={80} />
                </label>
              </div>
              <div className="admin-entity-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setCreating(false)}
                  disabled={submitting}
                >
                  إلغاء
                </button>
                <button className="button" disabled={submitting}>
                  {submitting ? "جار الإنشاء…" : "إنشاء المسودة"}
                </button>
              </div>
            </form>
          )}
        </AdminDialog>
      )}
      <form
        className="admin-filterbar"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          updateParams({ q: String(form.get("q") ?? "") });
        }}
      >
        <label>
          <span className="sr-only">البحث في التشريعات</span>
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="العنوان أو الرقم…"
          />
        </label>
        <button className="button secondary">بحث</button>
        {q && (
          <button
            type="button"
            className="link-button"
            onClick={() => updateParams({ q: "" })}
          >
            مسح
          </button>
        )}
      </form>
      <div
        className="workflow-filters"
        role="group"
        aria-label="تصفية حالة العمل"
      >
        {[
          "",
          "DRAFT",
          "IN_REVIEW",
          "APPROVED_FOR_PUBLISHING",
          "PUBLISHED",
          "ARCHIVED",
        ].map((value) => (
          <button
            key={value}
            className={status === value ? "active" : ""}
            onClick={() => updateParams({ status: value })}
          >
            {value ? <StatusBadge status={value} /> : <span>الكل</span>}
          </button>
        ))}
      </div>
      {list.loading ? (
        <LoadingCards />
      ) : list.error ? (
        <ErrorPanel message={list.error.message} retry={list.retry} />
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>التشريع</th>
                <th>النوع/الجهة</th>
                <th>الحالة</th>
                <th>التحقق</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {list.data?.items.map((item) => (
                <tr
                  key={item.id}
                  className={
                    item.id === createdId ? "admin-row-highlight" : undefined
                  }
                >
                  <td>
                    <strong>{item.titleAr}</strong>
                    <small>
                      رقم {item.officialNumber || "—"} لسنة {item.year}
                    </small>
                  </td>
                  <td>
                    {item.typeName}
                    <small>{item.authorityName}</small>
                  </td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.verificationLevel}</td>
                  <td>
                    <AdminRowActions label={`إجراءات التشريع ${item.titleAr}`}>
                      <Link
                        className="button secondary"
                        to={`/ar/admin/content/${item.id}/general`}
                      >
                        عرض
                      </Link>
                      {canEdit(item) && (
                        <Link
                          className="link-button"
                          to={`/ar/admin/content/${item.id}/general`}
                          state={{ openEdit: true }}
                        >
                          تعديل
                        </Link>
                      )}
                      {auth.hasPermission("legislation.archive") &&
                        [
                          "PUBLISHED",
                          "AMENDED",
                          "REPEALED",
                          "SUSPENDED",
                        ].includes(item.status) && (
                          <Link
                            className="link-button danger"
                            to={`/ar/admin/content/${item.id}/workflow`}
                          >
                            أرشفة
                          </Link>
                        )}
                    </AdminRowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{list.data?.meta.total ?? 0} عنصر</p>
        </div>
      )}
      {list.data && list.data.meta.total > list.data.meta.pageSize && (
        <nav className="admin-pagination" aria-label="صفحات التشريعات">
          <button
            disabled={page === 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            السابق
          </button>
          <span>
            صفحة {page} من{" "}
            {Math.ceil(list.data.meta.total / list.data.meta.pageSize)}
          </span>
          <button
            disabled={
              page >= Math.ceil(list.data.meta.total / list.data.meta.pageSize)
            }
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            التالي
          </button>
        </nav>
      )}
    </section>
  );
}
