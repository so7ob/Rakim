import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { useMemo, useState, type FormEvent } from "react";
import {
  Navigate,
  Link,
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

interface UserAccess {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  failedLoginCount: number;
  canManage: boolean;
}
interface UserRole {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr: string;
  isSystem: boolean;
  isProtected?: boolean;
  isActive: boolean;
  assignedAt: string;
  assignedBy: string | null;
}
interface AssignableRole {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr: string | null;
  isSystem: boolean;
  isProtected: boolean;
  isActive: boolean;
  authorityLevel: number;
}
interface UserRolesAccess {
  assigned: UserRole[];
  assignable: AssignableRole[];
}
interface UserPermissionAccess {
  policyOverrides?: Array<{ code: string; labelAr: string; reason: string }>;
  directOverrides: Array<{
    code: string;
    effect: "ALLOW" | "DENY";
    scope: string;
    reason: string;
    grantedAt: string;
    grantedBy: string | null;
  }>;
  effectivePermissions: PermissionItem[];
}
interface Activity {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  occurredAt: string;
}
interface Session {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  expired: boolean;
}
interface Catalog {
  permissions: PermissionItem[];
}

export function AdminUserDetailPage() {
  const { id = "", tab = "profile" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  const allowedTabs: Record<string, boolean> = {
    profile: true,
    roles: auth.hasPermission("role.view"),
    permissions: auth.hasPermission("permission.view"),
    effective: auth.hasPermission("permission.view"),
    activity: auth.hasPermission("user.activity.view"),
    sessions: auth.hasPermission("user.sessions.view"),
  };
  const tabAllowed = allowedTabs[tab] ?? false;
  const user = useApi<UserAccess>(id ? `/admin/users/${id}/access` : null);
  const userRoles = useApi<UserRolesAccess>(
    tabAllowed && tab === "roles" ? `/admin/users/${id}/roles` : null,
  );
  const permissionAccess = useApi<UserPermissionAccess>(
    tabAllowed && ["permissions", "effective"].includes(tab)
      ? `/admin/users/${id}/permissions`
      : null,
  );
  const catalog = useApi<Catalog>(
    tabAllowed && ["permissions", "effective"].includes(tab)
      ? "/admin/permissions"
      : null,
  );
  const activity = useApi<{ items: Activity[]; meta: { total: number } }>(
    tabAllowed && tab === "activity" ? `/admin/users/${id}/activity` : null,
  );
  const sessions = useApi<Session[]>(
    tabAllowed && tab === "sessions" ? `/admin/users/${id}/sessions` : null,
  );
  const [roleSelection, setRoleSelection] = useState<Set<string> | null>(null);
  const [overrides, setOverrides] = useState<Map<
    string,
    { effect: "ALLOW" | "DENY"; scope: string }
  > | null>(null);
  const [message, setMessage] = useState("");
  const [sessionToRevoke, setSessionToRevoke] = useState<Session | null>(null);
  const selectedRoles =
    roleSelection ??
    new Set(userRoles.data?.assigned.map((role) => role.code) ?? []);
  const displayedRoles = useMemo(() => {
    const result = new Map<string, UserRole | AssignableRole>();
    for (const role of userRoles.data?.assigned ?? [])
      result.set(role.code, role);
    for (const role of userRoles.data?.assignable ?? [])
      result.set(role.code, role);
    return [...result.values()];
  }, [userRoles.data]);
  const selectedOverrides = useMemo(
    () =>
      overrides ??
      new Map(
        permissionAccess.data?.directOverrides.map((item) => [
          item.code,
          { effect: item.effect, scope: item.scope },
        ]) ?? [],
      ),
    [overrides, permissionAccess.data],
  );
  if (!tabAllowed) return <Navigate to="/ar/admin/no-permission" replace />;
  if (user.loading) return <LoadingCards />;
  if (user.error || !user.data)
    return (
      <ErrorPanel
        message={user.error?.message ?? "تعذر تحميل المستخدم."}
        retry={user.retry}
      />
    );
  const data = user.data;
  const base = `/ar/admin/users/${id}`;
  return (
    <section>
      <AdminPageHeader
        eyebrow={`@${data.username}`}
        title={data.displayName}
        description={`أُنشئ الحساب في ${new Date(data.createdAt).toLocaleDateString("ar-YE")}`}
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "المستخدمون", to: "/ar/admin/users" },
          { label: data.displayName },
        ]}
        status={
          <span
            className={`status-badge ${data.isActive ? "published" : "archived"}`}
          >
            {data.isActive ? "نشط" : "معطل"}
          </span>
        }
      />
      {data.canManage && (
        <div className="admin-entity-actions">
          <LifecycleActions
            kind="users"
            allowState={false}
            id={id}
            label={data.displayName}
            onDone={(action) => {
              if (action === "delete") navigate("/ar/admin/users");
              else user.retry();
            }}
          />
        </div>
      )}
      <AdminTabs
        label="تفاصيل المستخدم"
        items={[
          { label: "الملف الشخصي", to: `${base}/profile` },
          ...(auth.hasPermission("role.view")
            ? [
                {
                  label: "الأدوار",
                  to: `${base}/roles`,
                  count: userRoles.data?.assigned.length,
                },
              ]
            : []),
          ...(auth.hasPermission("permission.view")
            ? [
                {
                  label: "الصلاحيات",
                  to: `${base}/permissions`,
                  count: permissionAccess.data?.directOverrides.length,
                },
                {
                  label: "الصلاحيات الفعالة",
                  to: `${base}/effective`,
                  count: permissionAccess.data?.effectivePermissions.filter(
                    (item) => item.allowed,
                  ).length,
                },
              ]
            : []),
          ...(auth.hasPermission("user.activity.view")
            ? [{ label: "النشاط", to: `${base}/activity` }]
            : []),
          ...(auth.hasPermission("user.sessions.view")
            ? [
                {
                  label: "الجلسات",
                  to: `${base}/sessions`,
                },
              ]
            : []),
        ]}
      />
      <UnsavedChangesGuard
        active={roleSelection !== null || overrides !== null}
      />
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {tab === "profile" && (
        <ProfileTab
          user={data}
          auth={auth}
          refresh={user.retry}
          message={setMessage}
          openEdit={Boolean(
            (location.state as { openEdit?: boolean } | null)?.openEdit,
          )}
        />
      )}
      {tab === "roles" && (
        <section className="admin-card">
          <h2>الأدوار المسندة</h2>
          <p>تُجمع صلاحيات جميع الأدوار النشطة لحساب الصلاحيات الفعالة.</p>
          {userRoles.loading ? (
            <LoadingCards />
          ) : userRoles.error ? (
            <ErrorPanel
              message={userRoles.error.message}
              retry={userRoles.retry}
            />
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  await apiRequest(`/admin/users/${id}/roles`, {
                    method: "PATCH",
                    body: {
                      roles: [...selectedRoles],
                      reason: form.get("reason"),
                    },
                  });
                  setMessage("حُفظت الأدوار وأُبطلت جلسات المستخدم.");
                  setRoleSelection(null);
                  userRoles.retry();
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "تعذر حفظ الأدوار.",
                  );
                }
              }}
            >
              <div className="role-assignment-grid">
                {displayedRoles.map((role) => {
                  const assignment = userRoles.data?.assigned.find(
                    (item) => item.code === role.code,
                  );
                  const assignable = userRoles.data?.assignable.some(
                    (item) => item.code === role.code,
                  );
                  return (
                    <label
                      key={role.id}
                      className={selectedRoles.has(role.code) ? "selected" : ""}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.has(role.code)}
                        disabled={
                          !data.canManage ||
                          !auth.hasPermission("user.roles.manage") ||
                          !assignable ||
                          role.isProtected
                        }
                        onChange={(event) =>
                          setRoleSelection((current) => {
                            const next = new Set(current ?? selectedRoles);
                            if (event.target.checked) next.add(role.code);
                            else next.delete(role.code);
                            return next;
                          })
                        }
                      />
                      <span>
                        <strong>{role.nameAr}</strong>
                        <code dir="ltr">{role.code}</code>
                        <small>{role.descriptionAr}</small>
                        {assignment && (
                          <small>
                            مسند في{" "}
                            {new Date(assignment.assignedAt).toLocaleDateString(
                              "ar-YE",
                            )}{" "}
                            · {assignment.assignedBy ?? "ترحيل سابق"}
                          </small>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {data.canManage && auth.hasPermission("user.roles.manage") && (
                <div className="permission-savebar">
                  <label>
                    سبب التغيير
                    <input name="reason" required />
                  </label>
                  <button className="button" disabled={roleSelection === null}>
                    حفظ الأدوار
                  </button>
                </div>
              )}
            </form>
          )}
        </section>
      )}
      {tab === "permissions" && (
        <section className="admin-card">
          <h2>استثناءات السياسات</h2>
          <p>للقراءة فقط؛ تُدار الاستثناءات من تبويب السياسة.</p>
          <ul>
            {permissionAccess.data?.policyOverrides?.map((policy) => (
              <li key={policy.code}>
                {policy.labelAr} — {policy.reason}{" "}
                {auth.hasPermission("workflow_policy.view") && (
                  <Link
                    to={`/ar/admin/settings/workflow?policy=${policy.code}`}
                  >
                    عرض السياسة
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <h2>الصلاحيات المباشرة</h2>
          <p>
            استخدم المنح أو الرفض المباشر للحالات الاستثنائية فقط. استثناءات
            سياسات سير العمل تدار حصريًا من صفحة السياسة.
          </p>
          {catalog.loading || permissionAccess.loading ? (
            <LoadingCards />
          ) : catalog.error || permissionAccess.error || !catalog.data ? (
            <ErrorPanel
              message={
                catalog.error?.message ??
                permissionAccess.error?.message ??
                "تعذر تحميل الصلاحيات."
              }
              retry={() => {
                catalog.retry();
                permissionAccess.retry();
              }}
            />
          ) : (
            <>
              <PermissionExplorer
                permissions={catalog.data.permissions}
                mode="user"
                userOverrides={selectedOverrides}
                onUserOverrideChange={
                  data.canManage &&
                  auth.hasPermission("user.permissions.manage")
                    ? setOverrides
                    : undefined
                }
              />
              {data.canManage &&
                auth.hasPermission("user.permissions.manage") && (
                  <form
                    className="permission-savebar"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      try {
                        await apiRequest(
                          `/admin/users/${id}/granular-permissions`,
                          {
                            method: "PATCH",
                            body: {
                              selections: [...selectedOverrides].map(
                                ([code, value]) => ({ code, ...value }),
                              ),
                              reason: form.get("reason"),
                            },
                          },
                        );
                        setMessage(
                          "حُفظت الصلاحيات المباشرة وأُبطلت جلسات المستخدم.",
                        );
                        setOverrides(null);
                        permissionAccess.retry();
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
                    <button className="button" disabled={overrides === null}>
                      حفظ الصلاحيات المباشرة
                    </button>
                  </form>
                )}
            </>
          )}
        </section>
      )}
      {tab === "effective" && (
        <section className="admin-card">
          <h2>الصلاحيات الفعالة</h2>
          <p>
            النتيجة النهائية بعد دمج الأدوار والمنح والرفض المباشر. الرفض
            المباشر يتقدم على الدور.
          </p>
          {catalog.loading || permissionAccess.loading ? (
            <LoadingCards />
          ) : permissionAccess.error ? (
            <ErrorPanel
              message={permissionAccess.error.message}
              retry={permissionAccess.retry}
            />
          ) : (
            <PermissionExplorer
              permissions={permissionAccess.data?.effectivePermissions ?? []}
              mode="effective"
            />
          )}
        </section>
      )}
      {tab === "activity" && (
        <section className="admin-card">
          <h2>النشاط وسجل التغييرات</h2>
          {activity.loading ? (
            <LoadingCards />
          ) : activity.error ? (
            <ErrorPanel
              message={activity.error.message}
              retry={activity.retry}
            />
          ) : !activity.data?.items.length ? (
            <div className="admin-empty-inline">لا يوجد نشاط مسجل.</div>
          ) : (
            <div className="audit-list full">
              {activity.data.items.map((item) => (
                <article key={item.id}>
                  <strong>{item.action}</strong>
                  <p>{item.reason}</p>
                  <small>
                    {item.entityType} ·{" "}
                    {new Date(item.occurredAt).toLocaleString("ar-YE")}
                  </small>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "sessions" && (
        <section className="admin-card">
          <h2>جلسات المستخدم</h2>
          {sessions.loading ? (
            <LoadingCards />
          ) : sessions.error ? (
            <ErrorPanel
              message={sessions.error.message}
              retry={sessions.retry}
            />
          ) : !sessions.data?.length ? (
            <div className="admin-empty-inline">لا توجد جلسات.</div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>بدأت</th>
                    <th>آخر نشاط</th>
                    <th>تنتهي</th>
                    <th>الحالة</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.data.map((session) => (
                    <tr key={session.id}>
                      <td>
                        {new Date(session.createdAt).toLocaleString("ar-YE")}
                      </td>
                      <td>
                        {new Date(session.lastSeenAt).toLocaleString("ar-YE")}
                      </td>
                      <td>
                        {new Date(session.expiresAt).toLocaleString("ar-YE")}
                      </td>
                      <td>
                        {session.revokedAt
                          ? "مبطلة"
                          : session.expired
                            ? "منتهية"
                            : "نشطة"}
                      </td>
                      <td>
                        {!session.revokedAt &&
                          !session.expired &&
                          data.canManage &&
                          auth.hasPermission("user.sessions.revoke") && (
                            <button
                              className="button secondary danger"
                              onClick={() => setSessionToRevoke(session)}
                            >
                              إبطال
                            </button>
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {sessionToRevoke && (
        <ConfirmDialog
          title="إبطال جلسة المستخدم؟"
          description={`بدأت الجلسة في ${new Date(sessionToRevoke.createdAt).toLocaleString("ar-YE")}. سيفقد الجهاز المرتبط بها الوصول فورًا.`}
          confirmLabel="إبطال الجلسة"
          onClose={() => setSessionToRevoke(null)}
          onConfirm={async () => {
            await apiRequest(
              `/admin/users/${id}/sessions/${sessionToRevoke.id}/revoke`,
              { body: { reason: "إبطال جلسة من صفحة إدارة المستخدم" } },
            );
            setSessionToRevoke(null);
            setMessage("أُبطلت الجلسة.");
            sessions.retry();
            user.retry();
          }}
        />
      )}
    </section>
  );
}

function ProfileTab({
  user,
  auth,
  refresh,
  message,
  openEdit,
}: {
  user: UserAccess;
  auth: ReturnType<typeof useAuth>;
  refresh: () => void;
  message: (value: string) => void;
  openEdit: boolean;
}) {
  const [editing, setEditing] = useState(
    openEdit && user.canManage && auth.hasPermission("user.update"),
  );
  const [resetting, setResetting] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canChangeState =
    user.canManage &&
    auth.hasPermission(user.isActive ? "user.disable" : "user.enable");
  return (
    <div className="admin-detail-grid">
      <section className="admin-card">
        <h2>الملف الشخصي</h2>
        <EntityDetails
          items={[
            {
              label: "اسم المستخدم",
              value: <code dir="ltr">{user.username}</code>,
            },
            { label: "الاسم الظاهر", value: user.displayName },
            {
              label: "تاريخ الإنشاء",
              value: new Date(user.createdAt).toLocaleString("ar-YE"),
            },
            { label: "الحالة", value: user.isActive ? "نشط" : "معطل" },
          ]}
        />
        {user.canManage && auth.hasPermission("user.update") && (
          <div className="admin-entity-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(true)}
            >
              تعديل الملف
            </button>
          </div>
        )}
      </section>
      <section className="admin-card">
        <h2>حالة الحساب</h2>
        <EntityDetails
          items={[
            {
              label: "آخر دخول",
              value: user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString("ar-YE")
                : "لم يسجل",
            },
            { label: "محاولات فاشلة", value: user.failedLoginCount },
            {
              label: "الجلسات",
              value: "تُعرض من تبويب الجلسات عند توفر الصلاحية.",
            },
          ]}
        />
        <div className="admin-entity-actions">
          {canChangeState && (
            <button
              type="button"
              className={`button secondary${user.isActive ? " danger" : ""}`}
              onClick={() => setChangingState(true)}
            >
              {user.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
            </button>
          )}
          {user.canManage && auth.hasPermission("user.reset_password") && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setResetting(true)}
            >
              إعادة تعيين كلمة المرور
            </button>
          )}
        </div>
      </section>
      {editing && user.canManage && auth.hasPermission("user.update") && (
        <AdminDialog
          title="تعديل الملف الشخصي"
          onClose={() => setEditing(false)}
        >
          <form
            className="edit-form"
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              setSubmitting(true);
              setError("");
              try {
                await apiRequest(`/admin/users/${user.id}/profile`, {
                  method: "PATCH",
                  body: {
                    displayName: form.get("displayName"),
                    reason: form.get("reason"),
                  },
                });
                setEditing(false);
                message("حُفظ الملف الشخصي.");
                refresh();
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : "تعذر الحفظ.",
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <label>
              الاسم الظاهر
              <input
                name="displayName"
                defaultValue={user.displayName}
                required
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
                disabled={submitting}
              >
                إلغاء
              </button>
              <button className="button" disabled={submitting}>
                {submitting ? "جار الحفظ…" : "حفظ الملف"}
              </button>
            </div>
          </form>
        </AdminDialog>
      )}
      {resetting &&
        user.canManage &&
        auth.hasPermission("user.reset_password") && (
          <AdminDialog
            title="إعادة تعيين كلمة المرور"
            description="سيبطل الخادم جميع جلسات المستخدم بعد نجاح العملية."
            onClose={() => setResetting(false)}
          >
            <form
              className="edit-form"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                setSubmitting(true);
                setError("");
                try {
                  await apiRequest(`/admin/users/${user.id}/reset-password`, {
                    body: {
                      password: form.get("password"),
                      reason: form.get("reason"),
                    },
                  });
                  setResetting(false);
                  message("أعيد تعيين كلمة المرور وأُبطلت الجلسات.");
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "تعذر إعادة تعيين كلمة المرور.",
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <label>
                كلمة المرور الجديدة
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label>
                سبب الإجراء
                <input name="reason" required />
              </label>
              <div className="admin-entity-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setResetting(false)}
                  disabled={submitting}
                >
                  إلغاء
                </button>
                <button className="button" disabled={submitting}>
                  {submitting ? "جار التنفيذ…" : "إعادة التعيين"}
                </button>
              </div>
            </form>
          </AdminDialog>
        )}
      {changingState && canChangeState && (
        <ConfirmDialog
          title={`${user.isActive ? "تعطيل" : "تفعيل"} الحساب؟`}
          description={
            user.isActive
              ? "سيمنع المستخدم من الدخول وتبطل جلساته وفق سياسة الخادم."
              : "سيتمكن المستخدم من تسجيل الدخول مجددًا."
          }
          confirmLabel={user.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
          destructive={user.isActive}
          onClose={() => setChangingState(false)}
          onConfirm={async () => {
            await apiRequest(`/admin/users/${user.id}/state`, {
              method: "PATCH",
              body: {
                active: !user.isActive,
                reason: "تغيير حالة الحساب من صفحة تفاصيل المستخدم",
              },
            });
            setChangingState(false);
            message(user.isActive ? "عُطل الحساب." : "فُعل الحساب.");
            refresh();
          }}
        />
      )}
    </div>
  );
}
