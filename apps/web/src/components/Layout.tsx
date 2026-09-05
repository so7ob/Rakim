import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { BackToTop } from "./BackToTop";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return (
    <>
      <a className="skip-link" href="#main-content">
        تجاوز إلى المحتوى
      </a>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <BackToTop />
      <SiteFooter />
    </>
  );
}
