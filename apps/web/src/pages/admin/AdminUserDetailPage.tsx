import { useMemo, useState, type FormEvent } from "react";
import { Navigate, useParams } from "react-router-dom";
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

interface UserAccess {
  id: string;
  username: string;
  displayName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  failedLoginCount: number;
  roles: Array<{
    id: string;
    code: string;
    nameAr: string;
    descriptionAr: string;
    isSystem: boolean;
    isActive: boolean;
    assignedAt: string;
    assignedBy: string | null;
  }>;
  directOverrides: Array<{
    code: string;
    effect: "ALLOW" | "DENY";
    scope: string;
    reason: string;
    grantedAt: string;
    grantedBy: string | null;
  }>;
  effectivePermissions: PermissionItem[];
  policyOverrides: Array<{ code: string; labelAr: string }>;
  sessionSummary: { total: number; active: number };
  recentActivity: Activity[];
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
interface Role {
  id: string;
  code: string;
  nameAr: string;
  descriptionAr?: string;
}
interface Catalog {
  permissions: PermissionItem[];
}

export function AdminUserDetailPage() {
  const { id = "", tab = "profile" } = useParams();
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
  const roles = useApi<Role[]>(
    tabAllowed && tab === "roles" ? "/admin/roles" : null,
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
  const selectedRoles =
    roleSelection ?? new Set(user.data?.roles.map((role) => role.code) ?? []);
  const selectedOverrides = useMemo(
    () =>
      overrides ??
      new Map(
        user.data?.directOverrides.map((item) => [
          item.code,
          { effect: item.effect, scope: item.scope },
        ]) ?? [],
      ),
    [overrides, user.data],
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
      <AdminTabs
        label="تفاصيل المستخدم"
        items={[
          { label: "الملف الشخصي", to: `${base}/profile` },
          ...(auth.hasPermission("role.view")
            ? [
                {
                  label: "الأدوار",
                  to: `${base}/roles`,
                  count: data.roles.length,
                },
              ]
            : []),
          ...(auth.hasPermission("permission.view")
            ? [
                {
                  label: "الصلاحيات",
                  to: `${base}/permissions`,
                  count: data.directOverrides.length,
                },
                {
                  label: "الصلاحيات الفعالة",
                  to: `${base}/effective`,
                  count: data.effectivePermissions.filter(
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
                  count: data.sessionSummary.active,
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
        />
      )}
      {tab === "roles" && (
        <section className="admin-card">
          <h2>الأدوار المسندة</h2>
          <p>تُجمع صلاحيات جميع الأدوار النشطة لحساب الصلاحيات الفعالة.</p>
          {roles.loading ? (
            <LoadingCards />
          ) : roles.error ? (
            <ErrorPanel message={roles.error.message} retry={roles.retry} />
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
                  user.retry();
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
                {roles.data?.map((role) => {
                  const assignment = data.roles.find(
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
                        disabled={!auth.hasPermission("user.manage_roles")}
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
              {auth.hasPermission("user.manage_roles") && (
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
          <h2>الصلاحيات المباشرة</h2>
          <p>
            استخدم المنح أو الرفض المباشر للحالات الاستثنائية فقط. استثناءات
            سياسات سير العمل تدار حصريًا من صفحة السياسة.
          </p>
          {data.policyOverrides.length > 0 && (
            <div className="policy-context-note">
              <strong>استثناءات سياسات سير العمل:</strong>
              {data.policyOverrides.map((item) => (
                <span className="tag" key={item.code}>
                  {item.labelAr}
                </span>
              ))}
            </div>
          )}
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
                mode="user"
                userOverrides={selectedOverrides}
                onUserOverrideChange={
                  auth.hasPermission("user.manage_permissions")
                    ? setOverrides
                    : undefined
                }
              />
              {auth.hasPermission("user.manage_permissions") && (
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
                      user.retry();
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
          {catalog.loading ? (
            <LoadingCards />
          ) : (
            <PermissionExplorer
              permissions={data.effectivePermissions}
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
                    <th></th>
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
                          auth.hasPermission("user.sessions.revoke") && (
                            <button
                              className="button secondary danger"
                              onClick={async () => {
                                if (!window.confirm("إبطال هذه الجلسة الآن؟"))
                                  return;
                                try {
                                  await apiRequest(
                                    `/admin/users/${id}/sessions/${session.id}/revoke`,
                                    {
                                      body: {
                                        reason:
                                          "إبطال جلسة من صفحة إدارة المستخدم",
                                      },
                                    },
                                  );
                                  setMessage("أُبطلت الجلسة.");
                                  sessions.retry();
                                  user.retry();
                                } catch (error) {
                                  setMessage(
                                    error instanceof Error
                                      ? error.message
                                      : "تعذر إبطال الجلسة.",
                                  );
                                }
                              }}
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
    </section>
  );
}

function ProfileTab({
  user,
  auth,
  refresh,
  message,
}: {
  user: UserAccess;
  auth: ReturnType<typeof useAuth>;
  refresh: () => void;
  message: (value: string) => void;
}) {
  return (
    <div className="admin-detail-grid">
      <form
        className="admin-card settings-form"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await apiRequest(`/admin/users/${user.id}/profile`, {
              method: "PATCH",
              body: {
                displayName: form.get("displayName"),
                reason: form.get("reason"),
              },
            });
            message("حُفظ الملف الشخصي.");
            refresh();
          } catch (error) {
            message(error instanceof Error ? error.message : "تعذر الحفظ.");
          }
        }}
      >
        <h2>الملف الشخصي</h2>
        <label>
          اسم المستخدم
          <input value={user.username} readOnly dir="ltr" />
        </label>
        <label>
          الاسم الظاهر
          <input
            name="displayName"
            defaultValue={user.displayName}
            disabled={!auth.hasPermission("user.update")}
          />
        </label>
        {auth.hasPermission("user.update") && (
          <>
            <label>
              سبب التغيير
              <input name="reason" required />
            </label>
            <button className="button">حفظ الملف</button>
          </>
        )}
      </form>
      <section className="admin-card">
        <h2>حالة الحساب</h2>
        <dl className="admin-definition-list">
          <div>
            <dt>آخر دخول</dt>
            <dd>
              {user.lastLoginAt
                ? new Date(user.lastLoginAt).toLocaleString("ar-YE")
                : "لم يسجل"}
            </dd>
          </div>
          <div>
            <dt>محاولات فاشلة</dt>
            <dd>{user.failedLoginCount}</dd>
          </div>
          <div>
            <dt>الجلسات النشطة</dt>
            <dd>{user.sessionSummary.active}</dd>
          </div>
        </dl>
        {auth.hasPermission("user.disable") && (
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await apiRequest(`/admin/users/${user.id}/state`, {
                  method: "PATCH",
                  body: {
                    active: !user.isActive,
                    reason: "تغيير حالة الحساب من صفحة تفاصيل المستخدم",
                  },
                });
                message(user.isActive ? "عُطل الحساب." : "فُعل الحساب.");
                refresh();
              } catch (error) {
                message(
                  error instanceof Error ? error.message : "تعذر تغيير الحالة.",
                );
              }
            }}
          >
            {user.isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
          </button>
        )}
      </section>
      {auth.hasPermission("user.reset_password") && (
        <form
          className="admin-card settings-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const formElement = event.currentTarget;
            const form = new FormData(formElement);
            try {
              await apiRequest(`/admin/users/${user.id}/reset-password`, {
                body: {
                  password: form.get("password"),
                  reason: form.get("reason"),
                },
              });
              message("أعيد تعيين كلمة المرور وأُبطلت الجلسات.");
              formElement.reset();
            } catch (error) {
              message(
                error instanceof Error
                  ? error.message
                  : "تعذر إعادة تعيين كلمة المرور.",
              );
            }
          }}
        >
          <h2>إعادة تعيين كلمة المرور</h2>
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
          <button className="button secondary">إعادة التعيين</button>
        </form>
      )}
    </div>
  );
}
