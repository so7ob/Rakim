import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";
export function ResetPasswordPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  return (
    <div className="auth-page">
      <section className="login-card">
        <h1>اختيار كلمة مرور جديدة</h1>
        {message ? (
          <p role="status">{message}</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (saving) return;
              const f = new FormData(e.currentTarget);
              if (f.get("password") !== f.get("confirm")) {
                setError("كلمتا المرور غير متطابقتين.");
                return;
              }
              setSaving(true);
              setError("");
              try {
                const r = await apiRequest<{ message: string }>(
                  "/auth/password-recovery/complete",
                  { body: { token, password: f.get("password") } },
                );
                setMessage(r.message);
              } catch (err) {
                setError(err instanceof Error ? err.message : "تعذر الحفظ.");
              } finally {
                setSaving(false);
              }
            }}
          >
            <p>
              الرابط صالح لمدة 15 دقيقة ويُستخدم مرة واحدة. استخدم 12 محرفاً على
              الأقل تشمل أحرفاً لاتينية وأرقاماً.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <label>
              كلمة المرور الجديدة
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
                required
                disabled={saving}
              />
            </label>
            <label>
              تأكيد كلمة المرور
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                disabled={saving}
              />
            </label>
            <button className="button" disabled={saving || !token}>
              {saving ? "جار الحفظ…" : "حفظ كلمة المرور"}
            </button>
            {!token && (
              <p role="alert">
                رابط الاستعادة غير مكتمل. اطلب رابطاً من مسؤول النظام.
              </p>
            )}
          </form>
        )}
        <Link to="/ar/login">العودة إلى تسجيل الدخول</Link>
      </section>
    </div>
  );
}
