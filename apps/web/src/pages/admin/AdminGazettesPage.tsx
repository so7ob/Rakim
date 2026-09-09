import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../hooks/use-api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import {
  ReferenceDataTabs,
  type ReferenceDataCounts,
} from "../../components/admin/ReferenceDataTabs";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { RecordFormDialog } from "../../components/admin/RecordFormDialog";
interface Gazette {
  id: string;
  issueNumber: string;
  publicationDate: string | null;
  publisher: string | null;
  notes: string | null;
}
export function AdminGazettesPage({
  counts,
}: {
  counts?: ReferenceDataCounts;
}) {
  const auth = useAuth(),
    data = useApi<Gazette[]>("/admin/gazette-issues");
  const [editing, setEditing] = useState<Gazette | "create" | null>(null);
  const item = typeof editing === "object" ? editing : null;
  return (
    <section>
      <AdminPageHeader
        title="أعداد الجريدة"
        description="أعداد مرجعية مشتركة بين التشريعات؛ يمنع حذف العدد المستخدم ويظل تاريخه محفوظاً."
        actions={
          auth.hasPermission("reference.create") ? (
            <button className="button" onClick={() => setEditing("create")}>
              + إضافة عدد
            </button>
          ) : undefined
        }
      />
      <ReferenceDataTabs counts={counts} />
      {data.loading ? (
        <LoadingCards />
      ) : data.error ? (
        <ErrorPanel message={data.error.message} retry={data.retry} />
      ) : (
        <div className="admin-list">
          {data.data?.map((g) => (
            <article className="admin-list-card" key={g.id}>
              <h2>العدد {g.issueNumber}</h2>
              <p>
                {g.publicationDate ?? "تاريخ غير محدد"} — {g.publisher ?? ""}
              </p>
              <p>{g.notes}</p>
              <div className="admin-entity-actions">
                {auth.hasPermission("reference.update") && (
                  <button
                    className="button secondary"
                    onClick={() => setEditing(g)}
                  >
                    تعديل العدد
                  </button>
                )}
                <LifecycleActions
                  kind="gazettes"
                  id={g.id}
                  label={`العدد ${g.issueNumber}`}
                  onDone={data.retry}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <RecordFormDialog
          title={item ? `تعديل العدد ${item.issueNumber}` : "إضافة عدد جريدة"}
          path={`/admin/gazette-issues${item ? `/${item.id}` : ""}`}
          method={item ? "PATCH" : "POST"}
          fields={[
            {
              name: "issueNumber",
              label: "رقم العدد",
              value: item?.issueNumber,
              required: true,
              maxLength: 80,
            },
            {
              name: "publicationDate",
              label: "تاريخ النشر",
              value: item?.publicationDate ?? "",
              type: "date",
            },
            {
              name: "publisher",
              label: "الناشر",
              value: item?.publisher ?? "",
              maxLength: 200,
            },
            {
              name: "notes",
              label: "ملاحظات",
              type: "textarea",
              value: item?.notes ?? "",
            },
            { name: "reason", label: "سبب الإجراء", required: true },
          ]}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            data.retry();
          }}
        />
      )}
    </section>
  );
}
