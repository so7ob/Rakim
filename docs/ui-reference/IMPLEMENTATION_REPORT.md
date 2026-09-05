# تقرير تنفيذ واجهة المرجع

تاريخ التحقق النهائي: 5 سبتمبر 2026. فرع العمل: `feature/1-reference-ui-settings`.

## النتيجة التنفيذية

أُعيد بناء صفحة قائمة التشريعات وقالب نص القانون وصفحات التعديلات واللوائح/الجداول والتشريعات ذات الصلة في React اعتمادًا على ملفات HTML/CSS والصور المرفقة. لم يعد التنفيذ يستخدم شبكة بطاقات عامة لهذه المسارات؛ أصبح لكل منها القالب المرجعي المقاس، مع بقاء البيانات وREST وMariaDB والنسخ الزمنية والصلاحيات وPDF دون استبدال.

لا يعتمد التطبيق على موقع الإمارات، ولا ينفذ JavaScript مرجعيًا، ولا يستورد شعارًا أو علمًا أو نصًا تشريعيًا إماراتيًا. استُبدل الختم داخل الوثيقة برمز قانوني SVG محلي غير سيادي، مع الحفاظ على مساحة العنصر.

## الصفحات المعاد بناؤها

- `/ar/legislations` و`/ar/archived-legislation`: جدول بأعمدة اسم التشريع ورقمه وسنة الإصدار وإجراءاته، وصفوف متقطعة، وشريط تصنيف يمين.
- `/ar/legislations/:id` و`/ar/legislations/:id/archived`: رأس قانون موحد، بيانات وصفية، وثيقة مسطحة، ديباجة، فصول ومواد، فهرس يمين قابل للبحث والثبات، روابط مواد، عرض بتاريخ ونسخ سابقة.
- `/ar/legislations/:id/modifications`: رأس موحد، عدادات، خط زمني للسنوات وعمليات التعديل من API.
- `/ar/legislations/:id/regulations`: صفوف لوائح وجداول قابلة للفتح، تنزيل وPDF.js وجدول منظم.
- `/ar/legislations/:id/related-legislations`: جدول علاقات موجهة مع رقم وسنة التشريع ودليل العلاقة.
- بقيت الرئيسية والدستور والترويسة والتذييل والبحث وصفحات الإدارة من الجولة السابقة، وأعيد استخدامها دون تعطيل.

## القياسات المثبتة

عند 1440×1000 وترويسة 120px:

| العنصر | القيمة المحققة |
|---|---:|
| عرض الحاوية الداخلي | 1285.6px |
| بداية لوحة قائمة التشريعات | y=389px |
| نهاية بانر القائمة | y=469px |
| عرض شريط التصنيف/فهرس القانون | 376px |
| عرض جدول القائمة/نص القانون | 909.6px |
| ارتفاع رأس جدول التشريعات | 64px |
| ارتفاع صف التشريع | 87px |
| نهاية بانر نص القانون | y=560px |
| بداية وثيقة القانون | y=480px |
| ارتفاع بانر الصفحات الفرعية | 505px |
| بداية لوحة الصفحات الفرعية | y=545px |
| التداخل الرأسي | 80px |
| بطاقة سنة التعديل | 80×107px |

تتحول القائمة والوثيقة إلى عمود واحد تحت 820px، وتبقى البيانات الوصفية في شبكة عمودين على الهاتف. تم التحقق من عدم وجود تمرير أفقي عند 1440 و1366 و1280 و1024 و768 و430 و390 و360، إضافة إلى 320px في Playwright.

## المكونات

- أضيف `LegislationHero` بوصفه الرأس الوحيد لنص القانون وصفحاته الفرعية.
- أضيف `UiIcon` لأيقونات SVG المحلية بدل رموز Unicode التقريبية.
- أضيف `LegislationDocumentMark` ليحل محل الختم السيادي بأصل محلي.
- أعيد بناء `LegislationsPage`, `LegislationDetailPage`, `ModificationsPage`, `RegulationsPage`, `RelatedLegislationsPage`.
- بُسّط `LegislationSubpageHeader` ليجلب البيانات ويفوض العرض إلى الرأس المشترك.
- بقي `LegislationActions`, `PdfViewer`, `PreviousTextsDialog`, حالات التحميل والخطأ والفراغ، وخدمات API قابلة لإعادة الاستخدام.

تفاصيل الربط في [COMPONENT_MAP.md](./COMPONENT_MAP.md)، والقيم في [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)، والحالات في [INTERACTION_STATES.md](./INTERACTION_STATES.md).

## التفاعلات المنفذة

- اختيار/مسح مرشحات النوع والسنة والجهة والحالة مع مزامنة URL وإعادة جلب API.
- ترتيب النتائج والتنقل بين الصفحات.
- مشاركة وتنزيل ومفضلة وطباعة ونسخ رابط القانون بأيقونات SVG.
- بحث فهرس المواد ومسحه، وروابط داخلية تحدد المادة وتنقل التركيز إليها.
- اختيار تاريخ النص النافذ وفتح حوار النصوص السابقة مع إعادة التركيز إلى زر الاستدعاء.
- خط زمني بلوحة المفاتيح و`role=tab`/`aria-selected`.
- فتح وإغلاق اللوائح وPDF، وكشف تفاصيل العلاقة.
- حالات hover وfocus-visible وselected وdisabled وloading/error/empty، وتنسيق طباعة يخفي الغلاف والفهرس.

## سياسات فصل الواجبات القابلة للإدارة

أصبحت قيود فصل الواجبات البشرية خمس سياسات مركزية داخل **إعدادات المنصة ← سياسات وضوابط سير العمل**: مراجعة المصدر المستورد، اعتماد التشريع، نشر التشريع، مراجعة التعديل، ونشر التعديل. لكل سياسة تبويب مستقل يضم مسارين منفصلين: تعطيلها عالميًا، أو اختيار مستخدمين محددين لاستثنائهم منها. لا يمنح الاستثناء الدور الأساسي المطلوب للعملية.

لا يوجد محرر لهذه الاستثناءات في شاشة المستخدمين؛ تعرض الشاشة شارات للقراءة فقط أمام كل مستخدم تبين السياسات التي يستطيع تجاوزها. حفظ حالة السياسة ومستخدميها عملية ذرية مسجلة في سجل التدقيق، وتبطل الجلسات النشطة للمستخدمين المتأثرين حتى تسري الصلاحية فور تسجيل الدخول التالي.

## الاختبارات واللقطات

### خط الأساس الموسع

- `visual:reference`: 56 زوج صفحة/حجم للمرجع المحلي، عبر 7 صفحات و8 أحجام، مع CSP يمنع scripts/connect/frames.
- `visual:implementation`: 56 زوج صفحة/حجم للإنتاج؛ 0 overflow، 0 console errors، 0 failed requests.
- `visual:compare`: 168 سجل مقارنة؛ لكل سجل Overlay وDifference map (336 صورة).
- `visual:provided`: مقارنة مباشرة مع الصور السبع المؤرخة 1440×1000 التي قدمها المستخدم، مع Reference وImplementation وOverlay وDifference لكل صفحة.
- `visual:workflow`: لقطات لإجمالي السياسات، وكل واحد من تبويباتها الخمسة، وشاشة المستخدمين عند 1440×1000 و390×844؛ بلا overflow أو console errors أو طلبات فاشلة.

نتائج الصور المرفقة الخام:

| الصفحة | فرق luminance |
|---|---:|
| قائمة التشريعات | 2.317% |
| نص القانون | 7.381% |
| التعديلات | 5.069% |
| اللوائح والجداول | 4.227% |
| التشريعات ذات الصلة | 6.052% |
| نص قانون مؤرشف | 3.454% |
| مرتبطات قانون مؤرشف | 7.118% |

هذه نسب خام تشمل اختلاف الهوية والنصوص وعدد الصفوف والسنوات. المراجعة البشرية تؤكد تطابق مواضع الحاويات والفهرس والتداخلات الرئيسية؛ الفروقات الباقية موثقة في [REMAINING_GAPS.md](./REMAINING_GAPS.md).

المخرجات موجودة في:

- `artifacts/visual-comparison/reference/`
- `artifacts/visual-comparison/implementation/`
- `artifacts/visual-comparison/comparison/`
- `artifacts/visual-comparison/provided-screenshots-1440x1000/`
- `artifacts/workflow-controls/`

## نتائج التحقق النهائية

| الأمر | النتيجة |
|---|---|
| `npm run lint` | ناجح؛ typecheck للـAPI والواجهة والworker |
| `npm test` | ناجح؛ 35 اختبار وحدة (26 API، 2 Web، 7 Worker) |
| `npm run build` | ناجح؛ بناء API وworker وReact/Vite للإنتاج |
| `npx playwright test --workers=1` | ناجح؛ 45 passed، 27 skipped حسب project gating، 0 failed |
| `npx playwright test tests/e2e/admin-auth.spec.ts --project=desktop-1440 --workers=1` | ناجح؛ 5 passed، بما فيها منح استثناء من صفحة السياسة وظهوره للقراءة فقط أمام المستخدم ثم استعادة الحالة الأصلية |
| `npm run test:infra` | ناجح؛ Nginx وsystemd متوافقان مع Debian |
| `npm run visual:reference` | ناجح؛ 56 التقاطًا مرجعيًا |
| `npm run visual:implementation` | ناجح؛ 56 التقاطًا بلا أخطاء أو طلبات فاشلة |
| `npm run visual:compare` | ناجح؛ 168 مقارنة و336 صورة فرق/تراكب |
| `npm run visual:provided` | ناجح؛ 7 مقارنات مباشرة للصور المرفقة |
| `npm run visual:workflow` | ناجح؛ حجمان، 0 overflow، 0 console errors، 0 failed requests |

شُغلت Playwright تسلسليًا لأن تشغيل جميع المشاريع المتعددة بالتوازي يستهلك حد طلبات بيئة التطوير المحلية؛ هذا لا يغير نطاق الاختبارات أو نتائجها.

## البيانات والهوية

كل القوائم والمواد والنسخ والتعديلات واللوائح والعلاقات من API وقاعدة المنصة. لا توجد بيانات mock جديدة داخل React. قاعدة التطوير الحالية نفسها موسومة بأنها بيانات اصطناعية؛ لم تُستبدل أو تُنسخ داخل الواجهة.

ألوان المرجع الافتراضية هي `#AC4459/#344B61`. التشغيل الطبيعي يحترم قيم الهوية المدارة في MariaDB، بينما أدوات المقارنة تثبت لوحة المرجع فقط أثناء الالتقاط لتفصل فرق القالب عن قرار اللون الإداري.

## الملفات المعدلة أو المضافة

### تطبيق React

- `apps/web/src/components/LegislationActions.tsx`
- `apps/web/src/components/LegislationDocumentMark.tsx`
- `apps/web/src/components/LegislationHero.tsx`
- `apps/web/src/components/LegislationSubpageHeader.tsx`
- `apps/web/src/components/UiIcon.tsx`
- `apps/web/src/pages/LegislationDetailPage.tsx`
- `apps/web/src/pages/LegislationsPage.tsx`
- `apps/web/src/pages/ModificationsPage.tsx`
- `apps/web/src/pages/RegulationsPage.tsx`
- `apps/web/src/pages/RelatedLegislationsPage.tsx`
- `apps/web/src/pages/admin/AdminSettingsPage.tsx`
- `apps/web/src/pages/admin/AdminUsersPage.tsx`
- `apps/web/src/pages/admin/WorkflowPoliciesEditor.tsx`
- `apps/web/src/styles.css`

### سياسات سير العمل وAPI

- `apps/api/src/admin/workflow-policies.ts`
- `apps/api/src/admin/workflow-policy.spec.ts`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/imports/imports.service.ts`
- `apps/api/src/amendments/amendments.service.ts`
- `apps/api/src/database/migrations/1700000000008-workflow-controls.ts`
- `apps/api/src/database/migrations/1700000000009-workflow-policy-catalog.ts`

### اختبارات وأدوات هذه الجولة

- `tests/e2e/admin-auth.spec.ts`
- `tests/e2e/reference-ui.spec.ts`
- `tests/e2e/public-journey.spec.ts-snapshots/home-desktop-1440-linux.png`
- `scripts/reference/capture-reference.mjs`
- `scripts/reference/capture-implementation.mjs`
- `scripts/reference/compare-visuals.mjs`
- `scripts/reference/compare-provided-screenshots.mjs`
- `scripts/reference/capture-workflow-controls.mjs`
- `package.json`
- `artifacts/visual-comparison/**`

تظل ملفات الجولة السابقة المعدلة ظاهرة في Git (الغلاف العام، الرئيسية، الدستور، API والإعدادات والوثائق) ومحفوظة دون reset أو clean. الجرد الكامل لحالة العمل يُستخرج بـ`git status --short`.

## التشغيل

بعد ضبط `.env` وتشغيل MariaDB:

```bash
npm run db:migrate
npm run dev
```

للإنتاج والتحقق:

```bash
npm run build
npm run start
npm run start:worker
npm run lint
npm test
npx playwright test --workers=1
npm run test:infra
npm run visual:reference
npm run visual:implementation
npm run visual:compare
npm run visual:provided
npm run visual:workflow
```
