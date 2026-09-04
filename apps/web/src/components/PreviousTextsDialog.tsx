import { useEffect, useRef, useState } from "react";
import { useApi } from "../hooks/use-api";
import type { PreviousVersion } from "../types";
import { ErrorPanel } from "./StatePanel";

export function PreviousTextsDialog({
  articleId,
  label,
  onClose,
}: {
  articleId: string;
  label: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const { data, error, loading, retry } = useApi<PreviousVersion[]>(
    `/articles/${articleId}/previous-texts`,
  );
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && dialog.current) {
        const focusable = [
          ...dialog.current.querySelectorAll<HTMLElement>(
            'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((el) => !el.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0]!,
          last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="previous-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow dark">المادة {label}</span>
            <h2 id="previous-title">النصوص السابقة</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="إغلاق نافذة النصوص السابقة"
          >
            ×
          </button>
        </header>
        <div className="modal-body">
          {loading ? (
            <p aria-live="polite">جار تحميل النسخ…</p>
          ) : error ? (
            <ErrorPanel message={error.message} retry={retry} />
          ) : (
            data?.map((version) => (
              <details className="version-card" key={version.id} open>
                <summary>
                  النسخة {version.versionNo} — من {version.validFrom} إلى{" "}
                  {version.validTo}
                </summary>
                <p className="legal-text">{version.fullText}</p>
                <dl className="inline-meta">
                  <div>
                    <dt>سبب الانتهاء</dt>
                    <dd>{version.endingReason}</dd>
                  </div>
                  <div>
                    <dt>المصدر</dt>
                    <dd>{version.sourceName}</dd>
                  </div>
                </dl>
                <button
                  className="link-button"
                  onClick={() =>
                    navigator.clipboard.writeText(version.fullText)
                  }
                >
                  نسخ هذه النسخة
                </button>
              </details>
            ))
          )}
        </div>
        <footer>
          <span className="copy-status" role="status">
            {copied ? "نُسخت كل النصوص." : ""}
          </span>
          <button
            className="button secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(
                (data ?? [])
                  .map(
                    (version) =>
                      `المادة ${label} — النسخة ${version.versionNo}\n${version.fullText}\n${version.validFrom} — ${version.validTo}\nالمصدر: ${version.sourceName}`,
                  )
                  .join("\n\n"),
              );
              setCopied(true);
            }}
          >
            نسخ الكل
          </button>
          <button className="button secondary" onClick={() => window.print()}>
            طباعة
          </button>
          <button className="button" onClick={onClose}>
            إغلاق
          </button>
        </footer>
      </div>
    </div>
  );
}
