import { useState } from "react";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { useApi } from "../../hooks/use-api";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteImpactDialog } from "./DeleteImpactDialog";

export function LifecycleActions({
  kind,
  id,
  label,
  onDone,
  allowDelete = true,
  allowState = true,
  showStatus = true,
}: {
  kind: string;
  id: string;
  label: string;
  onDone: (action?: "delete" | "enable" | "disable") => void;
  allowDelete?: boolean;
  allowState?: boolean;
  showStatus?: boolean;
}) {
  const auth = useAuth();
  const view = [
    "articles",
    "structure",
    "annexes",
    "relations",
    "legislations",
  ].includes(kind)
    ? "legislation.view"
    : ["types", "authorities", "subjects", "gazettes"].includes(kind)
      ? "reference.view"
      : ["pages", "navigation"].includes(kind)
        ? "settings.view"
        : ["synonyms", "synonym-sets"].includes(kind)
          ? "search.synonym.view"
          : kind.startsWith("amendment")
            ? "amendment.view"
            : kind === "users"
              ? "user.view"
              : "source.view";
  const path = `/admin/lifecycle/${kind}/${id}`;
  const state = useApi<{ isActive: boolean; resource: string }>(
    auth.hasPermission(view) ? path : null,
  );
  const [action, setAction] = useState<"delete" | "enable" | "disable" | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const record = state.data;
  if (!record)
    return state.error ? (
      <span role="status">
        تعذر تحميل حالة السجل{" "}
        <button type="button" className="link-button" onClick={state.retry}>
          إعادة المحاولة
        </button>
      </span>
    ) : null;
  const next = record.isActive ? "disable" : "enable";
  const verb =
    action === "delete"
      ? "حذف"
      : action === "disable"
        ? "تعطيل إداري"
        : "إعادة تفعيل";
  return (
    <>
      {allowState && showStatus && (
        <span className="tag">
          {record.isActive ? "فعال إدارياً" : "معطل إدارياً"}
        </span>
      )}
      {allowState && auth.hasPermission(`${record.resource}.${next}`) && (
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setReason("");
            setAction(next);
          }}
        >
          {record.isActive ? "تعطيل إداري" : "إعادة تفعيل"}
        </button>
      )}
      {allowDelete && auth.hasPermission(`${record.resource}.delete`) && (
        <button
          type="button"
          className="link-button danger"
          onClick={() => {
            setReason("");
            setAction("delete");
          }}
        >
          حذف
        </button>
      )}
      {action &&
        (action === "delete" &&
        (kind === "legislations" || kind === "imports") ? (
          <DeleteImpactDialog
            kind={kind}
            id={id}
            label={label}
            onClose={() => setAction(null)}
            onDone={() => {
              setAction(null);
              onDone("delete");
            }}
          />
        ) : (
          <ConfirmDialog
            title={`${verb}: ${label}`}
            description={
              action === "delete"
                ? "سيزال السجل من قوائم الإدارة بحذف منطقي. يمنع الخادم حذف السجلات المنشورة أو المرتبطة بعلاقات تمنع الحذف؛ يبقى التاريخ محفوظاً."
                : "يغيّر هذا الإجراء الإتاحة الإدارية داخل المنصة فقط. لا يغيّر النفاذ القانوني ولا يسجل إلغاءً تشريعياً؛ يبقى السجل وعلاقاته قابلين للإدارة."
            }
            confirmLabel={verb}
            destructive={action !== "enable"}
            onClose={() => setAction(null)}
            onConfirm={async () => {
              if (reason.trim().length < 3)
                throw new Error("اكتب سبباً واضحاً من ثلاثة أحرف على الأقل.");
              await apiRequest(path, {
                method: "PATCH",
                body: { action, reason },
              });
              setAction(null);
              if (action !== "delete") state.retry();
              onDone(action);
            }}
          >
            <label>
              سبب الإجراء
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                required
              />
            </label>
          </ConfirmDialog>
        ))}
    </>
  );
}
