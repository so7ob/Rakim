import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AdminLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const links = [
    {
      to: "/ar/admin",
      label: "لوحة المؤشرات",
      roles: [
        "DATA_ENTRY",
        "LEGAL_REVIEWER",
        "CONTENT_MANAGER",
        "SYSTEM_ADMIN",
      ],
      end: true,
    },
    {
      to: "/ar/admin/content",
      label: "المحتوى ودورة العمل",
      roles: ["DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER"],
    },
    {
      to: "/ar/admin/amendments",
      label: "عمليات التعديل",
      roles: ["DATA_ENTRY", "LEGAL_REVIEWER", "CONTENT_MANAGER"],
    },
    {
      to: "/ar/admin/imports",
      label: "الاستيراد والمصادر",
      roles: [
        "DATA_ENTRY",
        "LEGAL_REVIEWER",
        "CONTENT_MANAGER",
        "SYSTEM_ADMIN",
      ],
    },
    {
      to: "/ar/admin/quality",
      label: "الجودة",
      roles: ["LEGAL_REVIEWER", "CONTENT_MANAGER", "SYSTEM_ADMIN"],
    },
    {
      to: "/ar/admin/audit",
      label: "سجل التدقيق",
      roles: ["CONTENT_MANAGER", "SYSTEM_ADMIN"],
    },
    { to: "/ar/admin/reports", label: "البلاغات", roles: ["CONTENT_MANAGER"] },
    {
      to: "/ar/admin/synonyms",
      label: "قاموس البحث",
      roles: ["CONTENT_MANAGER"],
    },
    { to: "/ar/admin/users", label: "المستخدمون", roles: ["SYSTEM_ADMIN"] },
    {
      to: "/ar/admin/settings",
      label: "إعدادات المنصة",
      roles: ["SYSTEM_ADMIN", "CONTENT_MANAGER"],
    },
    {
      to: "/ar/admin/reference-data",
      label: "القوائم المرجعية",
      roles: ["CONTENT_MANAGER"],
    },
  ];
  return (
    <div className="admin-shell container">
      <aside className="admin-sidebar">
        <div className="account-card">
          <span className="avatar" aria-hidden="true">
            {auth.user?.displayName.slice(0, 1)}
          </span>
          <div>
            <strong>{auth.user?.displayName}</strong>
            <small>{auth.user?.roles.join("، ")}</small>
          </div>
        </div>
        <nav aria-label="تنقل لوحة الإدارة">
          {links
            .filter((link) => auth.hasRole(...link.roles))
            .map((link) => (
              <NavLink key={link.to} end={link.end} to={link.to}>
                {link.label}
              </NavLink>
            ))}
        </nav>
        <button
          className="button secondary"
          onClick={async () => {
            await auth.logout();
            navigate("/ar/login");
          }}
        >
          تسجيل الخروج
        </button>
      </aside>
      <main className="admin-main" id="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
