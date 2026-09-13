import { useState } from "react";
import { useApi } from "../../hooks/use-api";
export function DecisionHistory({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const state = useApi<
    Array<{
      id: string;
      reason: string;
      actorName: string | null;
      occurredAt: string;
    }>
  >(open ? path : null);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>سجل المعالجة</summary>
      {state.loading ? (
        <p>جار التحميل…</p>
      ) : state.error ? (
        <p role="alert">{state.error.message}</p>
      ) : state.data?.length ? (
        <ul>
          {state.data.map((r) => (
            <li key={r.id}>
              {r.reason} — {r.actorName ?? "النظام"} —{" "}
              {new Date(r.occurredAt).toLocaleString("ar-YE")}
            </li>
          ))}
        </ul>
      ) : (
        <p>لا توجد معالجة مسجلة.</p>
      )}
    </details>
  );
}
