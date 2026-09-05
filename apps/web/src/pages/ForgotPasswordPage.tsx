import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(true);
  };
  return (
    <div className="auth-page">
      <section className="login-card" aria-labelledby="forgot-title">
        <span className="eyebrow dark">استعادة الوصول</span>
        <h1 id="forgot-title">إعادة تعيين كلمة المرور</h1>
        {sent ? (
          <p role="status">
            إذا كان الحساب موجودًا فسيستلم مدير النظام طلب الاستعادة. لا تعرض
            المنصة وجود الحساب من عدمه.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label>
              اسم المستخدم أو البريد الإلكتروني
              <input name="identity" autoComplete="username" required />
            </label>
            <button className="button">إرسال طلب الاستعادة</button>
          </form>
        )}
        <Link className="text-link" to="/ar/login">
          العودة إلى تسجيل الدخول
        </Link>
      </section>
    </div>
  );
}
