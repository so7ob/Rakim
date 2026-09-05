import { useSiteConfig } from "../site/SiteConfigContext";

export function YemenIdentity() {
  const { settings } = useSiteConfig();
  const logoUrl = String(settings["branding.logo_url"] ?? "");
  const showEmblem = settings["branding.show_default_emblem"] !== false;
  return (
    <span className="yemen-identity" aria-hidden="true">
      {logoUrl ? (
        <img className="yemen-eagle custom-site-logo" src={logoUrl} alt="" />
      ) : showEmblem ? (
        <svg
          className="yemen-eagle"
          viewBox="0 0 86 92"
          role="img"
          aria-label="رمز نسر يمني مبسط غير رسمي"
        >
          <path
            d="M43 9c4 0 7 3 8 7l4 1c-2 2-4 4-7 5l-1 7c10-9 20-13 30-14-4 8-9 15-16 21 7-3 13-4 19-4-5 8-13 15-23 20l5 5-9 4-10-9-10 9-9-4 5-5C19 47 11 40 6 32c6 0 12 1 19 4-7-6-12-13-16-21 10 1 20 5 30 14l-1-7c-3-1-5-3-7-5l4-1c1-4 4-7 8-7Z"
            fill="currentColor"
          />
          <path d="M30 44h26v30L43 83 30 74Z" fill="#fff" stroke="#9b7c57" />
          <path d="M31 45h24v9H31Z" fill="#ce1126" />
          <path d="M31 63h24v10H31Z" fill="#111" />
          <path
            d="M20 78c14 5 32 5 46 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      <span className="identity-copy">
        <span className="identity-country">
          <span className="yemen-flag">
            <i />
            <i />
            <i />
          </span>
          {String(settings["branding.country_name"])}
        </span>
        <strong>{String(settings["branding.site_name"])}</strong>
        <small>{String(settings["branding.subtitle"])}</small>
      </span>
    </span>
  );
}
