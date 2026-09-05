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
    "theme.navy": "#344B61",
    "theme.burgundy": "#AC4459",
    "theme.sand": "#9B7C57",
    "theme.surface_rose": "#F7F2F4",
    "theme.surface_gray": "#E6E8EB",
    "theme.hero_start": "#AC4459",
    "theme.hero_end": "#344B61",
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

function contrastSafeColor(value: unknown) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(value));
  if (!match) return "#7B2E3D";
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(match[1]!.slice(offset, offset + 2), 16),
  );
  const luminance = (rgb: number[]) =>
    rgb
      .map((channel) => channel / 255)
      .map((channel) =>
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      )
      .reduce(
        (sum, channel, index) =>
          sum + channel * [0.2126, 0.7152, 0.0722][index]!,
        0,
      );
  // Use a 5:1 white-background target so the color also remains AA-safe on the
  // slightly darker rose surfaces used by chips and supporting links.
  if (1.05 / (luminance(channels) + 0.05) >= 5) return String(value);
  for (let factor = 0.9; factor >= 0.35; factor -= 0.05) {
    const candidate = channels.map((channel) => Math.round(channel * factor));
    if (1.05 / (luminance(candidate) + 0.05) >= 5)
      return `#${candidate.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }
  return "#5A2631";
}

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(defaults);
  const refresh = useCallback(async () => {
    const remote = await apiGet<SiteConfig>("/site/config");
    setConfig({
      settings: { ...defaults.settings, ...remote.settings },
      navigation: remote.navigation.length
        ? remote.navigation
        : defaults.navigation,
    });
  }, []);
  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);
  useEffect(() => {
    const s = config.settings;
    const root = document.documentElement;
    const variables: Record<string, string> = {
      "--color-navy": String(s["theme.navy"]),
      "--color-burgundy": contrastSafeColor(s["theme.burgundy"]),
      "--color-secondary": String(s["theme.navy"]),
      "--color-primary": String(s["theme.burgundy"]),
      "--color-action": contrastSafeColor(s["theme.burgundy"]),
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
