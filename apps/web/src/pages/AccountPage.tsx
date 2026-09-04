import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { useAuth } from "../auth/AuthContext";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
interface Favorite {
  id: string;
  titleAr: string;
  officialNumber: string;
  year: number;
  typeName: string;
}
interface Saved {
  id: string;
  nameAr: string;
  query: Record<string, string>;
  createdAt: string;
}
interface Note {
  id: string;
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
  const [msg, setMsg] = useState("");
  if (favorites.loading || searches.loading || notes.loading)
    return (
      <div className="container page-shell">
        <LoadingCards />
      </div>
    );
  const error = favorites.error || searches.error || notes.error;
  const remove = async (path: string, retry: () => void) => {
    try {
      await apiRequest(path, { method: "DELETE" });
      retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر الحذف.");
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
              {favorites.data?.length ? (
                favorites.data.map((item) => (
                  <article className="account-item" key={item.id}>
                    <Link to={`/ar/legislations/${item.id}`}>
                      {item.titleAr}
                    </Link>
                    <small>
                      {item.typeName} رقم {item.officialNumber} لسنة {item.year}
                    </small>
                    <button
                      className="link-button danger"
                      onClick={() =>
                        remove(`/me/favorites/${item.id}`, favorites.retry)
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
              {searches.data?.length ? (
                searches.data.map((item) => (
                  <article className="account-item" key={item.id}>
                    <Link
                      to={`/ar/search?${new URLSearchParams(item.query).toString()}`}
                    >
                      {item.nameAr}
                    </Link>
                    <small>
                      {new Date(item.createdAt).toLocaleDateString("ar-YE")}
                    </small>
                    <button
                      className="link-button danger"
                      onClick={() =>
                        remove(`/me/saved-searches/${item.id}`, searches.retry)
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
              {notes.data?.length ? (
                notes.data.map((item) => (
                  <article className="account-item" key={item.id}>
                    <strong>{item.entityType}</strong>
                    <p>{item.noteText}</p>
                    <small>
                      {new Date(item.createdAt).toLocaleString("ar-YE")}
                    </small>
                    <button
                      className="link-button danger"
                      onClick={() =>
                        remove(`/me/notes/${item.id}`, notes.retry)
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
