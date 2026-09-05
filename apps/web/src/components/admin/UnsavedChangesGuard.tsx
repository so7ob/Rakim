import { useEffect } from "react";

export function UnsavedChangesGuard({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const links = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank") return;
      if (!window.confirm("لديك تغييرات غير محفوظة. هل تريد مغادرة الصفحة؟")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", links, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", links, true);
    };
  }, [active]);
  return active ? (
    <span className="unsaved-indicator" role="status">
      تغييرات غير محفوظة
    </span>
  ) : null;
}
