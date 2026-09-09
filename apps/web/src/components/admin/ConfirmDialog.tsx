import { useRef, useState, type ReactNode } from "react";
import { AdminDialog } from "./AdminDialog";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = true,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  destructive?: boolean;
  children?: ReactNode;
}) {
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  return (
    <AdminDialog
      title={title}
      description={description}
      size="small"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={submitting}
          >
            إلغاء
          </button>
          <button
            type="button"
            className={`button${destructive ? " danger" : ""}`}
            disabled={submitting}
            onClick={async () => {
              if (pending.current) return;
              pending.current = true;
              setSubmitting(true);
              setError("");
              try {
                await onConfirm();
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "تعذر تنفيذ الإجراء.",
                );
                setSubmitting(false);
                pending.current = false;
              }
            }}
          >
            {submitting ? "جار التنفيذ…" : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </AdminDialog>
  );
}
