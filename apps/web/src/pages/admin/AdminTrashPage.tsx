import { useEffect, useState } from "react";
import { apiRequest } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { AdminPageHeader } from "../../components/admin/AdminPageHeader";
import { AdminTabs } from "../../components/admin/AdminTabs";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";

interface DeletionBatch {
  id: string;
  rootKind: "legislations" | "imports";
  rootId: string;
  rootLabel: string;
  status: string;
  actorName: string | null;
  restoredByName: string | null;
  reason: string;
  summary: {
    groups?: Array<{
      key: string;
      label: string;
      count: number;
      required: boolean;
    }>;
  };
  restoreUntil: string;
  createdAt: string;
  restoredAt: string | null;
  purgedAt: string | null;
  lastError: string | null;
  itemCount: number;
  hasLaw: boolean;
  hasSource: boolean;
}

export function AdminTrashPage() {
  const batches = useApi<DeletionBatch[]>("/admin/deletions");
  const active = batches.data?.some((batch) =>
    ["CANCELLING", "PURGING"].includes(batch.status),
  );
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(batches.retry, 2_000);
    return () => window.clearInterval(timer);
  }, [active, batches.retry]);
  return (
    <section>
      <AdminPageHeader
        eyebrow="استعادة لمدة 30 يومًا"
        title="سلة المحذوفات"
        description="تُحفظ دفعة الحذف بعلاقاتها كاملة حتى موعد الإتلاف، ويمكن استعادتها كوحدة واحدة."
        breadcrumbs={[
          { label: "لوحة الإدارة", to: "/ar/admin" },
          { label: "إدارة المحتوى" },
          { label: "سلة المحذوفات" },
        ]}
        actions={
          <button className="button secondary" onClick={batches.retry}>
            تحديث
          </button>
        }
      />
      <AdminTabs
        label="سلة المحذوفات"
        items={[
          {
            label: "جميع الدفعات",
            to: "/ar/admin/trash",
            count: batches.data?.length,
            end: true,
          },
        ]}
      />
      {batches.loading ? (
        <LoadingCards />
      ) : batches.error ? (
        <ErrorPanel message={batches.error.message} retry={batches.retry} />
      ) : !batches.data?.length ? (
        <div className="admin-card empty-state">
          <h2>السلة فارغة</h2>
          <p>لا توجد دفعات حذف محفوظة.</p>
        </div>
      ) : (
        <div className="admin-list trash-list">
          {batches.data.map((batch) => (
            <TrashBatch key={batch.id} batch={batch} done={batches.retry} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrashBatch({
  batch,
  done,
}: {
  batch: DeletionBatch;
  done: () => void;
}) {
  const auth = useAuth();
  const [action, setAction] = useState<"restore" | "purge" | null>(null);
  const [reason, setReason] = useState("");
  const details = useApi<
    DeletionBatch & {
      items: Array<{
        kind: string;
        id: string;
        relationKey: string;
        label: string;
        required: boolean;
      }>;
    }
  >(`/admin/deletions/${batch.id}`);
  const canRestore =
    batch.status === "TRASHED" &&
    (!batch.hasLaw || auth.hasPermission("legislation.enable")) &&
    (!batch.hasSource || auth.hasPermission("source.enable"));
  const canPurge =
    ["TRASHED", "PURGE_FAILED"].includes(batch.status) &&
    (!batch.hasLaw || auth.hasPermission("legislation.delete")) &&
    (!batch.hasSource || auth.hasPermission("source.delete"));
  return (
    <article className="admin-card trash-card">
      <header>
        <div>
          <span className="eyebrow dark">
            {batch.rootKind === "legislations" ? "تشريع" : "عملية استيراد"}
          </span>
          <h2>{batch.rootLabel}</h2>
          <p>
            حذفها {batch.actorName ?? "النظام"} — {batch.reason}
          </p>
        </div>
        <StatusBadge status={batch.status} />
      </header>
      <dl className="admin-definition-grid">
        <div>
          <dt>تاريخ الحذف</dt>
          <dd>{new Date(batch.createdAt).toLocaleString("ar-YE")}</dd>
        </div>
        <div>
          <dt>موعد الإتلاف</dt>
          <dd>{new Date(batch.restoreUntil).toLocaleString("ar-YE")}</dd>
        </div>
        <div>
          <dt>العناصر</dt>
          <dd>{batch.itemCount}</dd>
        </div>
      </dl>
      {batch.lastError && (
        <p className="form-error" role="alert">
          فشل الإتلاف: {batch.lastError}
        </p>
      )}
      <details className="trash-impact-details">
        <summary>عرض أثر الدفعة</summary>
        {details.loading ? (
          <p>جار تحميل العلاقات…</p>
        ) : details.error ? (
          <ErrorPanel message={details.error.message} retry={details.retry} />
        ) : (
          <ul>
            {details.data?.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <span>{item.label}</span>
                <small>{item.relationKey}</small>
              </li>
            ))}
          </ul>
        )}
      </details>
      <div className="admin-entity-actions">
        {canRestore && (
          <button
            className="button secondary"
            onClick={() => setAction("restore")}
          >
            استعادة الدفعة
          </button>
        )}
        {canPurge && (
          <button className="button danger" onClick={() => setAction("purge")}>
            إتلاف الآن
          </button>
        )}
      </div>
      {action && (
        <ConfirmDialog
          title={
            action === "restore" ? "استعادة الدفعة" : "إتلاف الدفعة نهائيًا"
          }
          description={
            action === "restore"
              ? "ستُعاد جميع العلاقات التي كانت فعالة وقت الحذف كوحدة واحدة."
              : "سيُحذف المحتوى والملفات فعليًا ولا يمكن استعادتها بعد اكتمال المهمة."
          }
          confirmLabel={action === "restore" ? "استعادة" : "إتلاف نهائي"}
          destructive={action === "purge"}
          onClose={() => setAction(null)}
          onConfirm={async () => {
            if (reason.trim().length < 3)
              throw new Error("اكتب سببًا واضحًا من ثلاثة أحرف على الأقل.");
            await apiRequest(`/admin/deletions/${batch.id}/${action}`, {
              body: { reason },
            });
            setAction(null);
            setReason("");
            done();
          }}
        >
          <label>
            سبب الإجراء
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              maxLength={1000}
            />
          </label>
        </ConfirmDialog>
      )}
    </article>
  );
}
