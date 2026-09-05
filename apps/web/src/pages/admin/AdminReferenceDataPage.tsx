import { useState } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { useApi } from "../../hooks/use-api";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";

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

export function AdminReferenceDataPage() {
  const { kind = "types" } = useParams();
  const data = useApi<Data>("/admin/reference-data");
  const [message, setMessage] = useState("");
  if (data.loading) return <LoadingCards />;
  if (data.error || !data.data)
    return (
      <ErrorPanel
        message={data.error?.message ?? "تعذر تحميل القوائم."}
        retry={data.retry}
      />
    );
  const done = (text: string) => {
    setMessage(text);
    data.retry();
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
      />
      <AdminTabs
        label="أنواع القوائم المرجعية"
        items={[
          {
            label: "أنواع التشريعات",
            to: "/ar/admin/reference-data/types",
            count: data.data.types.length,
          },
          {
            label: "التصنيفات والموضوعات",
            to: "/ar/admin/reference-data/subjects",
            count: data.data.subjects.length,
          },
          {
            label: "الجهات",
            to: "/ar/admin/reference-data/authorities",
            count: data.data.authorities.length,
          },
        ]}
      />
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {(Object.keys(labels) as Array<keyof typeof labels>)
        .filter((item) => item === kind)
        .map((activeKind) => (
          <section className="admin-card" key={activeKind}>
            <h2>{labels[activeKind]}</h2>
            <div className="draft-articles">
              {data.data![activeKind].map((item) => (
                <ReferenceEditor
                  key={item.id}
                  kind={activeKind}
                  item={item}
                  subjects={data.data!.subjects}
                  done={done}
                />
              ))}
              <NewReference
                kind={activeKind}
                subjects={data.data!.subjects}
                done={done}
              />
            </div>
          </section>
        ))}
    </section>
  );
}

function fields(
  kind: keyof typeof labels,
  item: Partial<Item>,
  subjects: Item[],
) {
  return (
    <div className="form-columns">
      <label>
        الرمز
        <input
          name="code"
          defaultValue={item.code ?? ""}
          pattern="[A-Za-z0-9_]+"
          required
        />
      </label>
      <label>
        الاسم العربي
        <input name="nameAr" defaultValue={item.nameAr ?? ""} required />
      </label>
      {kind === "subjects" && (
        <label>
          الموضوع الأب
          <select name="parentId" defaultValue={item.parentId ?? ""}>
            <option value="">بلا أب</option>
            {subjects
              .filter((x) => x.id !== item.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nameAr}
                </option>
              ))}
          </select>
        </label>
      )}
      <label className="setting-toggle">
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={item.isActive ?? true}
        />
        فعال
      </label>
    </div>
  );
}
function ReferenceEditor({
  kind,
  item,
  subjects,
  done,
}: {
  kind: keyof typeof labels;
  item: Item;
  subjects: Item[];
  done: (x: string) => void;
}) {
  return (
    <details className="draft-article">
      <summary>
        {item.nameAr} — {item.code} {item.isActive ? "" : "(معطل)"}
      </summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const f = new FormData(event.currentTarget);
          try {
            await apiRequest(`/admin/reference-data/${kind}/${item.id}`, {
              method: "PATCH",
              body: {
                code: f.get("code"),
                nameAr: f.get("nameAr"),
                parentId: f.get("parentId"),
                isActive: f.has("isActive"),
                reason: f.get("reason"),
              },
            });
            done("حُفظ عنصر القائمة المرجعية.");
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذر الحفظ.");
          }
        }}
      >
        {fields(kind, item, subjects)}
        <label>
          سبب التغيير
          <input name="reason" required />
        </label>
        <button className="button secondary">حفظ</button>
      </form>
    </details>
  );
}
function NewReference({
  kind,
  subjects,
  done,
}: {
  kind: keyof typeof labels;
  subjects: Item[];
  done: (x: string) => void;
}) {
  return (
    <details className="draft-article">
      <summary>+ إضافة عنصر إلى {labels[kind]}</summary>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const f = new FormData(formElement);
          try {
            await apiRequest(`/admin/reference-data/${kind}`, {
              body: {
                code: f.get("code"),
                nameAr: f.get("nameAr"),
                parentId: f.get("parentId"),
                isActive: f.has("isActive"),
                reason: f.get("reason"),
              },
            });
            done("أضيف عنصر القائمة المرجعية.");
            formElement.reset();
          } catch (error) {
            done(error instanceof Error ? error.message : "تعذرت الإضافة.");
          }
        }}
      >
        {fields(kind, {}, subjects)}
        <label>
          سبب الإضافة
          <input name="reason" required />
        </label>
        <button className="button">إضافة</button>
      </form>
    </details>
  );
}
