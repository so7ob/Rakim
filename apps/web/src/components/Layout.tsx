import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  const [open, setOpen] = useState(false);
  return <>
    <a className="skip-link" href="#main-content">تجاوز إلى المحتوى</a>
    <header className="site-header">
      <div className="container header-row">
        <Link className="brand" to="/ar" aria-label="منصة التشريعات اليمنية — الرئيسية">
          <span className="brand-mark" aria-hidden="true">ي</span>
          <span><strong>منصة التشريعات اليمنية</strong><small>مرجع عمل تجريبي غير رسمي</small></span>
        </Link>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>القائمة</button>
        <nav id="main-nav" className={open ? 'nav open' : 'nav'} aria-label="التنقل الرئيسي">
          <NavLink to="/ar">الرئيسية</NavLink><NavLink to="/ar/legislations">التشريعات</NavLink><NavLink to="/ar/search">البحث المتقدم</NavLink>
        </nav>
      </div>
    </header>
    <main id="main-content" tabIndex={-1}><Outlet /></main>
    <footer className="site-footer"><div className="container footer-grid"><div><strong>منصة التشريعات اليمنية</strong><p>بيانات العرض الحالية اصطناعية للتطوير ولا تعد نصوصًا رسمية.</p></div><nav aria-label="روابط التذييل"><Link to="/ar/legislations">التشريعات</Link><Link to="/ar/search">البحث</Link><a href="/api/docs">توثيق API</a></nav></div></footer>
  </>;
}

