import { useMemo, useState, type FormEvent } from "react";
import { apiRequest } from "../../api";
import { ErrorPanel, LoadingCards } from "../../components/StatePanel";
import { StatusBadge } from "../../components/StatusBadge";
import { useApi } from "../../hooks/use-api";
interface Synonym {
  setId: string;
  versionNo: number;
  status: string;
  id: string | null;
  termAr: string | null;
  synonymAr: string | null;
  publishedAt: string | null;
}
export function AdminSynonymsPage() {
  const data = useApi<Synonym[]>("/admin/synonyms");
  const [msg, setMsg] = useState("");
  const sets = useMemo(
    () =>
      Array.from(
        new Map((data.data ?? []).map((item) => [item.setId, item])).values(),
      ),
    [data.data],
  );
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formElement = e.currentTarget;
    const f = new FormData(formElement);
    try {
      await apiRequest("/admin/synonyms", {
        body: { term: f.get("term"), synonym: f.get("synonym") },
      });
      formElement.reset();
      setMsg("أضيف المرادف إلى نسخة قاموس مسودة.");
      data.retry();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "تعذر الإضافة.");
    }
  };
  const activate = async (id: string) => {
    try {
      await apiRequest(`/admin/synonym-sets/${id}/activate`, {
        body: { reason: "اعتماد ونشر قاموس المرادفات بعد المراجعة" },
      });
      setMsg("نُشرت نسخة القاموس وأصبحت متاحة للبحث مباشرة.");
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر النشر.");
    }
  };
  const remove = async (id: string) => {
    try {
      await apiRequest(`/admin/synonyms/${id}`, { method: "DELETE" });
      setMsg("حُذف المرادف من المسودة.");
      data.retry();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "تعذر الحذف.");
    }
  };
  return (
    <section>
      <header className="admin-title">
        <div>
          <span className="eyebrow dark">قابل للإصدار والمراجعة</span>
          <h1>قاموس البحث القانوني</h1>
        </div>
      </header>
      <form className="admin-card inline-form" onSubmit={submit}>
        <label>
          المصطلح
          <input name="term" required />
        </label>
        <label>
          المرادف
          <input name="synonym" required />
        </label>
        <button className="button">إضافة لمسودة</button>
      </form>
      {msg && (
        <p className="form-message" role="status">
          {msg}
        </p>
      )}
      <div className="dictionary-versions">
        {sets.map((set) => (
          <article className="admin-card" key={set.setId}>
            <h2>
              الإصدار {set.versionNo} <StatusBadge status={set.status} />
            </h2>
            {set.publishedAt && (
              <p>نشر في {new Date(set.publishedAt).toLocaleString("ar-YE")}</p>
            )}
            {set.status === "DRAFT" && (
              <button className="button" onClick={() => activate(set.setId)}>
                اعتماد هذا الإصدار ونشره
              </button>
            )}
          </article>
        ))}
      </div>
      {data.loading ? (
        <LoadingCards />
      ) : data.error ? (
        <ErrorPanel message={data.error.message} retry={data.retry} />
      ) : (
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>الإصدار</th>
                <th>الحالة</th>
                <th>المصطلح</th>
                <th>المرادف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.data?.map((item, index) => (
                <tr key={item.id ?? `${item.setId}-${index}`}>
                  <td>{item.versionNo}</td>
                  <td>
                    <StatusBadge status={item.status} />
                  </td>
                  <td>{item.termAr ?? "—"}</td>
                  <td>{item.synonymAr ?? "—"}</td>
                  <td>
                    {item.id && item.status === "DRAFT" && (
                      <button
                        className="link-button danger"
                        onClick={() => remove(item.id!)}
                      >
                        حذف
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
