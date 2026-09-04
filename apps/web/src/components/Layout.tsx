import { useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { YemenIdentity } from "./YemenIdentity";
import { useSiteConfig } from "../site/SiteConfigContext";

function HeaderIcon({
  name,
}: {
  name: "menu" | "accessibility" | "home" | "account" | "search";
}) {
  if (name === "menu")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  if (name === "home")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m3.5 10.5 8.5-7 8.5 7v9a1 1 0 0 1-1 1h-5v-6h-4v6h-5a1 1 0 0 1-1-1z" />
      </svg>
    );
  if (name === "account")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="7" r="4" />
        <path d="M4.5 21v-2.5a7.5 7.5 0 0 1 15 0V21" />
      </svg>
    );
  if (name === "accessibility")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="4" r="2" />
        <path d="M5 8.5h14M12 6.5V13m0 0-4 8m4-8 4 8m-7-8 3 2 3-2" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  const site = useSiteConfig();
  const headerLinks = site.navigation.filter(
    (item) => item.location === "HEADER",
  );
  const footerLinks = site.navigation.filter(
    (item) => item.location === "FOOTER",
  );
  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("q") ?? "",
    ).trim();
    if (query) navigate(`/ar/search?q=${encodeURIComponent(query)}`);
  };
  return (
    <>
      <a className="skip-link" href="#main-content">
        تجاوز إلى المحتوى
      </a>
      <header className="site-header">
        <div className="container header-row">
          <div className="header-utilities" aria-label="أدوات الموقع">
            <button
              className="menu-button header-icon-button"
              type="button"
              aria-expanded={open}
              aria-controls="main-nav"
              aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
              data-tooltip={open ? "إغلاق القائمة" : "القائمة الرئيسية"}
              onClick={() => setOpen(!open)}
            >
              <HeaderIcon name="menu" />
            </button>
            {site.settings["header.language_enabled"] !== false && (
              <span
                className="language-chip"
                aria-label="اللغة العربية"
                data-tooltip="اللغة العربية"
              >
                AR
              </span>
            )}
            {site.settings["header.accessibility_enabled"] !== false && (
              <button
                className="header-icon-button accessibility-button"
                type="button"
                aria-label={largeText ? "إعادة حجم النص" : "تكبير حجم النص"}
                aria-pressed={largeText}
                data-tooltip={largeText ? "إعادة حجم النص" : "تكبير حجم النص"}
                onClick={() => {
                  const next = !largeText;
                  setLargeText(next);
                  document.documentElement.classList.toggle(
                    "enhanced-reading",
                    next,
                  );
                }}
              >
                <HeaderIcon name="accessibility" />
              </button>
            )}
            <Link
              className="header-icon-button"
              to="/ar"
              aria-label="الصفحة الرئيسية"
              data-tooltip="الصفحة الرئيسية"
            >
              <HeaderIcon name="home" />
            </Link>
            {auth.user ? (
              <Link
                className="header-icon-button"
                to="/ar/account"
                aria-label={`حساب ${auth.user.displayName}`}
                data-tooltip="حسابي"
              >
                <HeaderIcon name="account" />
              </Link>
            ) : (
              <Link
                className="header-icon-button"
                to="/ar/login"
                aria-label="تسجيل الدخول"
                data-tooltip="تسجيل الدخول"
              >
                <HeaderIcon name="account" />
              </Link>
            )}
          </div>
          <nav
            id="main-nav"
            className={open ? "nav open" : "nav"}
            aria-label="التنقل الرئيسي"
          >
            {headerLinks.map((item) =>
              item.path.startsWith("https://") ? (
                <a key={item.id} href={item.path}>
                  {item.labelAr}
                </a>
              ) : (
                <NavLink key={item.id} to={item.path}>
                  {item.labelAr}
                </NavLink>
              ),
            )}
            {auth.user && auth.user.roles.some((role) => role !== "READER") && (
              <NavLink to="/ar/admin">الإدارة</NavLink>
            )}
          </nav>
          {site.settings["header.search_enabled"] !== false && (
            <form className="header-search" role="search" onSubmit={search}>
              <label className="sr-only" htmlFor="header-search-input">
                البحث في التشريعات
              </label>
              <input
                id="header-search-input"
                name="q"
                placeholder="بحث"
                autoComplete="off"
              />
              <button type="submit" aria-label="تنفيذ البحث" data-tooltip="بحث">
                <HeaderIcon name="search" />
              </button>
            </form>
          )}
          <Link
            className="brand"
            to="/ar"
            aria-label={`${String(site.settings["branding.site_name"])} — الرئيسية`}
          >
            <YemenIdentity />
          </Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <strong>{String(site.settings["branding.site_name"])}</strong>
            <p>{String(site.settings["footer.disclaimer"])}</p>
          </div>
          <nav aria-label="روابط التذييل">
            {footerLinks.map((item) =>
              item.path.startsWith("https://") ? (
                <a key={item.id} href={item.path}>
                  {item.labelAr}
                </a>
              ) : (
                <Link key={item.id} to={item.path}>
                  {item.labelAr}
                </Link>
              ),
            )}
            <a href="/api/docs">توثيق API</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
