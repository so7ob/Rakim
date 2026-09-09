import { useState } from "react";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { ConfirmDialog } from "./ConfirmDialog";

export function SearchReindexAction({
  onSuccess,
}: {
  onSuccess: (count: number) => void;
}) {
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  if (!auth.hasPermission("search.index.rebuild")) return null;
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => setConfirming(true)}
      >
        إعادة بناء الفهرس
      </button>
      {confirming && (
        <ConfirmDialog
          title="إعادة بناء فهرس البحث؟"
          description="سيعيد النظام اشتقاق فهرس البحث من البيانات الحالية. قد تستغرق العملية بعض الوقت."
          confirmLabel="بدء إعادة البناء"
          destructive={false}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await apiRequest<{ count: number }>(
              "/admin/reindex",
            );
            setConfirming(false);
            onSuccess(result.count);
          }}
        />
      )}
    </>
  );
}
