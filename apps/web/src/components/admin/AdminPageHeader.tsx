import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function AdminPageHeader({
  title,
  eyebrow,
  description,
  breadcrumbs = [],
  status,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="admin-page-header">
      {breadcrumbs.length > 0 && (
        <nav aria-label="مسار لوحة الإدارة">
          <ol>
            {breadcrumbs.map((item) => (
              <li key={`${item.label}-${item.to ?? "current"}`}>
                {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="admin-page-heading-row">
        <div>
          {eyebrow && <span className="eyebrow dark">{eyebrow}</span>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        <div className="admin-page-actions">
          {status}
          {actions}
        </div>
      </div>
    </header>
  );
}
