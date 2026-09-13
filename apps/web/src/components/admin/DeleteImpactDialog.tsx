import { useEffect, useRef, useState } from "react";
import { apiRequest } from "../../api";
import { useApi } from "../../hooks/use-api";
import { ErrorPanel } from "../StatePanel";
import { AdminDialog } from "./AdminDialog";

interface ImpactItem {
  kind: string;
  id: string;
  label: string;
  status?: string | null;
}
interface ImpactGroup {
  key: string;
  label: string;
  required: boolean;
  selectedByDefault: boolean;
  selectable: boolean;
  count: number;
  items: ImpactItem[];
  blockers?: string[];
}
interface DeleteImpact {
  root: { kind: string; id: string; label: string };
  allowed: boolean;
  blockers: string[];
  groups: ImpactGroup[];
  impactToken: string;
  restoreDays: number;
}

export function DeleteImpactDialog({
  kind,
  id,
  label,
  onClose,
  onDone,
}: {
  kind: "legislations" | "imports";
  id: string;
  label: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const impact = useApi<DeleteImpact>(
    `/admin/lifecycle/${kind}/${id}/delete-impact`,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    if (!impact.data) return;
    setSelected(
      new Set(
        impact.data.groups
          .filter((group) => group.selectedByDefault)
          .map((group) => group.key),
      ),
    );
  }, [impact.data?.impactToken]);
  const chosenOptional = [...selected].filter(
    (key) => impact.data?.groups.find((group) => group.key === key)?.selectable,
  );
  return (
    <AdminDialog
      title={`أثر حذف: ${label}`}
      description={`ستُنقل المجموعة إلى سلة المحذوفات لمدة ${impact.data?.restoreDays ?? 30} يومًا قبل الإتلاف النهائي.`}
      size="large"
      dirty={Boolean(reason.trim())}
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
            className="button danger"
            disabled={submitting || !impact.data?.allowed}
            onClick={async () => {
              if (pending.current) return;
              if (reason.trim().length < 3) {
                setError("اكتب سببًا واضحًا من ثلاثة أحرف على الأقل.");
                return;
              }
              pending.current = true;
              setSubmitting(true);
              setError("");
              try {
                await apiRequest(`/admin/lifecycle/${kind}/${id}`, {
                  method: "PATCH",
                  body: {
                    action: "delete",
                    reason,
                    impactToken: impact.data!.impactToken,
                    selectedOptionalKeys: chosenOptional,
                  },
                });
                onDone();
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "تعذر نقل المجموعة إلى السلة.",
                );
                if ((cause as { status?: number }).status === 409)
                  impact.retry();
              } finally {
                pending.current = false;
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "جار النقل…" : "نقل إلى السلة"}
          </button>
        </>
      }
    >
      {impact.loading ? (
        <p role="status">جار تحليل العلاقات…</p>
      ) : impact.error ? (
        <ErrorPanel message={impact.error.message} retry={impact.retry} />
      ) : (
        <div className="deletion-impact">
          {impact.data?.blockers.length ? (
            <div className="form-error" role="alert">
              <strong>لا يمكن حذف هذه المجموعة:</strong>
              <ul>
                {impact.data.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="form-message">
              راجع العناصر التالية. يمكن استعادة الدفعة كاملة قبل موعد الإتلاف.
            </p>
          )}
          {impact.data?.groups.map((group) => {
            const checked = group.required || selected.has(group.key);
            return (
              <details className="deletion-impact-group" key={group.key} open>
                <summary>
                  <label onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={group.required || !group.selectable}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(group.key);
                          else next.delete(group.key);
                          return next;
                        });
                      }}
                    />
                    <strong>{group.label}</strong>
                    <span>{group.count} عنصر</span>
                    {group.required && <span className="tag">إلزامي</span>}
                  </label>
                </summary>
                {group.blockers?.map((blocker) => (
                  <p className="form-hint" key={blocker}>
                    {blocker}
                  </p>
                ))}
                <ul>
                  {group.items.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <span>{item.label}</span>
                      {item.status && <small>{item.status}</small>}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          <label>
            سبب الحذف
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={1000}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </AdminDialog>
  );
}
