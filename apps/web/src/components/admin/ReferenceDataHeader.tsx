import type { ReactNode } from "react";
import { AdminPageHeader } from "./AdminPageHeader";

export function ReferenceDataHeader({ actions }: { actions?: ReactNode }) {
  return (
    <AdminPageHeader
      eyebrow="قواميس قابلة للإدارة"
      title="القوائم المرجعية"
      description="الأنواع والجهات والموضوعات وأعداد الجريدة المستخدمة في نماذج التشريعات ومرشحات البحث."
      breadcrumbs={[
        { label: "لوحة الإدارة", to: "/ar/admin" },
        { label: "إدارة المحتوى" },
        { label: "القوائم المرجعية" },
      ]}
      actions={actions}
    />
  );
}
