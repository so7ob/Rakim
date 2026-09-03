import { Link } from 'react-router-dom';
import { useApi } from '../hooks/use-api';
import type { ListResponse } from '../types';
import { SearchBox } from '../components/SearchBox';
import { ErrorPanel, LoadingCards } from '../components/StatePanel';
import { LegislationCard } from '../components/LegislationCard';

export function HomePage() {
  const {data,error,loading,retry}=useApi<ListResponse>('/legislations?pageSize=3&sort=newest');
  return <>
    <section className="home-hero"><div className="container hero-content"><span className="eyebrow">وصول منظم إلى النص ومصدره وتاريخه</span><h1>التشريعات اليمنية،<br/>في سياقها الزمني</h1><p>ابحث في عينة تطويرية عربية، وانتقل مباشرة إلى المادة والنسخة النافذة.</p><SearchBox large/><p className="demo-notice">تنبيه: المحتوى الحالي اصطناعي وغير رسمي.</p></div></section>
    <section className="section container" aria-labelledby="latest-title"><div className="section-heading"><div><span className="eyebrow dark">المضاف حديثًا</span><h2 id="latest-title">آخر التشريعات</h2></div><Link className="button secondary" to="/ar/legislations">عرض الكل</Link></div>
      {loading?<LoadingCards/>:error?<ErrorPanel message={error.message} retry={retry}/>:<div className="cards">{data?.items.map((item)=><LegislationCard key={item.id} item={item}/>)}</div>}
    </section>
    <section className="stats-section"><div className="container stats"><div><strong>{data?.meta.total ?? '—'}</strong><span>تشريعًا منشورًا</span></div><div><strong>{data?.filters.types.length ?? '—'}</strong><span>أنواع تشريعية</span></div><div><strong>{data?.filters.authorities.length ?? '—'}</strong><span>جهات مصدرة</span></div></div></section>
  </>;
}

