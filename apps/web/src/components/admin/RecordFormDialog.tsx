import { useEditConflict } from "./useEditConflict";
import { useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../../api";
import { AdminDialog } from "./AdminDialog";
export interface RecordField {
  name: string;
  label: string;
  value?: string;
  type?: "text" | "textarea" | "date" | "number";
  required?: boolean;
  maxLength?: number;
  options?: Array<{ value: string; label: string }>;
}
export function RecordFormDialog({
  title,
  path,
  method = "POST",
  fields,
  extra = {},
  buildBody,
  onClose,
  onDone,
  editRevision,
}: {
  editRevision?: number;
  title: string;
  path: string;
  method?: string;
  fields: RecordField[];
  extra?: Record<string, unknown>;
  buildBody?: (values: Record<string, string | number>) => unknown;
  onClose: () => void;
  onDone: () => void;
}) {
  const conflict = useEditConflict(editRevision);
  const [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    const formElement = e.currentTarget;
    const f = new FormData(formElement);
    const values = Object.fromEntries(
      fields.map((field) => [
        field.name,
        field.type === "number"
          ? Number(f.get(field.name))
          : String(f.get(field.name) ?? ""),
      ]),
    );
    try {
      await apiRequest(path, {
        method,
        body: buildBody
          ? buildBody(values)
          : {
              ...values,
              ...extra,
              ...(editRevision ? { editRevision: conflict.revision } : {}),
            },
      });
      setDirty(false);
      onDone();
    } catch (e) {
      conflict.capture(e, values, formElement, () => setError(""));
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <AdminDialog
      title={title}
      dirty={dirty}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        className="edit-form"
        onSubmit={submit}
        onChange={() => setDirty(true)}
      >
        {conflict.notice}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <fieldset disabled={saving}>
          {fields.map((field) => (
            <label key={field.name}>
              {field.label}
              {field.options ? (
                <select
                  aria-label={field.label}
                  name={field.name}
                  defaultValue={field.value ?? ""}
                  required={field.required}
                >
                  <option value="">اختر…</option>
                  {field.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  aria-label={field.label}
                  name={field.name}
                  defaultValue={field.value ?? ""}
                  required={field.required}
                  maxLength={field.maxLength ?? 100000}
                  rows={6}
                />
              ) : (
                <input
                  aria-label={field.label}
                  name={field.name}
                  type={field.type ?? "text"}
                  defaultValue={field.value ?? ""}
                  required={field.required}
                  maxLength={field.maxLength ?? 1000}
                />
              )}
            </label>
          ))}
        </fieldset>
        <button className="button" disabled={saving || conflict.hasConflict}>
          {saving ? "جار الحفظ…" : "حفظ"}
        </button>
      </form>
    </AdminDialog>
  );
}
