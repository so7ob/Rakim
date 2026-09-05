# خريطة المكونات

| عنصر المرجع | selector المرجعي | تنفيذ React | مصدر البيانات |
|---|---|---|---|
| الترويسة/التنقل | `header .nav_wrapper` | `SiteHeader` | `/site/config` و`AuthContext` |
| الهوية | `.nav_logo` | `YemenIdentity` | إعدادات MariaDB، بلا أصل إماراتي |
| بحث وتصفح الجوال | `.nav_search`, `.sidemenu_container` | بحث ودرج داخل `SiteHeader` | مسار البحث والتنقل الديناميكي |
| مسار التنقل | `.breadcrumb_wrapper` | `Breadcrumbs` وداخل `LegislationHero` | props وبيانات التشريع |
| رأس القانون | `.inner_banner`, `.widget_grid_v2` | `LegislationHero` | `GET /legislations/:id` |
| إجراءات القانون | `.icon_link_list` | `LegislationActions`, `UiIcon` | مشاركة/نسخ/طباعة/تنزيل/مفضلة |
| قائمة التشريعات | `.laws_table_wrapper`, `.laws_table` | `LegislationsPage`, `LegislationRow` | `GET /legislations` |
| شريط التصنيف | `.inner_filter_area`, `.filter_form` | `ChoiceFilter` | facets من `GET /legislations` |
| وثيقة القانون | `.law_main_desc`, `.law_main_content` | `LegislationDetailPage` | تفاصيل التشريع والمواد |
| فهرس القانون | `.law_main_index`, `.index_table` | `law-main-index` | `/structure` و`/articles` |
| رمز الوثيقة | الشعار الرسمي في المرجع | `LegislationDocumentMark` | SVG قانوني محلي غير سيادي |
| خط التعديلات | `.laws_date_filter_new` | `reference-timeline` | `/modifications` |
| عمليات التعديل | `.law_modification_item` | `amendment-card` | عمليات التعديل والنسخ السابقة/الجديدة |
| اللوائح والجداول | `.law_modification_wrapper` | `annex-card`, `PdfViewer`, `StructuredTable` | `/annexes` وملفات المصدر |
| التشريعات المرتبطة | `.laws_table` | `relation-table-head`, `relation-card` | `/relations` |
| الحالات العامة | حالات القالب | `LoadingCards`, `ErrorPanel`, `EmptyPanel` | حالة الطلب الحقيقية |
| العودة للأعلى | `.scroll_indicator` | `BackToTop` | حالة التمرير |
| التذييل | `footer_top`, `footer_bottom` | `SiteFooter` | إعدادات وروابط MariaDB |

كل مكوّن قانوني يقبل بيانات ديناميكية ولا يحتوي نصًا إماراتيًا ثابتًا. بقيت قواعد الأعمال والصلاحيات وواجهات REST وMariaDB وPDF كما كانت؛ التغيير في بنية العرض والتفاعل فقط.
