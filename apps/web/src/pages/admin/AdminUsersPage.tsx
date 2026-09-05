import { useState, type FormEvent } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";

interface User {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean | number;
  lastLoginAt: string | null;
  failedLoginCount: number;
  roles: string;
  policyOverrides: Array<{ code: string; labelAr: string }>;
}
interface Role {
  id: string;
  code: string;
  nameAr: string;
}
const roleLabels: Record<string, string> = {
  READER: "قارئ/باحث",
  DATA_ENTRY: "مدخل بيانات",
  LEGAL_REVIEWER: "مراجع قانوني",
  CONTENT_MANAGER: "مدير محتوى",
  SYSTEM_ADMIN: "مدير نظام",
};

export function AdminUsersPage() {
  const users = useApi<User[]>("/admin/users");
  const roles = useApi<Role[]>("/admin/roles");
  const [msg, setMsg] = useState("");
  const refresh = () => {
    users.retry();
    roles.retry();
  };
  const toggle = async (user: User) => {
    try {
      await apiRequest(`/admin/users/${user.id}/state`, {
        method: "PATCH",
        body: {
          active: !Boolean(user.isActive),
          reason: "تغيير حالة الحساب من لوحة إدارة المستخدمين",
        },
      });
      setMsg("حُدثت حالة الحساب وأبطلت جلساته عند التعطيل.");
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر التحديث.");
    }
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
      setMsg("أُنشئ الحساب. يجب تغيير كلمة مروره الأولية بأسرع وقت.");
      formElement.reset();
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر إنشاء الحساب.");
    }
  };
  return (
    <section>
      <header className="admin-title">
        <div>
          <span className="eyebrow dark">أقل صلاحية ممكنة</span>
          <h1>المستخدمون والأدوار</h1>
        </div>
      </header>
      <form className="admin-card edit-form" onSubmit={create}>
        <h2>إنشاء حساب</h2>
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
          {roles.data?.map((role) => (
            <label key={role.id}>
              <input type="checkbox" name="roles" value={role.code} />
              {role.nameAr}
            </label>
          ))}
        </fieldset>
        <button className="button">إنشاء الحساب</button>
      </form>
      {msg && (
        <p role="status" className="form-message">
          {msg}
        </p>
      )}
      {users.loading || roles.loading ? (
        <LoadingCards />
      ) : users.error || roles.error ? (
        <ErrorPanel
          message={(users.error ?? roles.error)!.message}
          retry={refresh}
        />
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>المستخدم</th>
                <th>الأدوار</th>
                <th>استثناءات السياسات</th>
                <th>آخر دخول</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.data?.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.displayName}</strong>
                    <small>{user.username}</small>
                  </td>
                  <td>
                    <RoleEditor
                      user={user}
                      allRoles={roles.data ?? []}
                      done={(message) => {
                        setMsg(message);
                        refresh();
                      }}
                    />
                  </td>
                  <td>
                    {user.policyOverrides.length
                      ? user.policyOverrides.map((override) => (
                          <span className="tag" key={override.code}>
                            {override.labelAr}
                          </span>
                        ))
                      : "لا توجد"}
                  </td>
                  <td>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString("ar-YE")
                      : "لم يسجل"}
                  </td>
                  <td>{user.isActive ? "نشط" : "معطل"}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="button secondary"
                        onClick={() => toggle(user)}
                      >
                        {user.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                      <PasswordReset user={user} done={setMsg} />
                    </div>
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

function RoleEditor({
  user,
  allRoles,
  done,
}: {
  user: User;
  allRoles: Role[];
  done: (message: string) => void;
}) {
  const [current, setCurrent] = useState(
    user.roles ? user.roles.split(",") : [],
  );
  const save = async () => {
    try {
      await apiRequest(`/admin/users/${user.id}/roles`, {
        method: "PATCH",
        body: { roles: current, reason: "تحديث الأدوار وفق مبدأ أقل صلاحية" },
      });
      done("حُدثت الأدوار وأبطلت الجلسات القديمة.");
    } catch (e) {
      done(e instanceof Error ? e.message : "تعذر تحديث الأدوار.");
    }
  };
  return (
    <details className="role-editor">
      <summary>
        {current.map((code) => roleLabels[code] ?? code).join("، ") ||
          "دون دور"}
      </summary>
      {allRoles.map((role) => (
        <label key={role.id}>
          <input
            type="checkbox"
            checked={current.includes(role.code)}
            onChange={(event) =>
              setCurrent((value) =>
                event.target.checked
                  ? [...value, role.code]
                  : value.filter((code) => code !== role.code),
              )
            }
          />
          {role.nameAr}
        </label>
      ))}
      <button className="button secondary" onClick={save}>
        حفظ الأدوار
      </button>
    </details>
  );
}

function PasswordReset({
  user,
  done,
}: {
  user: User;
  done: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="link-button"
        onClick={() => setOpen((value) => !value)}
      >
        كلمة المرور
      </button>
      {open && (
        <form
          className="password-reset"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await apiRequest(`/admin/users/${user.id}/reset-password`, {
                body: {
                  password: form.get("password"),
                  reason: "إعادة تعيين كلمة المرور بطلب إداري",
                },
              });
              done("أعيد تعيين كلمة المرور وأبطلت جلسات الحساب.");
              setOpen(false);
            } catch (e) {
              done(e instanceof Error ? e.message : "تعذر إعادة التعيين.");
            }
          }}
        >
          <label>
            <span className="sr-only">
              كلمة المرور الجديدة لـ {user.username}
            </span>
            <input
              name="password"
              type="password"
              minLength={12}
              required
              placeholder="كلمة مرور جديدة"
              autoComplete="new-password"
            />
          </label>
          <button className="button secondary">حفظ</button>
        </form>
      )}
    </>
  );
}
