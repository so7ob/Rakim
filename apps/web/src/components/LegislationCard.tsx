import { Link } from "react-router-dom";
import type { LegislationSummary } from "../types";

const legalStatus: Record<string, string> = {
  IN_FORCE: "نافذ",
  AMENDED: "معدّل",
  REPEALED: "ملغى",
  PARTIALLY_REPEALED: "ملغى جزئيًا",
  SUSPENDED: "موقوف",
  UNKNOWN: "غير محدد",
};
export function LegislationCard({ item }: { item: LegislationSummary }) {
  return (
    <article className="card legislation-card">
      <div className="card-top">
        <span className="tag">{item.typeName}</span>
        <span className={`status status-${item.legalStatus.toLowerCase()}`}>
          {legalStatus[item.legalStatus] ?? item.legalStatus}
        </span>
      </div>
      <h2>
        <Link to={`/ar/legislations/${item.id}`}>{item.titleAr}</Link>
      </h2>
      <p>{item.summaryAr}</p>
      <dl className="inline-meta">
        <div>
          <dt>الرقم والسنة</dt>
          <dd>
            {item.officialNumber} / {item.year}
          </dd>
        </div>
        <div>
          <dt>الجهة</dt>
          <dd>{item.authorityName}</dd>
        </div>
        <div>
          <dt>النفاذ</dt>
          <dd>{item.effectiveFrom}</dd>
        </div>
      </dl>
      <div className="card-footer">
        <span>{item.articleCount} مادة</span>
        <Link className="text-link" to={`/ar/legislations/${item.id}`}>
          عرض التشريع <span aria-hidden="true">←</span>
        </Link>
      </div>
    </article>
  );
}
