import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../hooks/use-api";
import { UiIcon } from "./UiIcon";
interface Favorite {
  isActive: boolean;
  id: string;
}
export function LegislationActions({
  id,
  sourceAvailable = true,
  embedded = false,
}: {
  id: string;
  sourceAvailable?: boolean;
  embedded?: boolean;
}) {
  const auth = useAuth();
  const favorites = useApi<Favorite[]>(auth.user ? "/me/favorites" : null);
  const favorite = Boolean(
    favorites.data?.some((item) => item.id === id && item.isActive),
  );
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
      <div
        className={`${embedded ? "hero-action-tools" : "container detail-tools"}`}
        aria-label="أدوات التشريع"
      >
        <button
          type="button"
          className="action-icon"
          aria-label="نسخ رابط التشريع"
          title="نسخ الرابط"
          onClick={async () => {
            await navigator.clipboard?.writeText(location.href);
            setMsg("نُسخ الرابط.");
          }}
        >
          <UiIcon name="link" />
        </button>
        <button
          type="button"
          className="action-icon"
          aria-label="طباعة التشريع"
          title="طباعة"
          onClick={() => window.print()}
        >
          <UiIcon name="print" />
        </button>
        <button
          type="button"
          className="action-icon"
          aria-label="مشاركة التشريع"
          title="مشاركة"
          onClick={async () => {
            if (navigator.share)
              await navigator.share({
                title: document.title,
                url: location.href,
              });
            else await navigator.clipboard?.writeText(location.href);
          }}
        >
          <UiIcon name="share" />
        </button>
        {sourceAvailable ? (
          <a
            className="action-icon"
            href={`/ar/legislations/${id}/download`}
            aria-label="تنزيل مصدر التشريع"
            title="تنزيل المصدر"
          >
            <UiIcon name="download" />
          </a>
        ) : (
          <button
            type="button"
            className="action-icon"
            disabled
            aria-label="لا يوجد ملف مصدر عام"
            title="لا يوجد ملف مصدر عام"
          >
            <UiIcon name="download" />
          </button>
        )}
        {auth.user ? (
          <>
            <button
              type="button"
              className="action-icon"
              aria-label={favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
              title={favorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}
              aria-pressed={favorite}
              onClick={toggle}
            >
              <UiIcon name="heart" fill={favorite ? "currentColor" : "none"} />
            </button>
            <details className="tool-popover">
              <summary
                className="action-icon"
                aria-label="إضافة ملاحظة خاصة"
                title="ملاحظة خاصة"
              >
                <UiIcon name="note" />
              </summary>
              <ToolForm id={id} kind="note" done={setMsg} />
            </details>
            <details className="tool-popover">
              <summary
                className="action-icon"
                aria-label="الإبلاغ عن مشكلة"
                title="إبلاغ"
              >
                <span aria-hidden="true">!</span>
              </summary>
              <ToolForm id={id} kind="report" done={setMsg} />
            </details>
          </>
        ) : (
          <Link
            className="action-icon"
            to="/ar/login"
            aria-label="تسجيل الدخول لاستخدام المفضلة والملاحظات"
            title="المفضلة والملاحظات"
          >
            <UiIcon name="heart" />
          </Link>
        )}
      </div>
      {msg && (
        <p
          className={`${embedded ? "tool-message hero-tool-message" : "container tool-message"}`}
          role="status"
        >
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
