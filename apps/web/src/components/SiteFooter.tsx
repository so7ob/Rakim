import { Link } from "react-router-dom";
import { useSiteConfig } from "../site/SiteConfigContext";

export function SiteFooter() {
  const site = useSiteConfig();
  const links = site.navigation.filter((item) => item.location === "FOOTER");
  return (
    <footer className="site-footer">
      <div className="container footer-top-row">
        <div className="footer-identity">
          <strong>{String(site.settings["branding.site_name"])}</strong>
          <p>{String(site.settings["footer.disclaimer"])}</p>
        </div>
        <nav aria-label="روابط التذييل">
          {links.map((item) =>
            item.path.startsWith("https://") ? (
              <a key={item.id} href={item.path} rel="noreferrer">
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
      <div className="footer-bottom-row">
        <div className="container">
          <span>منصة يمنية محلية مستقلة</span>
          <span>© {new Date().getFullYear()} جميع الحقوق محفوظة</span>
        </div>
      </div>
    </footer>
  );
}
