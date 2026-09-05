import { NavLink } from "react-router-dom";

export interface AdminTabItem {
  label: string;
  to: string;
  count?: number;
  end?: boolean;
}

export function AdminTabs({
  items,
  label,
  secondary = false,
}: {
  items: AdminTabItem[];
  label: string;
  secondary?: boolean;
}) {
  return (
    <nav
      className={`admin-tabs${secondary ? " admin-subtabs" : ""}`}
      aria-label={label}
    >
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end}>
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </NavLink>
      ))}
    </nav>
  );
}
