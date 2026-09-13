import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";

export function UnsavedChangesGuard({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const links = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(anchor.href);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", links, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", links, true);
    };
  }, [active]);
  return (
    <>
      {active && (
        <span className="unsaved-indicator" role="status">
          تغييرات غير محفوظة
        </span>
      )}
      {pendingHref && (
        <ConfirmDialog
          title="مغادرة الصفحة دون حفظ؟"
          description="لديك تغييرات غير محفوظة وستفقدها عند الانتقال."
          confirmLabel="مغادرة الصفحة"
          onClose={() => setPendingHref(null)}
          onConfirm={() => {
            const target = new URL(pendingHref, window.location.href);
            setPendingHref(null);
            if (target.origin === window.location.origin)
              navigate(`${target.pathname}${target.search}${target.hash}`);
            else window.location.assign(target.href);
          }}
        />
      )}
    </>
  );
}
