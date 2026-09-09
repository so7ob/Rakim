import { AdminGazettesPage } from "./AdminGazettesPage";
import { LifecycleActions } from "../../components/admin/LifecycleActions";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import { AdminDialog } from "../../components/admin/AdminDialog";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { ReferenceDataTabs } from "../../components/admin/ReferenceDataTabs";

interface Item {
  id: string;
  code: string;
  nameAr: string;
  isActive: boolean;
  parentId?: string | null;
}
interface Data {
  types: Item[];
  authorities: Item[];
  subjects: Item[];
}
const labels = {
  types: "أنواع التشريعات",
  authorities: "الجهات",
  subjects: "الموضوعات",
} as const;
type Kind = keyof typeof labels;

export function AdminReferenceDataPage() {
  const { kind = "types" } = useParams();
  const activeKind = (Object.keys(labels) as Kind[]).includes(kind as Kind)
    ? (kind as Kind)
    : "types";
  const auth = useAuth();
  const state = useApi<Data>("/admin/reference-data");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const counts = state.data
    ? {
        types: state.data.types.length,
        subjects: state.data.subjects.length,
        authorities: state.data.authorities.length,
      }
    : undefined;
  if (kind === "gazettes") return <AdminGazettesPage counts={counts} />;
  if (state.loading) return <LoadingCards />;
  if (state.error || !state.data)
    return (
      <ErrorPanel
        message={state.error?.message ?? "تعذر تحميل القوائم."}
        retry={state.retry}
      />
    );
  const items = state.data[activeKind];
  const parentName = (id?: string | null) =>
    state.data!.subjects.find((subject) => subject.id === id)?.nameAr ?? "—";
  const done = (text: string) => {
    setMessage(text);
    state.retry();
  };
  return (
    <section>
      <AdminPageHeader
        eyebrow="قواميس قابلة للإدارة"
        title="القوائم المرجعية"
        description="الأنواع والجهات والموضوعات المستخدمة في نماذج التشريعات ومرشحات البحث."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إدارة المحتوى" },
          { label: "القوائم المرجعية" },
        ]}
        actions={
          auth.hasPermission("reference.create") ? (
            <button
              type="button"
              className="button"
              onClick={() => setCreating(true)}
            >
              + إضافة إلى {labels[activeKind]}
            </button>
          ) : undefined
        }
      />
      <ReferenceDataTabs counts={counts} />
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      <section className="admin-card">
        <h2>{labels[activeKind]}</h2>
        {!items.length ? (
          <div className="admin-empty-inline">
            لا توجد عناصر في هذه القائمة.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>الرمز</th>
                  {activeKind === "subjects" && <th>الموضوع الأب</th>}
                  <th>الحالة الإدارية</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.nameAr}</strong>
                    </td>
                    <td>
                      <code dir="ltr">{item.code}</code>
                    </td>
                    {activeKind === "subjects" && (
                      <td>{parentName(item.parentId)}</td>
                    )}
                    <td>{item.isActive ? "فعال إدارياً" : "معطل إدارياً"}</td>
                    <td>
                      <LifecycleActions
                        kind={activeKind}
                        showStatus={false}
                        id={item.id}
                        label={item.nameAr}
                        onDone={state.retry}
                      />
                      {auth.hasPermission("reference.update") ? (
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => setEditing(item)}
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
      {creating && (
        <ReferenceDialog
          kind={activeKind}
          subjects={state.data.subjects}
          onClose={() => setCreating(false)}
          onDone={(text) => {
            setCreating(false);
            done(text);
          }}
        />
      )}
      {editing && (
        <ReferenceDialog
          kind={activeKind}
          item={editing}
          subjects={state.data.subjects}
          onClose={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            done(text);
          }}
        />
      )}
    </section>
  );
}

function ReferenceDialog({
  kind,
  item,
  subjects,
  onClose,
  onDone,
}: {
  kind: Kind;
  item?: Item;
  subjects: Item[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await apiRequest(
        item
          ? `/admin/reference-data/${kind}/${item.id}`
          : `/admin/reference-data/${kind}`,
        {
          ...(item ? { method: "PATCH" } : {}),
          body: {
            code: form.get("code"),
            nameAr: form.get("nameAr"),
            parentId: form.get("parentId"),
            isActive: form.has("isActive"),
            reason: form.get("reason"),
          },
        },
      );
      onDone(
        item ? "حُفظ عنصر القائمة المرجعية." : "أضيف عنصر القائمة المرجعية.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ العنصر.");
      setSubmitting(false);
    }
  };
  return (
    <AdminDialog
      title={`${item ? "تعديل" : "إضافة"} عنصر في ${labels[kind]}`}
      description={
        item ? "القيمة الحالية تبقى معروضة حتى يؤكد الخادم التعديل." : undefined
      }
      onClose={onClose}
    >
      <form className="edit-form" onSubmit={submit}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-columns">
          <label>
            الرمز
            <input
              name="code"
              defaultValue={item?.code ?? ""}
              pattern="[A-Za-z0-9_]+"
              required
            />
          </label>
          <label>
            الاسم العربي
            <input name="nameAr" defaultValue={item?.nameAr ?? ""} required />
          </label>
          {kind === "subjects" && (
            <label>
              الموضوع الأب
              <select name="parentId" defaultValue={item?.parentId ?? ""}>
                <option value="">بلا أب</option>
                {subjects
                  .filter((subject) => subject.id !== item?.id)
                  .map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.nameAr}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="setting-toggle">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={item?.isActive ?? true}
            />
            فعال
          </label>
        </div>
        <label>
          سبب {item ? "التغيير" : "الإضافة"}
          <input name="reason" required />
        </label>
        <div className="admin-entity-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={submitting}
          >
            إلغاء
          </button>
          <button className="button" disabled={submitting}>
            {submitting ? "جار الحفظ…" : item ? "حفظ" : "إضافة"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
