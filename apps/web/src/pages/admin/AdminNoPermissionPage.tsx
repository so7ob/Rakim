import { Link, useLocation } from "react-router-dom";

export function AdminNoPermissionPage() {
  const location = useLocation();
  const deniedPath = (location.state as { deniedPath?: string } | null)
    ?.deniedPath;
  return (
    <section className="admin-state-page" role="alert">
      <span aria-hidden="true">⛔</span>
      <h1>لا تملك صلاحية الوصول</h1>
      <p>
        لا يحتوي حسابك على الصلاحية الدقيقة المطلوبة لهذه الصفحة
        {deniedPath ? ` (${deniedPath})` : ""}.
      </p>
      <Link className="button secondary" to="/ar">
        العودة إلى المنصة
      </Link>
    </section>
  );
}
