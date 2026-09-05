import { useState } from "react";

function ActionIcon({ name }: { name: "print" | "share" | "link" }) {
  if (name === "print")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 9V3h10v6M7 18H4V9h16v9h-3M7 14h10v7H7z" />
      </svg>
    );
  if (name === "share")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 14.5 5-5M7.2 17.8l-1 1a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0M16.8 6.2l1-1a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" />
    </svg>
  );
}

export function DocumentActions({ title }: { title: string }) {
  const [message, setMessage] = useState("");
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setMessage("نُسخ الرابط");
  };
  const share = async () => {
    if (navigator.share)
      await navigator.share({ title, url: window.location.href });
    else await copyLink();
  };
  return (
    <div className="document-actions" aria-label="إجراءات الوثيقة">
      <button type="button" onClick={() => history.back()} aria-label="الرجوع">
        <span aria-hidden="true">↶</span>
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        aria-label="طباعة الوثيقة"
      >
        <ActionIcon name="print" />
      </button>
      <button type="button" onClick={share} aria-label="مشاركة الوثيقة">
        <ActionIcon name="share" />
      </button>
      <button type="button" onClick={copyLink} aria-label="نسخ رابط الوثيقة">
        <ActionIcon name="link" />
      </button>
      <span className="document-action-message" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
