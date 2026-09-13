import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../hooks/use-api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { ReferenceDataHeader } from "../../components/admin/ReferenceDataHeader";
import {
  ReferenceDataTabs,
  type ReferenceDataCounts,
} from "../../components/admin/ReferenceDataTabs";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { RecordFormDialog } from "../../components/admin/RecordFormDialog";
interface Gazette {
  id: string;
  editRevision: number;
  issueNumber: string;
  publicationDate: string | null;
  publisher: string | null;
  notes: string | null;
  isActive: boolean;
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
      <ReferenceDataHeader
        actions={
          auth.hasPermission("reference.create") ? (
            <button
              type="button"
              className="button"
              onClick={() => setEditing("create")}
            >
              + إضافة إلى أعداد الجريدة
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
        <section className="admin-card">
          <h2>أعداد الجريدة</h2>
          {!data.data?.length ? (
            <div className="admin-empty-inline">
              لا توجد عناصر في هذه القائمة.
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>رقم العدد</th>
                    <th>تاريخ النشر</th>
                    <th>الناشر</th>
                    <th>الحالة الإدارية</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((g) => (
                    <tr key={g.id}>
                      <td>
                        <strong>{g.issueNumber}</strong>
                        {g.notes && <small>{g.notes}</small>}
                      </td>
                      <td>{g.publicationDate ?? "—"}</td>
                      <td>{g.publisher || "—"}</td>
                      <td>{g.isActive ? "فعال إدارياً" : "معطل إدارياً"}</td>
                      <td>
                        <LifecycleActions
                          kind="gazettes"
                          showStatus={false}
                          id={g.id}
                          label={`العدد ${g.issueNumber}`}
                          onDone={data.retry}
                        />
                        {auth.hasPermission("reference.update") ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => setEditing(g)}
                          >
                            تعديل
                          </button>
                        ) : (
                          "عرض فقط"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {editing && (
        <RecordFormDialog
          editRevision={item?.editRevision}
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
