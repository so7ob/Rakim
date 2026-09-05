import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";

interface User {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean | number;
  createdAt: string;
  lastLoginAt: string | null;
  roles: string;
  policyOverrides: Array<{ code: string; labelAr: string }>;
}
interface Role {
  id: string;
  code: string;
  nameAr: string;
}
const pageSize = 10;

export function AdminUsersPage() {
  const auth = useAuth();
  const users = useApi<User[]>("/admin/users");
  const roles = useApi<Role[]>("/admin/roles");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () =>
      (users.data ?? []).filter((user) => {
        const matchesText = `${user.displayName} ${user.username}`
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStatus =
          !status || String(Boolean(user.isActive)) === status;
        const matchesRole = !role || user.roles?.split(",").includes(role);
        return matchesText && matchesStatus && matchesRole;
      }),
    [users.data, query, status, role],
  );
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const refresh = () => {
    users.retry();
    roles.retry();
  };
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await apiRequest("/admin/users", {
        body: {
          username: form.get("username"),
          displayName: form.get("displayName"),
          password: form.get("password"),
          roles: form.getAll("roles"),
        },
      });
      setMessage("أُنشئ الحساب وأُسندت أدواره.");
      formElement.reset();
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إنشاء الحساب.");
    }
  };
  const bulkState = async (active: boolean) => {
    if (
      !selected.size ||
      !window.confirm(`${active ? "تفعيل" : "تعطيل"} ${selected.size} حساب؟`)
    )
      return;
    try {
      await Promise.all(
        [...selected].map((id) =>
          apiRequest(`/admin/users/${id}/state`, {
            method: "PATCH",
            body: {
              active,
              reason: `إجراء جماعي: ${active ? "تفعيل" : "تعطيل"} حسابات محددة`,
            },
          }),
        ),
      );
      setMessage(`تم ${active ? "تفعيل" : "تعطيل"} الحسابات المحددة.`);
      setSelected(new Set());
      users.retry();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "تعذر الإجراء الجماعي.",
      );
    }
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow="وصول وفق أقل صلاحية"
        title="المستخدمون"
        description="ابحث وصفّ الحسابات، ثم افتح ملف المستخدم لإدارة أدواره وصلاحياته ونشاطه وجلساته."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "المستخدمون والوصول" },
          { label: "المستخدمون" },
        ]}
      />
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {auth.hasPermission("user.create") && (
        <details className="admin-card admin-create-panel">
          <summary>إنشاء حساب جديد</summary>
          <form className="edit-form" onSubmit={create}>
            <div className="form-columns">
              <label>
                اسم المستخدم
                <input
                  name="username"
                  pattern="[a-z0-9._-]{3,120}"
                  required
                  dir="ltr"
                />
              </label>
              <label>
                الاسم الظاهر
                <input name="displayName" required />
              </label>
              <label>
                كلمة مرور أولية
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </label>
            </div>
            <fieldset className="role-options">
              <legend>الأدوار</legend>
              {roles.data?.map((item) => (
                <label key={item.id}>
                  <input type="checkbox" name="roles" value={item.code} />
                  {item.nameAr}
                </label>
              ))}
            </fieldset>
            <button className="button">إنشاء الحساب</button>
          </form>
        </details>
      )}
      <div className="admin-filterbar user-filterbar">
        <label>
          <span className="sr-only">البحث في المستخدمين</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="الاسم أو اسم المستخدم…"
          />
        </label>
        <label>
          <span className="sr-only">فلترة الحالة</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الحالات</option>
            <option value="true">نشط</option>
            <option value="false">معطل</option>
          </select>
        </label>
        <label>
          <span className="sr-only">فلترة الدور</span>
          <select
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          >
            <option value="">كل الأدوار</option>
            {roles.data?.map((item) => (
              <option key={item.id} value={item.code}>
                {item.nameAr}
              </option>
            ))}
          </select>
        </label>
        <span>{filtered.length} مستخدم</span>
      </div>
      {selected.size > 0 && auth.hasPermission("user.disable") && (
        <div className="admin-bulkbar">
          <strong>{selected.size} محدد</strong>
          <button className="button secondary" onClick={() => bulkState(true)}>
            تفعيل
          </button>
          <button
            className="button secondary danger"
            onClick={() => bulkState(false)}
          >
            تعطيل
          </button>
          <button
            className="link-button"
            onClick={() => setSelected(new Set())}
          >
            إلغاء التحديد
          </button>
        </div>
      )}
      {users.loading || roles.loading ? (
        <LoadingCards />
      ) : users.error || roles.error ? (
        <ErrorPanel
          message={(users.error ?? roles.error)!.message}
          retry={refresh}
        />
      ) : !visible.length ? (
        <div className="admin-card empty-state">
          <h2>لا توجد نتائج</h2>
          <p>لم نجد مستخدمين يطابقون الفلاتر الحالية.</p>
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="تحديد الصفحة"
                      checked={visible.every((user) => selected.has(user.id))}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          visible.forEach((user) =>
                            event.target.checked
                              ? next.add(user.id)
                              : next.delete(user.id),
                          );
                          return next;
                        })
                      }
                    />
                  </th>
                  <th>المستخدم</th>
                  <th>الأدوار</th>
                  <th>استثناءات السياسات</th>
                  <th>تاريخ الإنشاء</th>
                  <th>آخر دخول</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`تحديد ${user.displayName}`}
                        checked={selected.has(user.id)}
                        onChange={(event) =>
                          setSelected((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(user.id);
                            else next.delete(user.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td>
                      <strong>{user.displayName}</strong>
                      <small>{user.username}</small>
                    </td>
                    <td>{user.roles?.split(",").join("، ") || "دون دور"}</td>
                    <td>
                      <PolicyOverrideBadges overrides={user.policyOverrides} />
                    </td>
                    <td>
                      {new Date(user.createdAt).toLocaleDateString("ar-YE")}
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString("ar-YE")
                        : "لم يسجل"}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${user.isActive ? "published" : "archived"}`}
                      >
                        {user.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>
                    <td>
                      <Link
                        className="button secondary"
                        to={`/ar/admin/users/${user.id}/profile`}
                      >
                        فتح
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="admin-pagination" aria-label="صفحات المستخدمين">
            <button
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              السابق
            </button>
            <span>
              صفحة {page} من{" "}
              {Math.max(1, Math.ceil(filtered.length / pageSize))}
            </span>
            <button
              disabled={page >= Math.ceil(filtered.length / pageSize)}
              onClick={() => setPage((value) => value + 1)}
            >
              التالي
            </button>
          </nav>
        </>
      )}
    </section>
  );
}

function PolicyOverrideBadges({
  overrides,
}: {
  overrides: User["policyOverrides"];
}) {
  if (!overrides.length)
    return <span className="policy-overrides-empty">لا توجد</span>;
  return (
    <ul className="policy-override-badges" aria-label="استثناءات السياسات">
      {overrides.map((override) => (
        <li key={override.code}>{override.labelAr}</li>
      ))}
    </ul>
  );
}
