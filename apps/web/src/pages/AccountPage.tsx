import { RecordFormDialog } from "../components/admin/RecordFormDialog";
import { ConfirmDialog } from "../components/admin/ConfirmDialog";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { useAuth } from "../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
interface Favorite {
  id: string;
  isActive: boolean;
  legislationActive: boolean;
  titleAr: string;
  officialNumber: string;
  year: number;
  typeName: string;
}
interface Saved {
  id: string;
  isActive: boolean;
  nameAr: string;
  query: Record<string, string>;
  createdAt: string;
}
interface Note {
  id: string;
  isActive: boolean;
  entityType: string;
  entityId: string;
  noteText: string;
  createdAt: string;
}
export function AccountPage() {
  const auth = useAuth();
  const favorites = useApi<Favorite[]>("/me/favorites");
  const searches = useApi<Saved[]>("/me/saved-searches");
  const notes = useApi<Note[]>("/me/notes");
  const [editing, setEditing] = useState<{
    kind: "notes" | "saved-searches";
    item: Note | Saved;
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    path: string;
    label: string;
    retry: () => void;
    active?: boolean;
  } | null>(null);
  const [msg, setMsg] = useState("");
  if (favorites.loading || searches.loading || notes.loading)
    return (
      <div className="container page-shell">
        <LoadingCards />
      </div>
    );
  const error = favorites.error || searches.error || notes.error;
  const remove = async (path: string, retry: () => void, label: string) => {
    setConfirm({ path, label, retry });
  };
  const removeConfirmed = async (path: string, retry: () => void) => {
    try {
      await apiRequest(path, { method: "DELETE" });
      setConfirm(null);
      retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر الحذف.");
      throw e;
    }
  };
  const password = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirm")) {
      setMsg("تأكيد كلمة المرور الجديدة غير مطابق.");
      return;
    }
    try {
      await apiRequest("/auth/change-password", {
        body: {
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        },
      });
      setMsg("تغيرت كلمة المرور. سجل الدخول مجددًا.");
      setTimeout(() => window.location.assign("/ar/login"), 700);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر تغيير كلمة المرور.");
    }
  };
  return (
    <div className="container page-shell">
      <header className="page-title">
        <span className="eyebrow dark">بيانات خاصة بصاحب الحساب</span>
        <h1>حسابي</h1>
        <p>
          {auth.user?.displayName} — {auth.user?.roles.join("، ")}
        </p>
      </header>
      {editing && (
        <RecordFormDialog
          title="تعديل السجل الشخصي"
          path={`/me/${editing.kind}/${editing.item.id}`}
          method="PATCH"
          fields={
            editing.kind === "notes"
              ? [
                  {
                    name: "text",
                    label: "الملاحظة",
                    value: (editing.item as Note).noteText,
                    type: "textarea",
                    required: true,
                    maxLength: 5000,
                  },
                ]
              : [
                  {
                    name: "name",
                    label: "اسم البحث",
                    value: (editing.item as Saved).nameAr,
                    required: true,
                    maxLength: 200,
                  },
                  {
                    name: "queryText",
                    label: "كلمات البحث",
                    value: (editing.item as Saved).query.q ?? "",
                    required: true,
                  },
                ]
          }
          buildBody={(values) =>
            editing.kind === "notes"
              ? values
              : {
                  name: values.name,
                  query: {
                    ...(editing.item as Saved).query,
                    q: String(values.queryText),
                  },
                }
          }
          extra={
            editing.kind === "saved-searches"
              ? { query: (editing.item as Saved).query }
              : {}
          }
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            notes.retry();
            searches.retry();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={
            confirm.active === undefined
              ? `حذف: ${confirm.label}`
              : confirm.active
                ? `إعادة تفعيل: ${confirm.label}`
                : `تعطيل: ${confirm.label}`
          }
          description={
            confirm.active === undefined
              ? "سيحذف هذا السجل الشخصي من حسابك فقط؛ لا يتأثر التشريع الأصلي."
              : "يبقى السجل في حسابك للإدارة، ويوقف استخدامه حتى تعيد تفعيله."
          }
          confirmLabel="تأكيد"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm.active === undefined)
              await removeConfirmed(confirm.path, confirm.retry);
            else {
              await apiRequest(confirm.path, {
                method: "PATCH",
                body: { active: confirm.active },
              });
              confirm.retry();
              setConfirm(null);
            }
          }}
        />
      )}
      {msg && (
        <p className="form-message" role="status">
          {msg}
        </p>
      )}
      {error ? (
        <ErrorPanel
          message={error.message}
          retry={() => {
            favorites.retry();
            searches.retry();
            notes.retry();
          }}
        />
      ) : (
        <>
          <div className="account-grid">
            <section className="card">
              <h2>المفضلة</h2>
              <Link className="link-button" to="/ar/legislations">
                إضافة تشريع إلى المفضلة
              </Link>
              {favorites.data?.length ? (
                favorites.data.map((item) => (
                  <article className="account-item" key={item.id}>
                    {item.isActive && item.legislationActive ? (
                      <Link to={`/ar/legislations/${item.id}`}>
                        {item.titleAr}
                      </Link>
                    ) : (
                      <span>{item.titleAr}</span>
                    )}
                    <small>
                      {item.typeName} رقم {item.officialNumber} لسنة {item.year}
                    </small>
                    <span className="tag">
                      {item.isActive ? "فعال" : "معطل"}
                    </span>
                    <button
                      className="link-button"
                      onClick={() =>
                        setConfirm({
                          path: `/me/favorites/${item.id}/state`,
                          label: item.titleAr,
                          retry: favorites.retry,
                          active: !item.isActive,
                        })
                      }
                    >
                      {item.isActive ? "تعطيل" : "إعادة تفعيل"}
                    </button>
                    <button
                      className="link-button danger"
                      onClick={() =>
                        remove(
                          `/me/favorites/${item.id}`,
                          favorites.retry,
                          item.titleAr,
                        )
                      }
                    >
                      إزالة
                    </button>
                  </article>
                ))
              ) : (
                <p>لم تضف تشريعات إلى المفضلة.</p>
              )}
            </section>
            <section className="card">
              <h2>البحوث المحفوظة</h2>
              <Link className="link-button" to="/ar/search">
                حفظ بحث جديد
              </Link>
              {searches.data?.length ? (
                searches.data.map((item) => (
                  <article className="account-item" key={item.id}>
                    <Link
                      aria-disabled={!item.isActive}
                      onClick={(e) => {
                        if (!item.isActive) e.preventDefault();
                      }}
                      to={`/ar/search?${new URLSearchParams(item.query).toString()}`}
                    >
                      {item.nameAr}
                    </Link>
                    <small>
                      {new Date(item.createdAt).toLocaleDateString("ar-YE")}
                    </small>
                    <span className="tag">
                      {item.isActive ? "فعال" : "معطل"}
                    </span>
                    <button
                      className="link-button"
                      onClick={() =>
                        setConfirm({
                          path: `/me/saved-searches/${item.id}/state`,
                          label: item.nameAr,
                          retry: searches.retry,
                          active: !item.isActive,
                        })
                      }
                    >
                      {item.isActive ? "تعطيل" : "إعادة تفعيل"}
                    </button>
                    <button
                      className="link-button"
                      onClick={() =>
                        setEditing({ kind: "saved-searches", item })
                      }
                    >
                      تعديل
                    </button>
                    <button
                      className="link-button danger"
                      onClick={() =>
                        remove(
                          `/me/saved-searches/${item.id}`,
                          searches.retry,
                          item.nameAr,
                        )
                      }
                    >
                      حذف
                    </button>
                  </article>
                ))
              ) : (
                <p>لا توجد بحوث محفوظة.</p>
              )}
            </section>
            <section className="card">
              <h2>ملاحظاتي الخاصة</h2>
              <Link className="link-button" to="/ar/legislations">
                إضافة ملاحظة على تشريع
              </Link>
              {notes.data?.length ? (
                notes.data.map((item) => (
                  <article className="account-item" key={item.id}>
                    <strong>{item.entityType}</strong>
                    {item.isActive ? (
                      <p>{item.noteText}</p>
                    ) : (
                      <details>
                        <summary>عرض الملاحظة المعطلة</summary>
                        <p>{item.noteText}</p>
                      </details>
                    )}
                    <small>
                      {new Date(item.createdAt).toLocaleString("ar-YE")}
                    </small>
                    <span className="tag">
                      {item.isActive ? "فعال" : "معطل"}
                    </span>
                    <button
                      className="link-button"
                      onClick={() =>
                        setConfirm({
                          path: `/me/notes/${item.id}/state`,
                          label: item.noteText.slice(0, 80),
                          retry: notes.retry,
                          active: !item.isActive,
                        })
                      }
                    >
                      {item.isActive ? "تعطيل" : "إعادة تفعيل"}
                    </button>
                    <button
                      className="link-button"
                      onClick={() => setEditing({ kind: "notes", item })}
                    >
                      تعديل
                    </button>
                    <button
                      className="link-button danger"
                      onClick={() =>
                        remove(
                          `/me/notes/${item.id}`,
                          notes.retry,
                          item.noteText.slice(0, 80),
                        )
                      }
                    >
                      حذف
                    </button>
                  </article>
                ))
              ) : (
                <p>لا توجد ملاحظات.</p>
              )}
            </section>
          </div>
          <form className="card password-form" onSubmit={password}>
            <h2>تغيير كلمة المرور</h2>
            <label>
              كلمة المرور الحالية
              <input
                type="password"
                name="currentPassword"
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              كلمة المرور الجديدة
              <input
                type="password"
                name="newPassword"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <label>
              تأكيد كلمة المرور
              <input
                type="password"
                name="confirm"
                required
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <button className="button">تغيير وإبطال الجلسات</button>
          </form>
        </>
      )}
    </div>
  );
}
