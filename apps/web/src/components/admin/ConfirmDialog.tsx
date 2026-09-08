import { useState } from "react";
import { AdminDialog } from "./AdminDialog";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = true,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  destructive?: boolean;
}) {
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
              setSubmitting(true);
              setError("");
              try {
                await onConfirm();
              } catch (reason) {
                setError(
                  reason instanceof Error ? reason.message : "تعذر تنفيذ الإجراء.",
                );
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "جار التنفيذ…" : confirmLabel}
          </button>
        </>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </AdminDialog>
  );
}
