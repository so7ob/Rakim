import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import {
  PermissionExplorer,
  type PermissionItem,
} from "../../components/admin/PermissionExplorer";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import { UnsavedChangesGuard } from "../../components/admin/UnsavedChangesGuard";

interface RoleDetail {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr: string | null;
  isSystem: boolean;
  isActive: boolean;
  updatedAt: string;
  permissions: Array<PermissionItem & { scope: string }>;
  users: Array<{
    id: string;
    username: string;
    displayName: string;
    isActive: boolean;
    assignedAt: string;
    assignedBy: string | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    reason: string;
    occurredAt: string;
    actorName: string | null;
  }>;
}
interface Catalog {
  permissions: PermissionItem[];
}

export function AdminRoleDetailPage() {
  const { id = "", tab = "general" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const tabAllowed =
    (
      {
        general: true,
        permissions: auth.hasPermission("permission.view"),
        users: auth.hasPermission("user.view"),
        activity: auth.hasPermission("audit.view"),
      } as Record<string, boolean>
    )[tab] ?? false;
  const role = useApi<RoleDetail>(id ? `/admin/access-roles/${id}` : null);
  const catalog = useApi<Catalog>(
    tabAllowed && tab === "permissions" ? "/admin/permissions" : null,
  );
  const [selection, setSelection] = useState<Map<string, string> | null>(null);
  const [message, setMessage] = useState("");
  const selected = useMemo(
    () =>
      selection ??
      new Map(
        role.data?.permissions.map((item) => [item.code, item.scope]) ?? [],
      ),
    [selection, role.data],
  );
  if (!tabAllowed) return <Navigate to="/ar/admin/no-permission" replace />;
  if (role.loading) return <LoadingCards />;
  if (role.error || !role.data)
    return (
      <ErrorPanel
        message={role.error?.message ?? "تعذر تحميل الدور."}
        retry={role.retry}
      />
    );
  const data = role.data;
  const base = `/ar/admin/roles/${id}`;
  return (
    <section>
      <AdminPageHeader
        eyebrow={data.isSystem ? "دور نظامي محمي" : "دور مخصص"}
        title={data.nameAr}
        description={data.descriptionAr ?? data.code}
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "الأدوار", to: "/ar/admin/roles" },
          { label: data.nameAr },
        ]}
        status={
          <span
            className={`status-badge ${data.isActive ? "published" : "archived"}`}
          >
            {data.isActive ? "فعال" : "معطل"}
          </span>
        }
      />
      <AdminTabs
        label="تفاصيل الدور"
        items={[
          { label: "عام", to: `${base}/general` },
          ...(auth.hasPermission("permission.view")
            ? [
                {
                  label: "الصلاحيات",
                  to: `${base}/permissions`,
                  count: data.permissions.length,
                },
              ]
            : []),
          ...(auth.hasPermission("user.view")
            ? [
                {
                  label: "المستخدمون",
                  to: `${base}/users`,
                  count: data.users.length,
                },
              ]
            : []),
          ...(auth.hasPermission("audit.view")
            ? [
                {
                  label: "سجل التغييرات",
                  to: `${base}/activity`,
                  count: data.audit.length,
                },
              ]
            : []),
        ]}
      />
      <UnsavedChangesGuard active={selection !== null} />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {tab === "general" && (
        <form
          className="admin-card settings-form"
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            try {
              await apiRequest(`/admin/access-roles/${id}`, {
                method: "PATCH",
                body: {
                  nameAr: form.get("nameAr"),
                  descriptionAr: form.get("descriptionAr"),
                  isActive: form.get("isActive") === "true",
                  reason: form.get("reason"),
                },
              });
              setMessage("حُفظت بيانات الدور.");
              role.retry();
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "تعذر الحفظ.",
              );
            }
          }}
        >
          <h2>بيانات الدور</h2>
          <div className="form-columns">
            <label>
              الاسم
              <input
                name="nameAr"
                defaultValue={data.nameAr}
                required
                disabled={!auth.hasPermission("role.update")}
              />
            </label>
            <label>
              الرمز
              <input dir="ltr" value={data.code} readOnly />
            </label>
            <label>
              الحالة
              <select
                name="isActive"
                defaultValue={String(data.isActive)}
                disabled={data.isSystem || !auth.hasPermission("role.update")}
              >
                <option value="true">فعال</option>
                <option value="false">معطل</option>
              </select>
            </label>
          </div>
          <label>
            الوصف
            <textarea
              name="descriptionAr"
              defaultValue={data.descriptionAr ?? ""}
              disabled={!auth.hasPermission("role.update")}
            />
          </label>
          {auth.hasPermission("role.update") && (
            <>
              <label>
                سبب التغيير
                <input name="reason" required />
              </label>
              <button className="button">حفظ بيانات الدور</button>
            </>
          )}
          {!data.isSystem && auth.hasPermission("role.delete") && (
            <button
              type="button"
              className="link-button danger"
              onClick={async () => {
                if (
                  !window.confirm(
                    "لن يمكن استعادة الدور بعد الحذف. هل تريد المتابعة؟",
                  )
                )
                  return;
                try {
                  await apiRequest(`/admin/access-roles/${id}`, {
                    method: "DELETE",
                    body: { reason: "حذف دور مخصص بعد التحقق من عدم إسناده" },
                  });
                  navigate("/ar/admin/roles");
                } catch (error) {
                  setMessage(
                    error instanceof Error ? error.message : "تعذر الحذف.",
                  );
                }
              }}
            >
              حذف الدور المخصص
            </button>
          )}
        </form>
      )}
      {tab === "permissions" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>صلاحيات الدور</h2>
              <p>حدد الصلاحيات التي سيرثها كل مستخدم يحمل هذا الدور.</p>
            </div>
          </div>
          {catalog.loading ? (
            <LoadingCards />
          ) : catalog.error || !catalog.data ? (
            <ErrorPanel
              message={catalog.error?.message ?? "تعذر تحميل الصلاحيات."}
              retry={catalog.retry}
            />
          ) : (
            <>
              <PermissionExplorer
                permissions={catalog.data.permissions}
                mode="role"
                roleSelection={selected}
                onRoleChange={
                  auth.hasPermission("role.manage_permissions")
                    ? setSelection
                    : undefined
                }
              />
              {auth.hasPermission("role.manage_permissions") && (
                <form
                  className="permission-savebar"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    try {
                      await apiRequest(
                        `/admin/access-roles/${id}/permissions`,
                        {
                          method: "PATCH",
                          body: {
                            selections: [...selected].map(([code, scope]) => ({
                              code,
                              scope,
                            })),
                            reason: form.get("reason"),
                          },
                        },
                      );
                      setMessage(
                        "حُفظت صلاحيات الدور وأُبطلت جلسات المستخدمين المتأثرين.",
                      );
                      setSelection(null);
                      role.retry();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "تعذر حفظ الصلاحيات.",
                      );
                    }
                  }}
                >
                  <label>
                    سبب التغيير
                    <input name="reason" required />
                  </label>
                  <button className="button" disabled={selection === null}>
                    حفظ صلاحيات الدور
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      )}
      {tab === "users" && (
        <section className="admin-card">
          <h2>المستخدمون المسند إليهم الدور</h2>
          {data.users.length ? (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>الحالة</th>
                    <th>تاريخ الإسناد</th>
                    <th>بواسطة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <a href={`/ar/admin/users/${user.id}/profile`}>
                          <strong>{user.displayName}</strong>
                          <small>{user.username}</small>
                        </a>
                      </td>
                      <td>{user.isActive ? "نشط" : "معطل"}</td>
                      <td>
                        {new Date(user.assignedAt).toLocaleString("ar-YE")}
                      </td>
                      <td>{user.assignedBy ?? "ترحيل سابق"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-empty-inline">
              لم يُسند هذا الدور إلى مستخدم.
            </div>
          )}
        </section>
      )}
      {tab === "activity" && (
        <section className="admin-card">
          <h2>سجل تغييرات الدور</h2>
          {data.audit.length ? (
            <div className="audit-list full">
              {data.audit.map((item) => (
                <article key={item.id}>
                  <strong>{item.action}</strong>
                  <p>{item.reason}</p>
                  <small>
                    {item.actorName ?? "النظام"} —{" "}
                    {new Date(item.occurredAt).toLocaleString("ar-YE")}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <div className="admin-empty-inline">
              لا توجد تغييرات مسجلة لهذا الدور.
            </div>
          )}
        </section>
      )}
    </section>
  );
}
