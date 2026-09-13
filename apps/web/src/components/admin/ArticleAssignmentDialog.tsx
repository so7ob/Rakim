import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../../api";
import { useApi } from "../../hooks/use-api";
import { ErrorPanel } from "../StatePanel";
import { structureNodeName, type StructureNodeItem } from "./StructureTree";

export interface AssignmentArticle {
  id: string;
  currentLabel: string;
  publishedLabel: string;
  sortKey: string;
  structureNodeId: string | null;
  structureLabel: string | null;
  structureTitle: string | null;
  textPreview: string;
  articleTitle: string;
  versionStatus: string;
}

interface AssignmentList {
  node: {
    id: string;
    legislationId: string;
    labelAr: string | null;
    titleAr: string;
    legislationStatus: string;
  };
  items: AssignmentArticle[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
}

interface AssignmentResult {
  summary: {
    changedCount: number;
    assignedCount: number;
    movedCount: number;
    unassignedCount: number;
    directArticleCount: number;
  };
}

type Filter = "all" | "unassigned" | "current" | "elsewhere";

const filterLabels: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "unassigned", label: "غير مرتبطة" },
  { value: "current", label: "مرتبطة هنا" },
  { value: "elsewhere", label: "مرتبطة بعنصر آخر" },
];

export function ArticleAssignmentDialog({
  legislationId,
  node,
  onClose,
  onSuccess,
}: {
  legislationId: string;
  node: StructureNodeItem;
  onClose: () => void;
  onSuccess: (result: AssignmentResult) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { data, error, loading, retry } = useApi<AssignmentList>(
    `/admin/structure/${node.id}/articles?pageSize=500`,
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [changes, setChanges] = useState<Record<string, boolean>>({});
  const [fromLabel, setFromLabel] = useState("");
  const [toLabel, setToLabel] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!dialog.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (
        event.shiftKey &&
        (active === first || active === dialog.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || active === dialog.current)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);

  const items = data?.items ?? [];
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ar");
    return items.filter((article) => {
      const assignmentMatches =
        filter === "all" ||
        (filter === "unassigned" && !article.structureNodeId) ||
        (filter === "current" && article.structureNodeId === node.id) ||
        (filter === "elsewhere" &&
          Boolean(
            article.structureNodeId && article.structureNodeId !== node.id,
          ));
      if (!assignmentMatches) return false;
      if (!needle) return true;
      return [
        article.currentLabel,
        article.publishedLabel,
        article.articleTitle,
        article.textPreview,
      ].some((value) => value?.toLocaleLowerCase("ar").includes(needle));
    });
  }, [filter, items, node.id, query]);

  const selected = (article: AssignmentArticle) =>
    changes[article.id] ?? article.structureNodeId === node.id;
  const setVisibleSelection = (value: boolean) => {
    setConfirming(false);
    setChanges((current) => {
      const next = { ...current };
      for (const article of visible) {
        const initial = article.structureNodeId === node.id;
        if (initial === value) delete next[article.id];
        else next[article.id] = value;
      }
      return next;
    });
  };

  const selectRange = () => {
    setConfirming(false);
    setMessage("");
    if ((data?.meta.total ?? 0) > items.length) {
      setMessage(
        "يتجاوز التشريع 500 مادة؛ استخدم البحث والاختيار المباشر لتجنب نطاق ناقص.",
      );
      return;
    }
    const fromMatches = items
      .map((article, index) => ({ article, index }))
      .filter(
        ({ article }) => article.currentLabel.trim() === fromLabel.trim(),
      );
    const toMatches = items
      .map((article, index) => ({ article, index }))
      .filter(({ article }) => article.currentLabel.trim() === toLabel.trim());
    if (fromMatches.length !== 1 || toMatches.length !== 1) {
      setMessage(
        "أدخل وسمين مطابقين وفريدين. عند تكرار الوسم استخدم التحديد المباشر.",
      );
      return;
    }
    const start = Math.min(fromMatches[0]!.index, toMatches[0]!.index);
    const end = Math.max(fromMatches[0]!.index, toMatches[0]!.index);
    setChanges((current) => {
      const next = { ...current };
      for (const article of items.slice(start, end + 1)) {
        if (article.structureNodeId === node.id) delete next[article.id];
        else next[article.id] = true;
      }
      return next;
    });
    setMessage(`تم تحديد ${end - start + 1} مادة وفق ترتيب الوثيقة.`);
  };

  const assign = Object.entries(changes)
    .filter(([, value]) => value)
    .map(([id]) => id);
  const unassign = Object.entries(changes)
    .filter(([, value]) => !value)
    .map(([id]) => id);
  const movedCount = assign.filter((id) => {
    const assignment = items.find(
      (article) => article.id === id,
    )?.structureNodeId;
    return Boolean(assignment && assignment !== node.id);
  }).length;

  const submit = async () => {
    const reason = dialog.current?.querySelector<HTMLInputElement>(
      'input[name="assignmentReason"]',
    )?.value;
    if (!assign.length && !unassign.length) {
      setMessage("لم تغيّر أي ربط بعد.");
      return;
    }
    if (!reason || reason.trim().length < 3) {
      setMessage("اكتب سببًا واضحًا من ثلاثة أحرف على الأقل.");
      return;
    }
    if (movedCount && !confirming) {
      setConfirming(true);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await apiRequest<AssignmentResult>(
        `/admin/structure/${node.id}/articles`,
        {
          method: "PATCH",
          body: { legislationId, assign, unassign, reason: reason.trim() },
        },
      );
      onSuccess(result);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "تعذر حفظ الربط.");
      setConfirming(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop assignment-backdrop" role="presentation">
      <div
        ref={dialog}
        className="modal assignment-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assignment-title"
        tabIndex={-1}
      >
        <header>
          <div>
            <span className="eyebrow dark">ربط ونقل جماعي</span>
            <h2 id="assignment-title">
              ربط المواد بـ: {structureNodeName(node)}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="إغلاق نافذة ربط المواد"
            disabled={saving}
          >
            ×
          </button>
        </header>
        <div className="modal-body assignment-body">
          {loading ? (
            <p role="status">جار تحميل مواد التشريع…</p>
          ) : error ? (
            <ErrorPanel message={error.message} retry={retry} />
          ) : (
            <>
              <label className="assignment-search">
                البحث برقم المادة أو عنوانها
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="مثال: 12 أو الأحكام المالية"
                />
              </label>
              <div className="assignment-filters" aria-label="حالة الربط">
                {filterLabels.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    aria-pressed={filter === item.value}
                    onClick={() => setFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="assignment-tools">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setVisibleSelection(true)}
                  disabled={!visible.length}
                >
                  تحديد الظاهر ({visible.length})
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setVisibleSelection(false)}
                  disabled={!visible.length}
                >
                  إلغاء تحديد الظاهر
                </button>
                <span aria-live="polite">
                  {Object.keys(changes).length} تغيير معلق
                </span>
              </div>
              <fieldset className="range-selector">
                <legend>تحديد نطاق وفق ترتيب الوثيقة</legend>
                <label>
                  من المادة
                  <input
                    value={fromLabel}
                    onChange={(event) => setFromLabel(event.target.value)}
                  />
                </label>
                <label>
                  إلى المادة
                  <input
                    value={toLabel}
                    onChange={(event) => setToLabel(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  onClick={selectRange}
                >
                  تحديد النطاق
                </button>
              </fieldset>
              {visible.length ? (
                <ul className="article-picker-list" aria-label="مواد التشريع">
                  {visible.map((article) => {
                    const elsewhere = Boolean(
                      article.structureNodeId &&
                      article.structureNodeId !== node.id,
                    );
                    return (
                      <li key={article.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={selected(article)}
                            onChange={(event) => {
                              setConfirming(false);
                              const value = event.target.checked;
                              setChanges((current) => {
                                const next = { ...current };
                                if (
                                  (article.structureNodeId === node.id) ===
                                  value
                                )
                                  delete next[article.id];
                                else next[article.id] = value;
                                return next;
                              });
                            }}
                          />
                          <span>
                            <strong>المادة {article.currentLabel}</strong>
                            <small>{article.textPreview}</small>
                            <em>
                              {article.structureNodeId === node.id
                                ? "مرتبطة هنا حاليًا"
                                : elsewhere
                                  ? `مرتبطة حاليًا بـ: ${[
                                      article.structureLabel,
                                      article.structureTitle,
                                    ]
                                      .filter(Boolean)
                                      .join(" — ")}`
                                  : "غير مرتبطة"}
                            </em>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="empty-state">لا توجد مواد تطابق البحث والفلتر.</p>
              )}
              {(data?.meta.total ?? 0) > items.length && (
                <p className="form-warning">
                  تعرض هذه الجولة أول 500 مادة. استخدم بحث API المرقّم للمواد
                  الإضافية.
                </p>
              )}
              <label className="assignment-reason">
                سبب التصحيح
                <input
                  name="assignmentReason"
                  required
                  minLength={3}
                  placeholder="سبب يظهر في سجل التدقيق"
                />
              </label>
              {confirming && (
                <div className="move-confirmation" role="alert">
                  <strong>
                    سيتم نقل {movedCount} مادة من مواقعها الحالية إلى{" "}
                    {node.titleAr}.
                  </strong>
                  <span>راجع العدد ثم اضغط «تأكيد النقل والحفظ».</span>
                </div>
              )}
            </>
          )}
          {message && (
            <p className="form-message" role="alert">
              {message}
            </p>
          )}
        </div>
        <footer>
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={saving}
          >
            إلغاء
          </button>
          <button
            type="button"
            className="button"
            onClick={submit}
            disabled={loading || Boolean(error) || saving}
          >
            {saving
              ? "جار الحفظ…"
              : confirming
                ? "تأكيد النقل والحفظ"
                : "حفظ التغييرات"}
          </button>
        </footer>
      </div>
    </div>
  );
}
