export function LoadingCards() { return <div className="cards" aria-busy="true" aria-label="جار التحميل">{[1,2,3].map((item) => <div className="skeleton card" key={item}><span/><span/><span/></div>)}</div>; }
export function ErrorPanel({ message, retry }: {message:string; retry:()=>void}) { return <section className="state-panel error" role="alert"><h2>تعذر عرض البيانات</h2><p>{message}</p><button className="button" onClick={retry}>إعادة المحاولة</button></section>; }
export function EmptyPanel({ title='لا توجد نتائج', body='جرّب إزالة أحد المرشحات أو استخدام عبارة أخرى.' }: {title?:string;body?:string}) { return <section className="state-panel"><h2>{title}</h2><p>{body}</p></section>; }

