import type { ReactNode } from "react";

export interface EntityDetailItem {
  label: string;
  value: ReactNode;
  wide?: boolean;
}

export function EntityDetails({
  items,
  className = "",
}: {
  items: EntityDetailItem[];
  className?: string;
}) {
  return (
    <dl className={`admin-entity-details ${className}`.trim()}>
      {items.map((item, index) => (
        <div
          className={item.wide ? "admin-entity-detail-wide" : undefined}
          key={`${item.label}-${index}`}
        >
          <dt>{item.label}</dt>
          <dd>{item.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
