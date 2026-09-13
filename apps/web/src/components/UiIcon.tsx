import type { SVGProps } from "react";

export type UiIconName =
  | "back"
  | "download"
  | "heart"
  | "link"
  | "minus"
  | "note"
  | "plus"
  | "print"
  | "refresh"
  | "search"
  | "share"
  | "dashboard"
  | "content"
  | "access"
  | "settings"
  | "governance"
  | "chevron"
  | "menu";

export function UiIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: UiIconName }) {
  const paths: Record<UiIconName, React.ReactNode> = {
    back: <path d="m15 18-6-6 6-6M9 12h11" />,
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.7 0L12 5.7l-1.1-1.1a5.4 5.4 0 0 0-7.7 7.7L12 21l8.8-8.7a5.4 5.4 0 0 0 0-7.7Z" />
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1" />
      </>
    ),
    minus: <path d="M5 12h14" />,
    note: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h6M8 17h4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    print: (
      <>
        <path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M7 14h10v7H7z" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5" />
        <path d="M19 11a7.5 7.5 0 1 0 .2 4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="m8 11 8-5m-8 7 8 5" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    content: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M14 3v5h5M9 12h7M9 16h7" />
      </>
    ),
    access: (
      <>
        <circle cx="9" cy="8" r="4" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M17 11h4M19 9v4" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" transform="translate(2 0) scale(.83)" />
      </>
    ),
    governance: (
      <>
        <path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7z" />
        <path d="m8.5 12 2.2 2.2 4.8-5" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
