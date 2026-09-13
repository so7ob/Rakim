import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import {
  PermissionExplorer,
  type PermissionItem,
} from "../../components/admin/PermissionExplorer";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import type { AccessRole } from "./AdminRolesPage";

interface Catalog {
  permissions: PermissionItem[];
  roles: AccessRole[];
}

export function AdminPermissionsPage() {
  const { tab = "matrix" } = useParams();
  const auth = useAuth();
  const catalog = useApi<Catalog>("/admin/permissions");
  return (
    <section>
      <AdminPageHeader
        eyebrow="Resource · Action · Scope"
        title="نموذج الصلاحيات"
        description="مرجع تحليلي لكل صلاحيات النظام ومستوى حساسيتها. تعديل المنح يتم من الدور أو من تبويب صلاحيات المستخدم."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "المستخدمون والوصول" },
          { label: "الصلاحيات" },
        ]}
        actions={
          auth.hasPermission("role.view") ? (
            <Link className="button secondary" to="/ar/admin/roles">
              إدارة الأدوار والمنح
            </Link>
          ) : undefined
        }
      />
      <AdminTabs
        label="استعراض الصلاحيات"
        items={[
          { label: "مصفوفة الصلاحيات", to: "/ar/admin/permissions/matrix" },
          { label: "حسب الموارد", to: "/ar/admin/permissions/resources" },
          { label: "حسب الأدوار", to: "/ar/admin/permissions/roles" },
          { label: "الصلاحيات الحساسة", to: "/ar/admin/permissions/sensitive" },
        ]}
      />
      {catalog.loading ? (
        <LoadingCards />
      ) : catalog.error || !catalog.data ? (
        <ErrorPanel
          message={catalog.error?.message ?? "تعذر تحميل نموذج الصلاحيات."}
          retry={catalog.retry}
        />
      ) : tab === "roles" ? (
        <RolePermissionSummary roles={catalog.data.roles} />
      ) : tab === "matrix" ? (
        <PermissionMatrix permissions={catalog.data.permissions} />
      ) : (
        <section className="admin-card">
          <PermissionExplorer
            permissions={
              tab === "sensitive"
                ? catalog.data.permissions.filter(
                    (item) => item.sensitivity !== "NORMAL",
                  )
                : catalog.data.permissions
            }
            mode="catalog"
          />
        </section>
      )}
    </section>
  );
}

function PermissionMatrix({ permissions }: { permissions: PermissionItem[] }) {
  const resources = Array.from(
    new Set(permissions.map((item) => item.resource)),
  );
  const actions = Array.from(new Set(permissions.map((item) => item.action)));
  return (
    <section className="admin-card permission-matrix-card">
      <h2>المورد × العملية</h2>
      <p>توضح المصفوفة العمليات المتاحة لكل مورد؛ مرر أفقيًا عند الحاجة.</p>
      <div className="permission-matrix-wrap">
        <table>
          <thead>
            <tr>
              <th className="sticky-column">المورد</th>
              {actions.map((action) => (
                <th key={action}>
                  <code>{action}</code>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => (
              <tr key={resource}>
                <th className="sticky-column">
                  <code>{resource}</code>
                </th>
                {actions.map((action) => {
                  const item = permissions.find(
                    (permission) =>
                      permission.resource === resource &&
                      permission.action === action,
                  );
                  return (
                    <td key={action}>
                      {item ? (
                        <span
                          className={`matrix-dot ${item.sensitivity.toLowerCase()}`}
                          title={`${item.labelAr} — ${item.sensitivity}`}
                        >
                          ✓
                        </span>
                      ) : (
                        <span aria-label="غير متاح">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RolePermissionSummary({ roles }: { roles: AccessRole[] }) {
  return (
    <section className="admin-card">
      <h2>توزيع الصلاحيات حسب الأدوار</h2>
      <div className="role-summary-grid">
        {roles.map((role) => (
          <a
            className="role-summary-card"
            href={`/ar/admin/roles/${role.id}/permissions`}
            key={role.id}
          >
            <strong>{role.nameAr}</strong>
            <code dir="ltr">{role.code}</code>
            <span>
              {Number(role.permissionCount)} صلاحية · {Number(role.userCount)}{" "}
              مستخدم
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
