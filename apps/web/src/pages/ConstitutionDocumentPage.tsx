import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { DocumentActions } from "../components/DocumentActions";
import type { PublicContent } from "./PublicContentPage";

export interface ConstitutionContent extends PublicContent {
  updatedAt?: string;
}

export function ConstitutionDocumentPage({
  content,
}: {
  content: ConstitutionContent;
}) {
  const [query, setQuery] = useState("");
  const visibleSections = useMemo(() => {
    const needle = query.trim();
    if (!needle)
      return content.sections.map((section, index) => ({ section, index }));
    return content.sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) =>
        `${section.title} ${section.body}`.includes(needle),
      );
  }, [content.sections, query]);
  const updated = content.updatedAt
    ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "long" }).format(
        new Date(content.updatedAt),
      )
    : "غير محدد";

  return (
    <>
      <section className="document-hero">
        <div className="document-hero-pattern" aria-hidden="true" />
        <div className="container document-hero-inner">
          <Breadcrumbs
            items={[
              { label: "الصفحة الرئيسية", to: "/ar" },
              { label: "الدستور" },
              { label: content.title },
            ]}
          />
          <div className="document-title-row">
            <div>
              <span>{content.eyebrow}</span>
              <h1>{content.title}</h1>
              <p>{content.intro}</p>
            </div>
            <DocumentActions title={content.title} />
          </div>
          <dl className="document-meta">
            <div>
              <dt>حالة المحتوى</dt>
              <dd>منشور</dd>
            </div>
            <div>
              <dt>آخر تحديث للبيانات</dt>
              <dd>{updated}</dd>
            </div>
            <div>
              <dt>عدد الأقسام</dt>
              <dd>{content.sections.length}</dd>
            </div>
            <div>
              <dt>مصدر العرض</dt>
              <dd>قاعدة بيانات المنصة</dd>
            </div>
          </dl>
        </div>
      </section>
      <nav className="container constitution-tabs" aria-label="أقسام الدستور">
        <Link className="active" aria-current="page" to="/ar/constitution">
          نص الدستور
        </Link>
        <Link to="/ar/constitution/modifications">تعديلات الدستور</Link>
      </nav>
      <div className="container constitution-shell">
        <article className="constitution-document" aria-label="نص الدستور">
          <header className="constitution-document-heading">
            <span className="local-document-emblem" aria-hidden="true">
              §
            </span>
            <h2>{content.title}</h2>
            <p>{content.intro}</p>
          </header>
          {visibleSections.length ? (
            visibleSections.map(({ section, index }) => (
              <section
                className="constitution-article"
                id={`constitution-section-${index + 1}`}
                tabIndex={-1}
                key={`${section.title}-${index}`}
              >
                <header>
                  <span>القسم</span>
                  <h3>{section.title}</h3>
                  <a
                    href={`#constitution-section-${index + 1}`}
                    aria-label={`رابط ثابت إلى ${section.title}`}
                  >
                    #
                  </a>
                </header>
                <p>{section.body}</p>
              </section>
            ))
          ) : (
            <div className="constitution-no-results">
              لا يطابق البحث أي قسم.
            </div>
          )}
        </article>
        <aside
          className="constitution-index"
          aria-labelledby="constitution-index-title"
        >
          <div className="constitution-index-sticky">
            <label htmlFor="constitution-filter">بحث في تفاصيل المواد</label>
            <div className="constitution-filter">
              <span aria-hidden="true">⌕</span>
              <input
                id="constitution-filter"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <h2 id="constitution-index-title">الفهرس</h2>
            <nav aria-label="فهرس الدستور">
              {content.sections.map((section, index) => (
                <a
                  key={`${section.title}-${index}`}
                  href={`#constitution-section-${index + 1}`}
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </>
  );
}
