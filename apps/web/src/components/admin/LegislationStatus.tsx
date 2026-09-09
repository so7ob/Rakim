import { StatusBadge } from "../StatusBadge";
import { EntityDetails } from "./EntityDetails";

const legalLabels: Record<string, string> = {
  IN_FORCE: "ساري",
  AMENDED: "معدل",
  PARTIALLY_REPEALED: "ملغى جزئياً",
  REPEALED: "ملغى",
  SUSPENDED: "موقوف قانونياً",
  UNKNOWN: "غير محدد",
};

export function LegalStatusBadge({ status }: { status: string }) {
  return <span className="tag">{legalLabels[status] ?? status}</span>;
}

export function LegislationWorkflowBadge({ status }: { status: string }) {
  // Legacy rows used legal states in the workflow column. They are published records.
  return (
    <StatusBadge
      status={
        ["AMENDED", "REPEALED", "SUSPENDED"].includes(status)
          ? "PUBLISHED"
          : status
      }
    />
  );
}

export function AdministrativeStatusBadge({
  active,
}: {
  active: boolean | number;
}) {
  return (
    <span className="tag">{active ? "فعال إدارياً" : "معطل إدارياً"}</span>
  );
}

export function LegislationStatus({
  workflow,
  legal,
  active,
}: {
  workflow: string;
  legal: string;
  active: boolean | number;
}) {
  return (
    <EntityDetails
      items={[
        {
          label: "الحالة القانونية",
          value: <LegalStatusBadge status={legal} />,
        },
        {
          label: "سير العمل",
          value: <LegislationWorkflowBadge status={workflow} />,
        },
        {
          label: "الحالة الإدارية",
          value: <AdministrativeStatusBadge active={active} />,
        },
      ]}
    />
  );
}
