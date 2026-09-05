import { useApi } from "../hooks/use-api";
import type { LegislationDetail } from "../types";
import { ErrorPanel, LoadingCards } from "./StatePanel";
import { LegislationHero, type LegislationSection } from "./LegislationHero";

type Section = Exclude<LegislationSection, "detail">;

export function LegislationSubpageHeader({
  id,
  section,
}: {
  id: string;
  section: Section;
}) {
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
  return <LegislationHero law={detail.data} section={section} />;
}
