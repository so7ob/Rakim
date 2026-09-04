import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../hooks/use-api";
interface Favorite {
  id: string;
}
export function LegislationActions({
  id,
  sourceAvailable = true,
}: {
  id: string;
  sourceAvailable?: boolean;
}) {
  const auth = useAuth();
  const favorites = useApi<Favorite[]>(auth.user ? "/me/favorites" : null);
  const favorite = Boolean(favorites.data?.some((item) => item.id === id));
  const [msg, setMsg] = useState("");
  const toggle = async () => {
    if (!auth.user) return;
    try {
      await apiRequest(`/me/favorites/${id}`, {
        method: favorite ? "DELETE" : "POST",
      });
      setMsg(favorite ? "أزيل من المفضلة." : "أضيف إلى المفضلة.");
      favorites.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر التحديث.");
    }
  };
  return (
    <>
      <div className="container detail-tools" aria-label="أدوات التشريع">
        <button
          onClick={async () => {
            await navigator.clipboard?.writeText(location.href);
            setMsg("نُسخ الرابط.");
          }}
        >
          نسخ الرابط
        </button>
        <button onClick={() => window.print()}>طباعة</button>
        <button
          onClick={async () => {
            if (navigator.share)
              await navigator.share({
                title: document.title,
                url: location.href,
              });
            else await navigator.clipboard?.writeText(location.href);
          }}
        >
          مشاركة
        </button>
        {sourceAvailable ? (
          <a href={`/api/v1/legislations/${id}/source`} download>
            تنزيل المصدر
          </a>
        ) : (
          <button disabled title="لا يوجد ملف مصدر عام">
            تنزيل المصدر
          </button>
        )}
        {auth.user ? (
          <>
            <button aria-pressed={favorite} onClick={toggle}>
              {favorite ? "★ في المفضلة" : "☆ إضافة للمفضلة"}
            </button>
            <details className="tool-popover">
              <summary>ملاحظة خاصة</summary>
              <ToolForm id={id} kind="note" done={setMsg} />
            </details>
            <details className="tool-popover">
              <summary>إبلاغ</summary>
              <ToolForm id={id} kind="report" done={setMsg} />
            </details>
          </>
        ) : (
          <Link to="/ar/login">دخول للمفضلة والملاحظات</Link>
        )}
      </div>
      {msg && (
        <p className="container tool-message" role="status">
          {msg}
        </p>
      )}
    </>
  );
}
function ToolForm({
  id,
  kind,
  done,
}: {
  id: string;
  kind: "note" | "report";
  done: (value: string) => void;
}) {
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    try {
      if (kind === "note")
        await apiRequest("/me/notes", {
          body: {
            entityType: "LEGISLATION",
            entityId: id,
            text: form.get("text"),
          },
        });
      else
        await apiRequest("/me/reports", {
          body: {
            entityType: "LEGISLATION",
            entityId: id,
            category: form.get("category"),
            details: form.get("text"),
          },
        });
      done(
        kind === "note" ? "حُفظت الملاحظة الخاصة." : "أُرسل البلاغ للمراجعة.",
      );
      formElement.reset();
    } catch (error) {
      done(error instanceof Error ? error.message : "تعذر الحفظ.");
    }
  };
  return (
    <form onSubmit={submit}>
      {kind === "report" && (
        <select name="category" aria-label="نوع البلاغ">
          <option value="TYPO">خطأ مطبعي</option>
          <option value="MISSING_SOURCE">مصدر مفقود</option>
          <option value="WRONG_DATE">تاريخ غير صحيح</option>
          <option value="BROKEN_LINK">رابط معطل</option>
          <option value="OTHER">أخرى</option>
        </select>
      )}
      <textarea
        name="text"
        required
        minLength={kind === "report" ? 5 : 2}
        aria-label={kind === "note" ? "نص الملاحظة" : "تفاصيل البلاغ"}
      />
      <button className="button">حفظ</button>
    </form>
  );
}
