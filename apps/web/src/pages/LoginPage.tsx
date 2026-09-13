import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  if (auth.user) return <Navigate to="/ar/admin" replace />;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      await auth.login(
        String(form.get("username") ?? ""),
        String(form.get("password") ?? ""),
      );
      const target =
        (location.state as { from?: string } | null)?.from ?? "/ar/admin";
      navigate(target, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تسجيل الدخول.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="auth-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark large" aria-hidden="true">
          ي
        </div>
        <span className="eyebrow dark">الوصول الإداري الآمن</span>
        <h1 id="login-title">تسجيل الدخول</h1>
        <p>
          أدخل حسابك للوصول إلى الاستيراد والمراجعة والإدارة وفق صلاحيات دورك.
        </p>
        <form onSubmit={submit}>
          <label>
            اسم المستخدم
            <input name="username" autoComplete="username" required autoFocus />
          </label>
          <label>
            كلمة المرور
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" disabled={submitting}>
            {submitting ? "جار التحقق…" : "تسجيل الدخول"}
          </button>
          <Link className="text-link" to="/ar/forgot-password">
            نسيت كلمة المرور؟
          </Link>
        </form>
        <p className="security-note">
          الجلسة محدودة المدة، وتُسجّل العمليات الإدارية في سجل التدقيق.
        </p>
      </section>
    </div>
  );
}
