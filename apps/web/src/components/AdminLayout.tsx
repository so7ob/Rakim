import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { UiIcon, type UiIconName } from "./UiIcon";

interface NavigationItem {
  to: string;
  label: string;
  permission: string;
  end?: boolean;
}
interface NavigationGroup {
  id: string;
  label: string;
  icon: UiIconName;
  items: NavigationItem[];
}

const groups: NavigationGroup[] = [
  {
    id: "content",
    label: "إدارة المحتوى",
    icon: "content",
    items: [
      {
        to: "/ar/admin/content",
        label: "التشريعات",
        permission: "legislation.view",
      },
      {
        to: "/ar/admin/imports",
        label: "الاستيراد والمصادر",
        permission: "source.view",
      },
      {
        to: "/ar/admin/amendments",
        label: "التعديلات",
        permission: "amendment.view",
      },
      {
        to: "/ar/admin/reference-data/types",
        label: "أنواع التشريعات",
        permission: "reference.view",
      },
      {
        to: "/ar/admin/reference-data/subjects",
        label: "التصنيفات والموضوعات",
        permission: "reference.view",
      },
      {
        to: "/ar/admin/reference-data/authorities",
        label: "الجهات",
        permission: "reference.view",
      },
    ],
  },
  {
    id: "search",
    label: "إدارة البحث",
    icon: "search",
    items: [
      {
        to: "/ar/admin/synonyms",
        label: "قاموس البحث",
        permission: "search.synonym.view",
      },
    ],
  },
  {
    id: "access",
    label: "المستخدمون والوصول",
    icon: "access",
    items: [
      { to: "/ar/admin/users", label: "المستخدمون", permission: "user.view" },
      { to: "/ar/admin/roles", label: "الأدوار", permission: "role.view" },
      {
        to: "/ar/admin/permissions",
        label: "الصلاحيات",
        permission: "permission.view",
      },
    ],
  },
  {
    id: "settings",
    label: "إعدادات المنصة",
    icon: "settings",
    items: [
      {
        to: "/ar/admin/settings/general",
        label: "عام",
        permission: "settings.view",
      },
      {
        to: "/ar/admin/settings/appearance",
        label: "الهوية والمظهر",
        permission: "settings.view",
      },
      {
        to: "/ar/admin/settings/navigation",
        label: "التنقل",
        permission: "settings.view",
      },
      {
        to: "/ar/admin/settings/legislation",
        label: "صفحة التشريع",
        permission: "settings.view",
      },
      {
        to: "/ar/admin/settings/workflow",
        label: "سياسات سير العمل",
        permission: "workflow_policy.view",
      },
      {
        to: "/ar/admin/settings/pages",
        label: "الصفحات العامة",
        permission: "settings.view",
      },
    ],
  },
  {
    id: "governance",
    label: "النظام والحوكمة",
    icon: "governance",
    items: [
      {
        to: "/ar/admin/quality",
        label: "جودة البيانات",
        permission: "quality.view",
      },
      {
        to: "/ar/admin/reports",
        label: "بلاغات المحتوى",
        permission: "report.view",
      },
      {
        to: "/ar/admin/audit",
        label: "سجل العمليات",
        permission: "audit.view",
      },
    ],
  },
];

export function AdminLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem("admin-sidebar-collapsed") === "true",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleGroups = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            auth.hasPermission(item.permission),
          ),
        }))
        .filter((group) => group.items.length),
    [auth],
  );
  const currentGroup = visibleGroups.find((group) =>
    group.items.some((item) => location.pathname.startsWith(item.to)),
  )?.id;
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    try {
      return new Set(
        JSON.parse(
          window.localStorage.getItem("admin-sidebar-groups") ?? "[]",
        ) as string[],
      );
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (!currentGroup) return;
    setOpenGroups((value) => new Set([...value, currentGroup]));
    setMobileOpen(false);
  }, [currentGroup, location.pathname]);
  useEffect(() => {
    window.localStorage.setItem(
      "admin-sidebar-groups",
      JSON.stringify([...openGroups]),
    );
  }, [openGroups]);
  useEffect(() => {
    window.localStorage.setItem("admin-sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <div className={`admin-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <button
        type="button"
        className="admin-mobile-menu"
        aria-label="فتح قائمة الإدارة"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((value) => !value)}
      >
        <UiIcon name="menu" />
        <span>قائمة الإدارة</span>
      </button>
      {mobileOpen && (
        <button
          className="admin-sidebar-scrim"
          aria-label="إغلاق قائمة الإدارة"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`admin-sidebar${mobileOpen ? " mobile-open" : ""}`}>
        <button
          type="button"
          className="admin-mobile-close"
          aria-label="إغلاق قائمة الإدارة"
          onClick={() => setMobileOpen(false)}
        >
          <UiIcon name="chevron" />
          <span>إغلاق القائمة</span>
        </button>
        <div className="account-card">
          <span className="avatar" aria-hidden="true">
            {auth.user?.displayName.slice(0, 1)}
          </span>
          <div>
            <strong>{auth.user?.displayName}</strong>
            <small>{auth.user?.roles.join("، ")}</small>
          </div>
        </div>
        <button
          type="button"
          className="sidebar-collapse-button"
          aria-label={
            collapsed ? "توسيع القائمة الجانبية" : "تصغير القائمة الجانبية"
          }
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <UiIcon name="chevron" />
          <span>{collapsed ? "توسيع" : "تصغير القائمة"}</span>
        </button>
        <nav aria-label="تنقل لوحة الإدارة">
          {auth.hasPermission("dashboard.view") && (
            <NavLink
              className="admin-tree-dashboard"
              end
              to="/ar/admin"
              title={collapsed ? "لوحة المؤشرات" : undefined}
            >
              <UiIcon name="dashboard" />
              <span>لوحة المؤشرات</span>
            </NavLink>
          )}
          <div
            className="admin-sidebar-tree"
            role="tree"
            aria-label="أقسام الإدارة"
          >
            {visibleGroups.map((group) => {
              const open =
                openGroups.has(group.id) || group.id === currentGroup;
              return (
                <div
                  className="admin-tree-group"
                  key={group.id}
                  role="treeitem"
                  aria-expanded={open}
                >
                  <button
                    type="button"
                    className={group.id === currentGroup ? "active" : ""}
                    onClick={() =>
                      setOpenGroups((value) => {
                        const next = new Set(value);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                    title={collapsed ? group.label : undefined}
                  >
                    <UiIcon name={group.icon} />
                    <span>{group.label}</span>
                    <UiIcon className="tree-chevron" name="chevron" />
                  </button>
                  {open && (
                    <div role="group">
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.end}
                          title={collapsed ? item.label : undefined}
                        >
                          <span>{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>
        <button
          className="button secondary admin-logout"
          onClick={async () => {
            await auth.logout();
            navigate("/ar/login");
          }}
        >
          <span>تسجيل الخروج</span>
        </button>
      </aside>
      <main className="admin-main" id="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
