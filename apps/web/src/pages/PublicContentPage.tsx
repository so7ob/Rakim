import { Link, useParams } from "react-router-dom";
import { ErrorPanel, LoadingCards } from "../components/StatePanel";
import { useApi } from "../hooks/use-api";
import { ConstitutionDocumentPage } from "./ConstitutionDocumentPage";

export interface PublicContent {
  eyebrow: string;
  title: string;
  intro: string;
  sections: Array<{ title: string; body: string }>;
}

export function PublicContentPage({ content }: { content: PublicContent }) {
  return (
    <>
      <section className="public-page-hero compact-public-hero">
        <div className="container">
          <nav className="detail-breadcrumb" aria-label="مسار التنقل">
            <Link to="/ar">الصفحة الرئيسية</Link>
            <span aria-hidden="true">/</span>
            <span>{content.title}</span>
          </nav>
          <span className="eyebrow">{content.eyebrow}</span>
          <h1>{content.title}</h1>
          <p>{content.intro}</p>
        </div>
      </section>
      <div className="container listing-overlap">
        <article className="listing-panel prose-panel">
          {content.sections.map((section) => (
            <section key={section.title}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </article>
      </div>
    </>
  );
}

interface ManagedPage {
  eyebrowAr: string;
  titleAr: string;
  introAr: string;
  sections: Array<{ title: string; body: string }>;
  updatedAt?: string;
}

export function ManagedPublicContentPage({ slug }: { slug: string }) {
  const page = useApi<ManagedPage>(
    `/site/pages?slug=${encodeURIComponent(slug)}`,
  );
  if (page.loading)
    return (
      <div className="container page-shell">
        <LoadingCards count={1} />
      </div>
    );
  if (page.error || !page.data)
    return (
      <div className="container page-shell">
        <ErrorPanel
          message={page.error?.message ?? "تعذر تحميل الصفحة."}
          retry={page.retry}
        />
      </div>
    );
  if (slug === "constitution") {
    return (
      <ConstitutionDocumentPage
        content={{
          eyebrow: page.data.eyebrowAr,
          title: page.data.titleAr,
          intro: page.data.introAr,
          sections: page.data.sections,
          updatedAt: page.data.updatedAt,
        }}
      />
    );
  }
  return (
    <PublicContentPage
      content={{
        eyebrow: page.data.eyebrowAr,
        title: page.data.titleAr,
        intro: page.data.introAr,
        sections: page.data.sections,
      }}
    />
  );
}

export const publicPages = {
  constitution: {
    eyebrow: "المرجعية الدستورية",
    title: "دستور الجمهورية اليمنية",
    intro: "صفحة مخصصة لعرض النص الدستوري المنظم وتاريخه وتعديلاته.",
    sections: [
      {
        title: "النص الدستوري",
        body: "يضاف النص الرسمي بعد الاستيراد والمراجعة القانونية وربطه بمصدره المنشور.",
      },
      {
        title: "الحفظ التاريخي",
        body: "ستظل كل نسخة منشورة محفوظة بفترة نفاذها ومصدرها دون استبدال صامت.",
      },
    ],
  },
  constitutionModifications: {
    eyebrow: "السجل الدستوري",
    title: "تعديلات الدستور",
    intro: "تسلسل زمني مستقل لأدوات تعديل النص الدستوري ومصادرها.",
    sections: [
      {
        title: "التعديلات",
        body: "تظهر هنا التعديلات المعتمدة بعد إدخالها ومراجعتها وربطها بالمواد المستهدفة.",
      },
    ],
  },
  legislativeSystem: {
    eyebrow: "دليل معرفي",
    title: "المنظومة التشريعية",
    intro:
      "تعريف بالتدرج التشريعي ودورة إعداد التشريع والعلاقات بين الأدوات القانونية.",
    sections: [
      {
        title: "التدرج التشريعي",
        body: "يعرض هذا القسم طبقات التشريع من المرجعية الدستورية إلى القوانين واللوائح والقرارات التنفيذية.",
      },
      {
        title: "دورة المحتوى",
        body: "تمر الوثيقة في المنصة بالاستيراد والمسودة والمراجعة والاعتماد للنشر ثم النشر أو الأرشفة.",
      },
    ],
  },
  about: {
    eyebrow: "تعريف المنصة",
    title: "عن المنصة",
    intro:
      "منصة محلية لإدارة وعرض التشريعات اليمنية مع حماية النصوص التاريخية ومصادرها.",
    sections: [
      {
        title: "تنبيه",
        body: "البيانات الحالية اصطناعية لأغراض التطوير ولا تعد نصوصًا رسمية أو رأيًا قانونيًا.",
      },
    ],
  },
  contact: {
    eyebrow: "قنوات التواصل",
    title: "تواصل معنا",
    intro:
      "مساحة لاستقبال الملاحظات والبلاغات المتعلقة بجودة البيانات والمصادر.",
    sections: [
      {
        title: "البلاغات",
        body: "يمكن للمستخدم المسجل إرسال بلاغ من أدوات التشريع، ويصل البلاغ إلى دورة المراجعة المسجلة.",
      },
    ],
  },
  terms: {
    eyebrow: "الشروط القانونية",
    title: "الشروط والأحكام",
    intro: "ضوابط استخدام النسخة المحلية وبياناتها التجريبية.",
    sections: [
      {
        title: "استخدام المحتوى",
        body: "يجب الرجوع إلى المصدر الرسمي قبل الاعتماد على أي نص، وتظهر درجة التحقق والمصدر مع السجل حيثما توفرا.",
      },
    ],
  },
  privacy: {
    eyebrow: "حماية البيانات",
    title: "سياسة الخصوصية",
    intro: "بيان موجز لمعالجة بيانات الحسابات الإدارية وسجلات التدقيق.",
    sections: [
      {
        title: "البيانات المسجلة",
        body: "تحتفظ المنصة ببيانات الجلسة والإجراءات اللازمة للأمن والتدقيق وفق أقل صلاحية ممكنة.",
      },
    ],
  },
  policy: {
    eyebrow: "محتوى معرفي",
    title: "السياسات العامة",
    intro:
      "مساحة مستقلة للسياسات والأدلة المرتبطة بها، مع فصلها عن السجل التشريعي الملزم.",
    sections: [
      {
        title: "حالة المحتوى",
        body: "هذه الوحدة مهيأة للمحتوى المحلي، وستظهر السجلات بعد إدخالها واعتمادها من الجهة المخولة.",
      },
    ],
  },
  policyGuides: {
    eyebrow: "أدلة السياسات",
    title: "أدلة إعداد السياسات العامة",
    intro: "أدلة ونماذج قابلة للإدارة تساعد على توثيق دورة إعداد السياسات.",
    sections: [
      {
        title: "الأدلة",
        body: "لم تنشر أدلة محلية في البيانات التجريبية بعد.",
      },
    ],
  },
  news: {
    eyebrow: "المركز الإعلامي",
    title: "الأخبار",
    intro: "إعلانات تحديث البيانات ومواد التوعية المرتبطة بالمنصة.",
    sections: [
      {
        title: "لا توجد أخبار منشورة",
        body: "ستظهر الأخبار هنا بعد إعداد وحدة المحتوى الإعلامي واعتماد السجلات.",
      },
    ],
  },
} satisfies Record<string, PublicContent>;

export function DynamicPublicContentPage() {
  const { slug = "" } = useParams();
  return <ManagedPublicContentPage slug={`pages/${slug}`} />;
}
