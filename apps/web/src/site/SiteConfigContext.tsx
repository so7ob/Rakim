import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet } from "../api";

export interface SiteNavigationItem {
  id: string;
  location: "HEADER" | "FOOTER";
  labelAr: string;
  path: string;
  sortOrder: number;
}
export interface SiteConfig {
  settings: Record<string, string | boolean>;
  navigation: SiteNavigationItem[];
}
const defaults: SiteConfig = {
  settings: {
    "branding.site_name": "منصة التشريعات اليمنية",
    "branding.country_name": "الجمهورية اليمنية",
    "branding.subtitle": "مرجع قانوني غير رسمي",
    "branding.logo_url": "",
    "branding.show_default_emblem": true,
    "theme.navy": "#314B67",
    "theme.burgundy": "#AD405B",
    "theme.sand": "#9B7C57",
    "theme.surface_rose": "#F7F2F4",
    "theme.surface_gray": "#E6E8EB",
    "theme.hero_start": "#AD405B",
    "theme.hero_end": "#314B67",
    "theme.page_background": "#FBFBFC",
    "theme.hero_background_url": "",
    "typography.legal_size": "22",
    "tabs.overview_label": "نص التشريع",
    "tabs.modifications_label": "التعديلات",
    "tabs.regulations_label": "اللوائح والجداول",
    "tabs.related_label": "ذات الصلة",
    "header.search_enabled": true,
    "header.language_enabled": true,
    "header.accessibility_enabled": true,
    "hero.pattern_enabled": true,
    "footer.disclaimer":
      "بيانات العرض الحالية اصطناعية للتطوير ولا تعد نصوصًا رسمية.",
  },
  navigation: [
    {
      id: "default-header-1",
      location: "HEADER",
      labelAr: "التشريعات",
      path: "/ar/legislations",
      sortOrder: 10,
    },
    {
      id: "default-header-2",
      location: "HEADER",
      labelAr: "البحث المتقدم",
      path: "/ar/search",
      sortOrder: 20,
    },
    {
      id: "default-header-3",
      location: "HEADER",
      labelAr: "آخر التعديلات",
      path: "/ar/latest-modifications",
      sortOrder: 30,
    },
    {
      id: "default-header-4",
      location: "HEADER",
      labelAr: "عن المنصة",
      path: "/ar/about-us",
      sortOrder: 40,
    },
    {
      id: "default-footer-1",
      location: "FOOTER",
      labelAr: "التشريعات",
      path: "/ar/legislations",
      sortOrder: 10,
    },
    {
      id: "default-footer-2",
      location: "FOOTER",
      labelAr: "البحث",
      path: "/ar/search",
      sortOrder: 20,
    },
    {
      id: "default-footer-3",
      location: "FOOTER",
      labelAr: "عن المنصة",
      path: "/ar/about-us",
      sortOrder: 30,
    },
    {
      id: "default-footer-4",
      location: "FOOTER",
      labelAr: "تواصل معنا",
      path: "/ar/contact-us",
      sortOrder: 40,
    },
  ],
};
interface SiteContextValue extends SiteConfig {
  refresh: () => Promise<void>;
}
const SiteContext = createContext<SiteContextValue>({
  ...defaults,
  refresh: async () => undefined,
});

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(defaults);
  const refresh = useCallback(async () => {
    setConfig(await apiGet<SiteConfig>("/site/config"));
  }, []);
  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);
  useEffect(() => {
    const s = config.settings;
    const root = document.documentElement;
    const variables: Record<string, string> = {
      "--color-navy": String(s["theme.navy"]),
      "--color-burgundy": String(s["theme.burgundy"]),
      "--color-sand": String(s["theme.sand"]),
      "--color-surface-rose": String(s["theme.surface_rose"]),
      "--color-surface-gray": String(s["theme.surface_gray"]),
      "--hero-gradient": `linear-gradient(110deg,${String(s["theme.hero_start"])} 0%,${String(s["theme.hero_end"])} 100%)`,
      "--page-background": String(s["theme.page_background"]),
      "--legal-font-size": `${Math.min(32, Math.max(16, Number(s["typography.legal_size"]) || 22))}px`,
      "--hero-background-image": s["theme.hero_background_url"]
        ? `url("${String(s["theme.hero_background_url"]).replace(/["\\]/g, "")}")`
        : "none",
    };
    for (const [key, value] of Object.entries(variables))
      root.style.setProperty(key, value);
    root.classList.toggle(
      "hide-hero-pattern",
      s["hero.pattern_enabled"] === false,
    );
  }, [config]);
  const value = useMemo(() => ({ ...config, refresh }), [config, refresh]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteConfig() {
  return useContext(SiteContext);
}
