import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { LegislationHero } from "../components/LegislationHero";
import { LegislationDocumentMark } from "../components/LegislationDocumentMark";
import { PreviousTextsDialog } from "../components/PreviousTextsDialog";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { UiIcon } from "../components/UiIcon";
import { useApi } from "../hooks/use-api";
import type { ArticleList, LegislationDetail, StructureNode } from "../types";

export function LegislationDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const at = params.get("at") ?? "";
  const routerLocation = useLocation();
  const detail = useApi<LegislationDetail>(id ? `/legislations/${id}` : null);
  const structure = useApi<StructureNode[]>(
    id ? `/legislations/${id}/structure` : null,
  );
  const articles = useApi<ArticleList>(
    id ? `/legislations/${id}/articles${at ? `?at=${at}` : ""}` : null,
  );
  const [indexQuery, setIndexQuery] = useState("");
  const [previous, setPrevious] = useState<{
    id: string;
    label: string;
    button: HTMLButtonElement;
  } | null>(null);
  const lastButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!previous && lastButton.current) {
      lastButton.current.focus();
      lastButton.current = null;
    }
  }, [previous]);

  useEffect(() => {
    if (articles.data && routerLocation.hash) {
      requestAnimationFrame(() =>
        document.getElementById(routerLocation.hash.slice(1))?.focus(),
      );
    }
  }, [articles.data, routerLocation.hash]);

  const visibleIndex = useMemo(() => {
    const needle = indexQuery.trim();
    const allArticles = articles.data?.items ?? [];
    return (structure.data ?? [])
      .map((node) => ({
        node,
        articles: allArticles.filter(
          (article) =>
            article.structureNodeId === node.id &&
            (!needle ||
              `المادة ${article.currentLabel} ${article.textOriginal}`.includes(
                needle,
              )),
        ),
      }))
      .filter(
        ({ node, articles: nodeArticles }) =>
          nodeArticles.length > 0 ||
          `${node.labelAr} ${node.titleAr}`.includes(needle),
      );
  }, [articles.data, indexQuery, structure.data]);

  if (detail.loading)
    return (
      <div className="container page-shell">
        <LoadingCards />
      </div>
    );
  if (detail.error || !detail.data)
    return (
      <div className="container page-shell">
        <ErrorPanel
          message={detail.error?.message ?? "لم يوجد التشريع."}
          retry={detail.retry}
        />
      </div>
    );

  const law = detail.data;
  const articleItems = articles.data?.items ?? [];

  return (
    <>
      <LegislationHero law={law} />
      <div className="container law-detail-overlap">
        <div className="law-main-desc">
          <aside className="law-main-index" aria-labelledby="toc-title">
            <div className="law-index-inner">
              <div className="filter-inner-search-wrapper">
                <button
                  type="button"
                  aria-label="مسح البحث في الفهرس"
                  onClick={() => setIndexQuery("")}
                >
                  <UiIcon name="refresh" />
                </button>
                <label>
                  <span className="sr-only">بحث في تفاصيل المواد</span>
                  <UiIcon name="search" />
                  <input
                    type="search"
                    value={indexQuery}
                    onChange={(event) => setIndexQuery(event.target.value)}
                    placeholder="بحث في تفاصيل المواد"
                  />
                </label>
              </div>
              <h2 id="toc-title" className="index-title">
                الفهرس
              </h2>
              {structure.loading || articles.loading ? (
                <p className="index-loading">جار التحميل…</p>
              ) : (
                <nav className="index-table" aria-label="فهرس المواد">
                  {visibleIndex.map(({ node, articles: nodeArticles }) => (
                    <div className="law-index-group" key={node.id}>
                      <strong>
                        {node.labelAr}: {node.titleAr}
                      </strong>
                      {nodeArticles.map((article) => (
                        <a
                          key={article.id}
                          href={`#article-${article.id}`}
                          onClick={(event) => {
                            event.currentTarget
                              .closest("nav")
                              ?.querySelectorAll("a")
                              .forEach((link) =>
                                link.removeAttribute("aria-current"),
                              );
                            event.currentTarget.setAttribute(
                              "aria-current",
                              "location",
                            );
                          }}
                        >
                          المادة ({article.currentLabel})
                        </a>
                      ))}
                    </div>
                  ))}
                </nav>
              )}
            </div>
          </aside>

          <main className="law-main-content" aria-label="نص التشريع">
            <div className="date-selector law-date-selector">
              <label htmlFor="at-date">اعرض النص النافذ في تاريخ</label>
              <input
                id="at-date"
                type="date"
                value={at}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  if (event.target.value) next.set("at", event.target.value);
                  else next.delete("at");
                  setParams(next);
                }}
              />
              <button className="link-button" onClick={() => setParams({})}>
                النص الحالي
              </button>
              <span className="sr-only" aria-live="polite">
                المعروض في: {articles.data?.at ?? "…"}
              </span>
            </div>

            <header className="law-document-header">
              <span className="law-document-mark">
                <LegislationDocumentMark />
              </span>
              <h2>
                {law.titleAr} رقم ({law.officialNumber}) لسنة {law.year}
              </h2>
              <p>{law.authorityName}</p>
            </header>

            {law.preambleText && (
              <article className="article-card preamble-card">
                <header>
                  <h2>الديباجة</h2>
                </header>
                <p className="legal-text">{law.preambleText}</p>
              </article>
            )}

            {articles.loading ? (
              <LoadingCards />
            ) : articles.error ? (
              <ErrorPanel
                message={articles.error.message}
                retry={articles.retry}
              />
            ) : (
              articleItems.map((article, index) => {
                const node = structure.data?.find(
                  (item) => item.id === article.structureNodeId,
                );
                const previousArticle = articleItems[index - 1];
                const startsNode =
                  node && previousArticle?.structureNodeId !== node.id;
                return (
                  <Fragment key={article.id}>
                    {startsNode && (
                      <header className="law-structure-heading">
                        <span>{node.labelAr}</span>
                        <h2>{node.titleAr}</h2>
                      </header>
                    )}
                    <article
                      className="article-card law-article"
                      id={`article-${article.id}`}
                      tabIndex={-1}
                    >
                      <header>
                        <div className="law-article-number">
                          <span>المادة</span>
                          <b aria-hidden="true">(</b>
                          <h2>{article.currentLabel}</h2>
                          <b aria-hidden="true">)</b>
                        </div>
                        <div className="article-badges">
                          {article.futureCount > 0 && (
                            <span className="future-badge">
                              تعديل مستقبلي محفوظ
                            </span>
                          )}
                          {article.previousCount > 0 && (
                            <button
                              ref={(nodeElement) => {
                                if (previous?.id === article.id && nodeElement)
                                  lastButton.current = nodeElement;
                              }}
                              className="previous-button"
                              onClick={(event) =>
                                setPrevious({
                                  id: article.id,
                                  label: article.currentLabel,
                                  button: event.currentTarget,
                                })
                              }
                            >
                              {article.previousCount} نصوص سابقة
                            </button>
                          )}
                        </div>
                      </header>
                      <p className="legal-text">{article.textOriginal}</p>
                      <footer>
                        <span>
                          نافذ من {article.validFrom}
                          {article.validTo
                            ? ` إلى ${article.validTo}`
                            : " حتى الآن"}
                        </span>
                        <a
                          href={`#article-${article.id}`}
                          aria-label={`رابط ثابت للمادة ${article.currentLabel}`}
                        >
                          <UiIcon name="link" />
                          <span>رابط المادة</span>
                        </a>
                      </footer>
                    </article>
                  </Fragment>
                );
              })
            )}
          </main>
        </div>
      </div>

      {previous && (
        <PreviousTextsDialog
          articleId={previous.id}
          label={previous.label}
          onClose={() => {
            lastButton.current = previous.button;
            setPrevious(null);
          }}
        />
      )}
    </>
  );
}
