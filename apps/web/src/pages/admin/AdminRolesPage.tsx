import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";

export interface AccessRole {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr: string | null;
  isSystem: boolean | number;
  isActive: boolean | number;
  userCount: number;
  permissionCount: number;
  updatedAt: string;
}

export function AdminRolesPage() {
  const auth = useAuth();
  const roles = useApi<AccessRole[]>("/admin/access-roles");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const visible = roles.data?.filter((role) =>
    `${role.nameAr} ${role.code} ${role.descriptionAr ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setCreateError("");
    try {
      await apiRequest("/admin/access-roles", {
        body: Object.fromEntries(form),
      });
      setMessage("أُنشئ الدور المخصص دون صلاحيات أولية.");
      setCreating(false);
      roles.retry();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "تعذر إنشاء الدور.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow="تحكم موروث وقابل للتدقيق"
        title="الأدوار"
        description="الأدوار تجمع الصلاحيات التفصيلية وتورثها للمستخدمين. الأدوار النظامية محمية من الحذف."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "المستخدمون والوصول" },
          { label: "الأدوار" },
        ]}
        actions={
          auth.hasPermission("role.create") ? (
            <button type="button" className="button" onClick={() => setCreating(true)}>
              + إنشاء دور
            </button>
          ) : undefined
        }
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {creating && auth.hasPermission("role.create") && (
        <AdminDialog title="إنشاء دور مخصص" onClose={() => setCreating(false)}>
          <form className="edit-form" onSubmit={create}>
            {createError && <p className="form-error" role="alert">{createError}</p>}
            <div className="form-columns">
              <label>
                اسم الدور
                <input name="nameAr" required />
              </label>
              <label>
                الرمز
                <input
                  name="code"
                  dir="ltr"
                  pattern="[A-Za-z][A-Za-z0-9_]{2,59}"
                  required
                />
              </label>
            </div>
            <label>
              الوصف
              <textarea name="descriptionAr" />
            </label>
            <label>
              سبب الإنشاء
              <input name="reason" required minLength={3} />
            </label>
            <div className="admin-entity-actions">
              <button type="button" className="button secondary" onClick={() => setCreating(false)} disabled={submitting}>إلغاء</button>
              <button className="button" disabled={submitting}>{submitting ? "جار الإنشاء…" : "إنشاء الدور"}</button>
            </div>
          </form>
        </AdminDialog>
      )}
      <div className="admin-filterbar">
        <label>
          <span className="sr-only">البحث في الأدوار</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن دور…"
          />
        </label>
        <span>{visible?.length ?? 0} دور</span>
      </div>
      {roles.loading ? (
        <LoadingCards />
      ) : roles.error ? (
        <ErrorPanel message={roles.error.message} retry={roles.retry} />
      ) : !visible?.length ? (
        <div className="admin-card empty-state">
          <h2>لا توجد أدوار مطابقة</h2>
          <p>غيّر عبارة البحث أو أنشئ دورًا مخصصًا.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>الدور</th>
                <th>النوع</th>
                <th>المستخدمون</th>
                <th>الصلاحيات</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((role) => (
                <tr key={role.id}>
                  <td>
                    <strong>{role.nameAr}</strong>
                    <small dir="ltr">{role.code}</small>
                  </td>
                  <td>
                    <span className="tag">
                      {role.isSystem ? "نظامي" : "مخصص"}
                    </span>
                  </td>
                  <td>{Number(role.userCount)}</td>
                  <td>{Number(role.permissionCount)}</td>
                  <td>{role.isActive ? "فعال" : "معطل"}</td>
                  <td>
                    <Link
                      className="button secondary"
                      to={`/ar/admin/roles/${role.id}/general`}
                    >
                      فتح
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
