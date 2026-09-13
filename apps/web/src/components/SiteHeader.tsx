import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useSiteConfig } from "../site/SiteConfigContext";
import { YemenIdentity } from "./YemenIdentity";

type IconName =
  "menu" | "close" | "accessibility" | "home" | "account" | "search";

function HeaderIcon({ name }: { name: IconName }) {
  if (name === "menu")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    );
  if (name === "close")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m5 5 14 14M19 5 5 19" />
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

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const auth = useAuth();
  const site = useSiteConfig();
  const navigate = useNavigate();
  const links = site.navigation.filter((item) => item.location === "HEADER");

  useEffect(() => {
    if (!menuOpen && !searchOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("overlay-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("overlay-open");
    };
  }, [menuOpen, searchOpen]);

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchInput.current?.focus());
  }, [searchOpen]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = String(
      new FormData(event.currentTarget).get("q") ?? "",
    ).trim();
    if (!query) return;
    setSearchOpen(false);
    navigate(`/ar/search?q=${encodeURIComponent(query)}`);
  };

  const navigation = (className: string) => (
    <nav className={className} aria-label="التنقل الرئيسي">
      {links.map((item) =>
        item.path.startsWith("https://") ? (
          <a
            key={item.id}
            href={item.path}
            rel="noreferrer"
            onClick={() => setMenuOpen(false)}
          >
            {item.labelAr}
          </a>
        ) : (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={() => setMenuOpen(false)}
          >
            {item.labelAr}
          </NavLink>
        ),
      )}
      {auth.user && auth.user.roles.some((role) => role !== "READER") && (
        <NavLink to="/ar/admin" onClick={() => setMenuOpen(false)}>
          الإدارة
        </NavLink>
      )}
    </nav>
  );

  return (
    <>
      <header className="site-header">
        <div className="container header-row">
          <Link
            className="brand"
            to="/ar"
            aria-label={`${String(site.settings["branding.site_name"])} — الرئيسية`}
          >
            <YemenIdentity />
          </Link>
          {site.settings["header.search_enabled"] !== false && (
            <form
              className="header-search"
              role="search"
              onSubmit={submitSearch}
            >
              <label className="sr-only" htmlFor="header-search-input">
                البحث في التشريعات
              </label>
              <button type="submit" aria-label="تنفيذ البحث" data-tooltip="بحث">
                <HeaderIcon name="search" />
              </button>
              <input
                id="header-search-input"
                name="q"
                placeholder="بحث"
                autoComplete="off"
              />
            </form>
          )}
          {navigation("nav desktop-nav")}
          <div className="header-utilities" aria-label="أدوات الموقع">
            <button
              className="menu-button header-icon-button"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              data-tooltip="القائمة الرئيسية"
              onClick={() => setMenuOpen((value) => !value)}
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
                data-tooltip="إتاحة القراءة"
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
            <Link
              className="header-icon-button"
              to={auth.user ? "/ar/account" : "/ar/login"}
              aria-label={
                auth.user ? `حساب ${auth.user.displayName}` : "تسجيل الدخول"
              }
              data-tooltip={auth.user ? "حسابي" : "تسجيل الدخول"}
            >
              <HeaderIcon name="account" />
            </Link>
            {site.settings["header.search_enabled"] !== false && (
              <button
                className="header-icon-button mobile-search-button"
                type="button"
                aria-label="فتح البحث"
                aria-expanded={searchOpen}
                data-tooltip="بحث"
                onClick={() => setSearchOpen(true)}
              >
                <HeaderIcon name="search" />
              </button>
            )}
          </div>
        </div>
      </header>
      <div
        className={`mobile-navigation-shell${menuOpen ? " open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <button
          className="navigation-scrim"
          type="button"
          aria-label="إغلاق القائمة"
          onClick={() => setMenuOpen(false)}
        />
        <div
          className="mobile-navigation"
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="القائمة الرئيسية"
        >
          <button
            className="drawer-close"
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setMenuOpen(false)}
          >
            <HeaderIcon name="close" />
          </button>
          <strong>{String(site.settings["branding.site_name"])}</strong>
          {navigation("mobile-nav")}
        </div>
      </div>
      {searchOpen && (
        <div
          className="search-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-overlay-title"
        >
          <button
            className="search-overlay-scrim"
            type="button"
            aria-label="إغلاق البحث"
            onClick={() => setSearchOpen(false)}
          />
          <div className="search-overlay-panel">
            <button
              className="overlay-close"
              type="button"
              aria-label="إغلاق البحث"
              onClick={() => setSearchOpen(false)}
            >
              <HeaderIcon name="close" />
            </button>
            <h2 id="search-overlay-title">البحث في التشريعات</h2>
            <form role="search" onSubmit={submitSearch}>
              <label htmlFor="global-search-input">
                العنوان أو الرقم أو نص المادة
              </label>
              <div>
                <input
                  ref={searchInput}
                  id="global-search-input"
                  name="q"
                  autoComplete="off"
                />
                <button type="submit">
                  <HeaderIcon name="search" />
                  <span>بحث</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
