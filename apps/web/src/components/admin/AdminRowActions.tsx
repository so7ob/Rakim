import type { ReactNode } from "react";

export function AdminRowActions({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="admin-row-actions" role="group" aria-label={label}>
      {children}
    </div>
  );
}
