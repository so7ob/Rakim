import { useState } from "react";
import { ApiError } from "../../api";
type Revision = number | Record<string, number> | undefined;
interface Conflict {
  current: Record<string, unknown>;
  revision: Exclude<Revision, undefined>;
}
const names: Record<string, string> = {
  issueNumber: "رقم العدد",
  publicationDate: "تاريخ النشر",
  publisher: "الناشر",
  notes: "الملاحظات",
  code: "الرمز",
  nameAr: "الاسم العربي",
  isActive: "الحالة الإدارية",
  parentId: "الموضوع الأب",
  location: "الموضع",
  labelAr: "النص",
  path: "المسار",
  sortOrder: "الترتيب",
  isVisible: "ظاهر",
  eyebrowAr: "العنوان الأعلى",
  titleAr: "العنوان",
  introAr: "المقدمة",
  sections: "الأقسام",
  status: "الحالة",
};
const display = (value: unknown) =>
  typeof value === "boolean"
    ? value
      ? "نعم"
      : "لا"
    : value == null || value === ""
      ? "—"
      : typeof value === "object"
        ? JSON.stringify(value, null, 2)
        : String(value);
export function useEditConflict(initial: Revision) {
  const [revision, setRevision] = useState<Revision>(initial);
  const [pending, setPending] = useState<{
    conflict: Conflict;
    mine: Record<string, unknown>;
    form: HTMLFormElement;
    onMerge?: (values: Record<string, unknown>) => void;
  } | null>(null);
  const [choices, setChoices] = useState<Record<string, "current" | "mine">>(
    {},
  );
  const capture = (
    error: unknown,
    mine: Record<string, unknown>,
    form: HTMLFormElement,
    onMerge?: (values: Record<string, unknown>) => void,
  ) => {
    if (!(error instanceof ApiError) || !error.conflict) return false;
    setPending({ conflict: error.conflict, mine, form, onMerge });
    setChoices({});
    return true;
  };
  const notice = pending ? (
    <section className="admin-card" role="alert" style={{ minWidth: 0 }}>
      <h3>تعارض في التعديلات</h3>
      <p>
        مدخلاتك محفوظة أدناه. اختر القيمة التي تريدها لكل حقل؛ القيم الحالية هي
        الاختيار الافتراضي. بعد تطبيق الاختيارات راجع النموذج ثم احفظه.
      </p>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>الحقل</th>
              <th>القيمة الحالية</th>
              <th>تعديلك</th>
              <th>الاختيار</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(pending.conflict.current).map((key) => (
              <tr key={key}>
                <td>
                  {names[key] ??
                    (
                      pending.form.elements.namedItem(key) as Element | null
                    )?.parentElement?.textContent?.trim() ??
                    key}
                </td>
                <td
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {display(pending.conflict.current[key])}
                </td>
                <td
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {display(pending.mine[key])}
                </td>
                <td>
                  <select
                    aria-label={`اختيار ${names[key] ?? key}`}
                    value={choices[key] ?? "current"}
                    onChange={(e) =>
                      setChoices((old) => ({
                        ...old,
                        [key]: e.target.value as "current" | "mine",
                      }))
                    }
                  >
                    <option value="current">القيمة الحالية</option>
                    <option value="mine">تعديلي</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          const merged = Object.fromEntries(
            Object.entries(pending.conflict.current).map(([key, value]) => [
              key,
              choices[key] === "mine" ? pending.mine[key] : value,
            ]),
          );
          for (const [key, value] of Object.entries(merged)) {
            const element = pending.form.elements.namedItem(key);
            if (element instanceof HTMLInputElement) {
              if (element.type === "checkbox") element.checked = Boolean(value);
              else element.value = String(value ?? "");
            } else if (
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement
            )
              element.value = String(value ?? "");
          }
          pending.onMerge?.(merged);
          setRevision(pending.conflict.revision);
          setPending(null);
        }}
      >
        تطبيق الاختيارات على النموذج
      </button>
    </section>
  ) : null;
  return { revision, capture, notice, hasConflict: Boolean(pending) };
}
