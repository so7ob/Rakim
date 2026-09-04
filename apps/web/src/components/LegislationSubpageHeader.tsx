import { Link } from "react-router-dom";
import { useApi } from "../hooks/use-api";
import { formatLegalDate, legalStatusLabels } from "../legal-format";
import type { LegislationDetail } from "../types";
import { LegislationActions } from "./LegislationActions";
import { ErrorPanel, LoadingCards } from "./StatePanel";
import { useSiteConfig } from "../site/SiteConfigContext";

type Section = "modifications" | "regulations" | "related-legislations";

const sectionLabels: Record<Section, string> = {
  modifications: "تعديلات التشريع",
  regulations: "اللوائح والجداول",
  "related-legislations": "التشريعات ذات الصلة",
};

export function LegislationSubpageHeader({
  id,
  section,
}: {
  id: string;
  section: Section;
}) {
  const { settings } = useSiteConfig();
  const detail = useApi<LegislationDetail>(`/legislations/${id}`);
  if (detail.loading)
    return (
      <section className="detail-hero subpage-hero loading-masthead">
        <div className="container">
          <LoadingCards count={1} />
        </div>
      </section>
    );
  if (detail.error || !detail.data)
    return (
      <div className="container page-shell">
        <ErrorPanel
          message={detail.error?.message ?? "تعذر تحميل بيانات التشريع."}
          retry={detail.retry}
        />
      </div>
    );
  const law = detail.data;
  return (
    <section className="detail-hero subpage-hero">
      <div className="container detail-hero-inner">
        <nav className="detail-breadcrumb" aria-label="مسار التنقل">
          <Link to="/ar">الصفحة الرئيسية</Link>
          <span aria-hidden="true">/</span>
          <Link to="/ar/legislations">التشريعات</Link>
          <span aria-hidden="true">/</span>
          <Link to={`/ar/legislations/${id}`} aria-label="العودة إلى التشريع">
            {law.titleAr}
          </Link>
          <span aria-hidden="true">/</span>
          <span>{sectionLabels[section]}</span>
        </nav>
        <div className="hero-title-layout">
          <div className="hero-title-copy">
            <span className="legislation-type-label">{law.typeName}</span>
            <h1>{law.titleAr}</h1>
            <div className="hero-pills">
              <span className="update-pill">
                التشريع وفقًا لآخر تحديث في{" "}
                {formatLegalDate(law.lastReviewedAt)}
              </span>
              <Link
                className="related-pill"
                to={`/ar/legislations/${id}/related-legislations`}
              >
                التشريعات ذات الصلة <span aria-hidden="true">←</span>
              </Link>
            </div>
          </div>
          <LegislationActions id={law.id} embedded />
        </div>
        <div className="hero-meta subpage-meta">
          <div>
            <span>تاريخ إصدار التشريع</span>
            <strong>{formatLegalDate(law.issueDate)}</strong>
          </div>
          <div>
            <span>تاريخ نفاذ التشريع</span>
            <strong>{formatLegalDate(law.effectiveFrom)}</strong>
          </div>
          <div>
            <span>تاريخ الجريدة الرسمية</span>
            <strong>{formatLegalDate(law.publicationDate)}</strong>
          </div>
          <div>
            <span>عدد الجريدة الرسمية</span>
            <strong>{law.gazetteIssue ?? "غير محدد"}</strong>
          </div>
          <div>
            <span>حالة التشريع</span>
            <strong>
              {legalStatusLabels[law.legalStatus] ?? law.legalStatus}
            </strong>
          </div>
          <div className={section === "regulations" ? "active-counter" : ""}>
            <Link to={`/ar/legislations/${id}/regulations`}>
              <span>{String(settings["tabs.regulations_label"])}</span>
              <strong>{law.annexCount}</strong>
            </Link>
          </div>
          <div className={section === "modifications" ? "active-counter" : ""}>
            <Link to={`/ar/legislations/${id}/modifications`}>
              <span>{String(settings["tabs.modifications_label"])}</span>
              <strong>{law.amendmentCount}</strong>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
