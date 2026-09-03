import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/use-api';
import type { ArticleList, LegislationDetail, StructureNode } from '../types';
import { ErrorPanel, LoadingCards } from '../components/StatePanel';
import { PreviousTextsDialog } from '../components/PreviousTextsDialog';

export function LegislationDetailPage() {
  const {id}=useParams(); const [params,setParams]=useSearchParams(); const at=params.get('at')??'';
  const routerLocation=useLocation();
  const detail=useApi<LegislationDetail>(id?`/legislations/${id}`:null); const structure=useApi<StructureNode[]>(id?`/legislations/${id}/structure`:null); const articles=useApi<ArticleList>(id?`/legislations/${id}/articles${at?`?at=${at}`:''}`:null);
  const [previous,setPrevious]=useState<{id:string;label:string;button:HTMLButtonElement}|null>(null); const lastButton=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{if(!previous&&lastButton.current){lastButton.current.focus();lastButton.current=null;}},[previous]);
  useEffect(()=>{if(articles.data&&routerLocation.hash){requestAnimationFrame(()=>document.getElementById(routerLocation.hash.slice(1))?.focus());}},[articles.data,routerLocation.hash]);
  if(detail.loading) return <div className="container page-shell"><LoadingCards/></div>;
  if(detail.error||!detail.data) return <div className="container page-shell"><ErrorPanel message={detail.error?.message??'لم يوجد التشريع.'} retry={detail.retry}/></div>;
  const law=detail.data;
  return <>
    <section className="detail-hero"><div className="container"><Link className="back-link" to="/ar/legislations">← عودة إلى التشريعات</Link><div className="hero-badges"><span>{law.typeName}</span><span>تحقق {law.verificationLevel}</span></div><h1>{law.titleAr}</h1><p>التشريع وفقًا لآخر مراجعة في {law.lastReviewedAt}</p><div className="hero-meta"><div><span>الإصدار</span><strong>{law.issueDate}</strong></div><div><span>النفاذ</span><strong>{law.effectiveFrom}</strong></div><div><span>الجريدة</span><strong>{law.gazetteIssue??'غير محدد'}</strong></div><div><span>المواد</span><strong>{law.articleCount}</strong></div><div><span>التعديلات</span><strong>{law.amendmentCount}</strong></div></div></div></section>
    <div className="container detail-tools" aria-label="أدوات التشريع"><button onClick={()=>navigator.clipboard?.writeText(location.href)}>نسخ الرابط</button><button onClick={()=>window.print()}>طباعة</button><button disabled title="يتاح مع ملف المصدر">تنزيل المصدر</button><Link to={`/ar/legislations/${id}/modifications`}>التعديلات ({law.amendmentCount})</Link><Link to={`/ar/legislations/${id}/regulations`}>اللوائح والجداول ({law.annexCount})</Link><Link to={`/ar/legislations/${id}/related-legislations`}>ذات الصلة ({law.relationCount})</Link></div>
    <div className="container date-selector"><label htmlFor="at-date">اعرض النص النافذ في تاريخ</label><input id="at-date" type="date" value={at} onChange={(e)=>{const next=new URLSearchParams(params);if(e.target.value)next.set('at',e.target.value);else next.delete('at');setParams(next);}}/><button className="link-button" onClick={()=>setParams({})}>النص الحالي</button><span aria-live="polite">المعروض في: {articles.data?.at??'…'}</span></div>
    <div className="container legislation-layout">
      <aside className="toc" aria-labelledby="toc-title"><h2 id="toc-title">محتويات التشريع</h2>{structure.loading?<p>جار التحميل…</p>:<nav>{structure.data?.map((node)=><div key={node.id}><strong>{node.labelAr}</strong><span>{node.titleAr}</span>{articles.data?.items.filter((a)=>a.structureNodeId===node.id).map((a)=><a key={a.id} href={`#article-${a.id}`}>المادة {a.currentLabel}</a>)}</div>)}</nav>}</aside>
      <section className="articles" aria-label="نص التشريع">{articles.loading?<LoadingCards/>:articles.error?<ErrorPanel message={articles.error.message} retry={articles.retry}/>:articles.data?.items.map((article)=><article className="article-card" id={`article-${article.id}`} key={article.id} tabIndex={-1}><header><div><span>المادة</span><h2>{article.currentLabel}</h2></div><div className="article-badges">{article.futureCount>0&&<span className="future-badge">تعديل مستقبلي محفوظ</span>}{article.previousCount>0&&<button ref={(node)=>{if(previous?.id===article.id&&node)lastButton.current=node;}} className="previous-button" onClick={(e)=>setPrevious({id:article.id,label:article.currentLabel,button:e.currentTarget})}>{article.previousCount} نصوص سابقة</button>}</div></header><p className="legal-text">{article.textOriginal}</p><footer><span>نافذ من {article.validFrom}{article.validTo?` إلى ${article.validTo}`:' حتى الآن'}</span><a href={`#article-${article.id}`} aria-label={`رابط ثابت للمادة ${article.currentLabel}`}># رابط المادة</a></footer></article>)}</section>
    </div>
    {previous&&<PreviousTextsDialog articleId={previous.id} label={previous.label} onClose={()=>{lastButton.current=previous.button;setPrevious(null);}}/>}
  </>;
}
