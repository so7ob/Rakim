import { useMemo, useState, type FormEvent } from "react";
import {
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
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
import { AdminDialog } from "../../components/admin/AdminDialog";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { EntityDetails } from "../../components/admin/EntityDetails";

interface RoleDetail {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr: string | null;
  isSystem: boolean;
  isProtected?: boolean;
  canManage?: boolean;
  isActive: boolean;
  updatedAt: string;
}
type RolePermission = PermissionItem & { scope: string };
interface RoleUser {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  assignedAt: string;
  assignedBy: string | null;
}
interface RoleAudit {
  id: string;
  action: string;
  reason: string;
  occurredAt: string;
  actorName: string | null;
}
interface Catalog {
  permissions: PermissionItem[];
}

export function AdminRoleDetailPage() {
  const { id = "", tab = "general" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
  const rolePermissions = useApi<RolePermission[]>(
    tabAllowed && tab === "permissions"
      ? `/admin/access-roles/${id}/permissions`
      : null,
  );
  const roleUsers = useApi<RoleUser[]>(
    tabAllowed && tab === "users" ? `/admin/access-roles/${id}/users` : null,
  );
  const roleAudit = useApi<RoleAudit[]>(
    tabAllowed && tab === "activity" ? `/admin/access-roles/${id}/audit` : null,
  );
  const catalog = useApi<Catalog>(
    tabAllowed && tab === "permissions" ? "/admin/permissions" : null,
  );
  const [selection, setSelection] = useState<Map<string, string> | null>(null);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(() =>
    Boolean((location.state as { openEdit?: boolean } | null)?.openEdit),
  );
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const selected = useMemo(
    () =>
      selection ??
      new Map(
        rolePermissions.data?.map((item) => [item.code, item.scope]) ?? [],
      ),
    [selection, rolePermissions.data],
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
        eyebrow={
          data.isProtected
            ? "دور محمي"
            : data.isSystem
              ? "دور نظامي"
              : "دور مخصص"
        }
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
        actions={
          tab === "general" &&
          data.canManage &&
          auth.hasPermission("role.update") ? (
            <button
              type="button"
              className="button"
              onClick={() => setEditing(true)}
            >
              تعديل الدور
            </button>
          ) : undefined
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
                  count: rolePermissions.data?.length,
                },
              ]
            : []),
          ...(auth.hasPermission("user.view")
            ? [
                {
                  label: "المستخدمون",
                  to: `${base}/users`,
                  count: roleUsers.data?.length,
                },
              ]
            : []),
          ...(auth.hasPermission("audit.view")
            ? [
                {
                  label: "سجل التغييرات",
                  to: `${base}/activity`,
                  count: roleAudit.data?.length,
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
        <section className="admin-card">
          <h2>بيانات الدور</h2>
          <EntityDetails
            items={[
              { label: "الاسم", value: data.nameAr },
              { label: "الرمز", value: <code dir="ltr">{data.code}</code> },
              {
                label: "النوع",
                value: data.isProtected
                  ? "محمي"
                  : data.isSystem
                    ? "نظامي"
                    : "مخصص",
              },
              { label: "الحالة", value: data.isActive ? "فعال" : "معطل" },
              { label: "الوصف", value: data.descriptionAr || "—", wide: true },
              {
                label: "آخر تحديث",
                value: new Date(data.updatedAt).toLocaleString("ar-YE"),
              },
            ]}
          />
          {!data.isSystem &&
            data.canManage &&
            auth.hasPermission("role.delete") && (
              <button
                type="button"
                className="link-button danger"
                onClick={() => setDeleting(true)}
              >
                حذف الدور المخصص
              </button>
            )}
        </section>
      )}
      {editing && data.canManage && auth.hasPermission("role.update") && (
        <AdminDialog
          title={`تعديل ${data.nameAr}`}
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setSaving(true);
              setEditError("");
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
                setEditing(false);
                setMessage("حُفظت بيانات الدور.");
                role.retry();
              } catch (error) {
                setEditError(
                  error instanceof Error ? error.message : "تعذر الحفظ.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {editError && (
              <p className="form-error" role="alert">
                {editError}
              </p>
            )}
            <label>
              الاسم
              <input name="nameAr" defaultValue={data.nameAr} required />
            </label>
            <label>
              الحالة
              <select
                name="isActive"
                defaultValue={String(data.isActive)}
                disabled={data.isSystem}
              >
                <option value="true">فعال</option>
                <option value="false">معطل</option>
              </select>
            </label>
            <label>
              الوصف
              <textarea
                name="descriptionAr"
                defaultValue={data.descriptionAr ?? ""}
              />
            </label>
            <label>
              سبب التغيير
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
                {saving ? "جار الحفظ…" : "حفظ بيانات الدور"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title={`حذف الدور ${data.nameAr}؟`}
          description="لن يمكن استعادة الدور، ولا يسمح الخادم بحذف دور مسند إلى مستخدمين."
          confirmLabel="حذف الدور"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await apiRequest(`/admin/access-roles/${id}`, {
              method: "DELETE",
              body: { reason: "حذف دور مخصص بعد التحقق من عدم إسناده" },
            });
            navigate("/ar/admin/roles");
          }}
        />
      )}
      {tab === "permissions" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>صلاحيات الدور</h2>
              <p>
                {data.code === "SUPER"
                  ? "يرث هذا الدور جميع الصلاحيات الفعالة تلقائياً، بما فيها الصلاحيات المضافة لاحقاً. تبقى قواعد حماية السجلات وسير العمل مفروضة."
                  : "حدد الصلاحيات التي سيرثها كل مستخدم يحمل هذا الدور."}
              </p>
            </div>
          </div>
          {catalog.loading || rolePermissions.loading ? (
            <LoadingCards />
          ) : catalog.error || rolePermissions.error || !catalog.data ? (
            <ErrorPanel
              message={
                catalog.error?.message ??
                rolePermissions.error?.message ??
                "تعذر تحميل الصلاحيات."
              }
              retry={() => {
                catalog.retry();
                rolePermissions.retry();
              }}
            />
          ) : (
            <>
              <PermissionExplorer
                permissions={catalog.data.permissions}
                mode="role"
                roleSelection={selected}
                onRoleChange={
                  data.canManage &&
                  auth.hasPermission("role.permissions.manage")
                    ? setSelection
                    : undefined
                }
              />
              {data.canManage &&
                auth.hasPermission("role.permissions.manage") && (
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
                              selections: [...selected].map(
                                ([code, scope]) => ({
                                  code,
                                  scope,
                                }),
                              ),
                              reason: form.get("reason"),
                            },
                          },
                        );
                        setMessage(
                          "حُفظت صلاحيات الدور وأُبطلت جلسات المستخدمين المتأثرين.",
                        );
                        setSelection(null);
                        rolePermissions.retry();
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
          {roleUsers.loading ? (
            <LoadingCards />
          ) : roleUsers.error ? (
            <ErrorPanel
              message={roleUsers.error.message}
              retry={roleUsers.retry}
            />
          ) : roleUsers.data?.length ? (
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
                  {roleUsers.data.map((user) => (
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
          {roleAudit.loading ? (
            <LoadingCards />
          ) : roleAudit.error ? (
            <ErrorPanel
              message={roleAudit.error.message}
              retry={roleAudit.retry}
            />
          ) : roleAudit.data?.length ? (
            <div className="audit-list full">
              {roleAudit.data.map((item) => (
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
