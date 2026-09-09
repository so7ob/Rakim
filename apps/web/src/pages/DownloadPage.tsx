import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet } from "../api";

export function DownloadPage({ annex = false }: { annex?: boolean }) {
  const { id, attachmentId } = useParams();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!id || (annex && !attachmentId)) {
      setError("الرابط غير مكتمل.");
      return;
    }
    const start = async () => {
      if (annex) {
        const detail = await apiGet<{
          versions: Array<{ legislationId: string }>;
        }>(`/annexes/${attachmentId}`);
        if (detail.versions[0]?.legislationId !== id)
          throw new Error("الملحق لا يتبع التشريع المحدد.");
        window.location.assign(
          `/api/v1/annexes/${attachmentId}/file?download=1`,
        );
      } else {
        window.location.assign(`/api/v1/legislations/${id}/source`);
      }
    };
    start().catch((reason) =>
      setError(reason instanceof Error ? reason.message : "تعذر بدء التنزيل."),
    );
  }, [annex, attachmentId, id]);
  return (
    <div className="container page-shell download-state">
      <span className="eyebrow dark">تنزيل آمن</span>
      <h1>{error ? "تعذر تنزيل الملف" : "جار تجهيز الملف…"}</h1>
      <p>{error || "سيبدأ التنزيل دون كشف مسار التخزين المحلي."}</p>
      <Link className="button secondary" to={`/ar/legislations/${id}`}>
        العودة إلى التشريع
      </Link>
    </div>
  );
}
