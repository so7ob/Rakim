import { AdminTabs } from "./AdminTabs";

export type ReferenceDataCounts = Partial<
  Record<"types" | "subjects" | "authorities", number>
>;

const referenceTabs = [
  { kind: "gazettes", label: "أعداد الجريدة" },
  { kind: "types", label: "أنواع التشريعات" },
  { kind: "subjects", label: "التصنيفات والموضوعات" },
  { kind: "authorities", label: "الجهات" },
] as const;

export function ReferenceDataTabs({
  counts,
}: {
  counts?: ReferenceDataCounts;
}) {
  return (
    <AdminTabs
      label="أنواع القوائم المرجعية"
      items={referenceTabs.map(({ kind, label }) => ({
        label,
        to: `/ar/admin/reference-data/${kind}`,
        count: kind === "gazettes" ? undefined : counts?.[kind],
      }))}
    />
  );
}
