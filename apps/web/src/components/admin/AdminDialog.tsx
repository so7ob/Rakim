import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function AdminDialog({
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = "إغلاق النافذة",
  size = "default",
  dirty = false,
  initialFocusRef,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  size?: "small" | "default" | "large";
  dirty?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const discardTitleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const dirtyRef = useRef(dirty);
  const onCloseRef = useRef(onClose);
  const [discardOpen, setDiscardOpen] = useState(false);
  const discardOpenRef = useRef(discardOpen);
  dirtyRef.current = dirty;
  onCloseRef.current = onClose;
  discardOpenRef.current = discardOpen;

  const requestClose = () => {
    if (dirtyRef.current) {
      setDiscardOpen(true);
      return;
    }
    onCloseRef.current();
  };

  useEffect(() => {
    if (!discardOpen) return;
    discardRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
  }, [discardOpen]);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const target =
        initialFocusRef?.current ??
        dialogRef.current?.querySelector<HTMLElement>(focusableSelector) ??
        dialogRef.current;
      target?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (discardOpenRef.current) {
          setDiscardOpen(false);
          return;
        }
        requestClose();
        return;
      }
      const activeDialog = discardOpenRef.current
        ? discardRef.current
        : dialogRef.current;
      if (event.key !== "Tab" || !activeDialog) return;
      const focusable = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === activeDialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus();
    };
  }, [initialFocusRef]);

  return (
    <div
      className="modal-backdrop admin-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal admin-dialog admin-dialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={discardOpen ? true : undefined}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={requestClose}
            aria-label={closeLabel}
          >
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
      {discardOpen && (
        <div
          className="modal-backdrop admin-dialog-discard-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDiscardOpen(false);
          }}
        >
          <div
            ref={discardRef}
            className="modal admin-dialog admin-dialog-small"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={discardTitleId}
            tabIndex={-1}
          >
            <header>
              <h2 id={discardTitleId}>إغلاق دون حفظ؟</h2>
            </header>
            <div className="modal-body">
              <p>لديك تغييرات غير محفوظة. ستفقدها إذا أغلقت النافذة.</p>
            </div>
            <footer>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDiscardOpen(false)}
              >
                متابعة التحرير
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => onCloseRef.current()}
              >
                إغلاق دون حفظ
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
