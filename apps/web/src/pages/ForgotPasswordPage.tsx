import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../api";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const username = String(
      new FormData(event.currentTarget).get("username") ?? "",
    );
    setSaving(true);
    setError("");
    try {
      const result = await apiRequest<{ message: string }>(
        "/auth/password-recovery",
        { body: { username } },
      );
      setSent(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الطلب.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="auth-page">
      <section className="login-card" aria-labelledby="forgot-title">
        <span className="eyebrow dark">استعادة الوصول</span>
        <h1 id="forgot-title">إعادة تعيين كلمة المرور</h1>
        {sent ? (
          <p role="status">{sent}</p>
        ) : (
          <form onSubmit={submit}>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <p>
              سيراجع مسؤول مخوّل الطلب ويتحقق من هويتك قبل تسليمك رابطاً مؤقتاً.
            </p>
            <label>
              اسم المستخدم
              <input
                name="username"
                autoComplete="username"
                minLength={2}
                maxLength={120}
                required
                disabled={saving}
              />
            </label>
            <button className="button" disabled={saving}>
              {saving ? "جار إرسال الطلب…" : "إرسال طلب الاستعادة"}
            </button>
          </form>
        )}
        <Link className="text-link" to="/ar/login">
          العودة إلى تسجيل الدخول
        </Link>
      </section>
    </div>
  );
}
