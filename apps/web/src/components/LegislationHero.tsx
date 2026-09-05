import { Link } from "react-router-dom";
import { formatLegalDate, legalStatusLabels } from "../legal-format";
import { useSiteConfig } from "../site/SiteConfigContext";
import type { LegislationDetail } from "../types";
import { LegislationActions } from "./LegislationActions";
import { UiIcon } from "./UiIcon";

export type LegislationSection =
  "detail" | "modifications" | "regulations" | "related-legislations";

const sectionLabels: Record<Exclude<LegislationSection, "detail">, string> = {
  modifications: "تعديلات التشريع",
  regulations: "اللوائح والجداول",
  "related-legislations": "التشريعات ذات الصلة",
};

export function LegislationHero({
  law,
  section = "detail",
}: {
  law: LegislationDetail;
  section?: LegislationSection;
}) {
  const { settings } = useSiteConfig();
  const archived = law.legalStatus === "REPEALED";
  const regulationsLabel = String(settings["tabs.regulations_label"]);
  const modificationsLabel = String(settings["tabs.modifications_label"]);
  const relatedLabel = String(settings["tabs.related_label"]);
  const annexCount = Number(law.annexCount);
  const amendmentCount = Number(law.amendmentCount);

  return (
    <section
      className={`detail-hero legislation-hero ${section === "detail" ? "" : "subpage-hero"}`}
    >
      <div className="container detail-hero-inner">
        <nav className="detail-breadcrumb" aria-label="مسار التنقل">
          <Link to="/ar">الصفحة الرئيسية</Link>
          <span aria-hidden="true">/</span>
          <Link to={archived ? "/ar/archived-legislation" : "/ar/legislations"}>
            {archived ? "الأرشيف" : "التشريعات"}
          </Link>
          {section !== "detail" && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                to={`/ar/legislations/${law.id}`}
                aria-label="العودة إلى التشريع"
              >
                {law.titleAr}
              </Link>
              <span aria-hidden="true">/</span>
              <span>{sectionLabels[section]}</span>
            </>
          )}
          {section === "detail" && (
            <>
              <span aria-hidden="true">/</span>
              <span>{law.titleAr}</span>
            </>
          )}
        </nav>

        <div className="hero-title-layout">
          <div className="hero-title-copy">
            <h1>{law.titleAr}</h1>
            <div className="hero-pills">
              <span className="update-pill">
                التشريع وفقًا لآخر تحديث في{" "}
                {formatLegalDate(law.lastReviewedAt)}
              </span>
              <Link
                className="related-pill"
                to={`/ar/legislations/${law.id}/related-legislations`}
                aria-label={`${relatedLabel} (${law.relationCount})`}
              >
                التشريعات ذات الصلة <UiIcon name="back" />
              </Link>
            </div>
          </div>
          <LegislationActions id={law.id} embedded />
        </div>

        <div
          className={`hero-meta legislation-hero-meta hero-meta-${5 + (annexCount > 0 ? 1 : 0) + (amendmentCount > 0 ? 1 : 0)}`}
        >
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
          {annexCount > 0 && (
            <div className={section === "regulations" ? "active-counter" : ""}>
              <Link
                to={`/ar/legislations/${law.id}/regulations`}
                aria-label={`${regulationsLabel} (${annexCount})`}
              >
                <span>{regulationsLabel}</span>
                <strong>{annexCount}</strong>
              </Link>
            </div>
          )}
          {amendmentCount > 0 && (
            <div
              className={section === "modifications" ? "active-counter" : ""}
            >
              <Link
                to={`/ar/legislations/${law.id}/modifications`}
                aria-label={`${modificationsLabel} (${amendmentCount})`}
              >
                <span>{modificationsLabel}</span>
                <strong>{amendmentCount}</strong>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
