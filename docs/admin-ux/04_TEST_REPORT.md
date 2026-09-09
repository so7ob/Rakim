# تقرير اختبار Admin UX — المرحلة الثالثة

تاريخ التشغيل النهائي: 2026-09-09. شُغلت اختبارات Playwright النهائية على منافذ معزولة (`4100/4273`) لمنع مشاركة rate-limit state مع خادم التطوير.

## النتيجة الإجمالية

| المسار | النتيجة |
|---|---|
| `npm run lint` | ناجح؛ typecheck لـ API وWeb وWorker |
| `npm test` | **109 ناجحة**: API 74، Web 10، Worker 25 |
| `npm run build` | ناجح للحزم الثلاث؛ Vite حوّل 96 module |
| `npm run test:infra` | ناجح؛ Nginx syntax وsystemd |
| `YLP_TEST_API_PORT=4100 YLP_TEST_WEB_PORT=4273 npm run test:e2e -- --workers=1` | **64 ناجحة، 76 skipped مقصودة حسب project، 0 فشل، 140 حالة** |
| `VISUAL_BASE_URL=http://127.0.0.1:4273 VISUAL_ADMIN_USERNAME=super npm run visual:admin` | **84 لقطة**، 0 overflow، 0 console errors، 0 HTTP errors، 0 failed requests، 0 external requests |

## اختبارات المكونات

- `AdminDialog.spec.tsx`: dialog semantics، Escape، return focus، والتحذير المخصص قبل فقد التغييرات.
- `ConfirmDialog`: فشل الخادم يبقي الحوار مفتوحًا ويعيد تمكين submit ويعرض alert.
- `UnsavedChangesGuard.spec.tsx`: إلغاء الانتقال يبقي المسار والمدخلات، والتأكيد ينفذ الانتقال.
- بقية Web suite: Admin UI hooks/layout/import dialog. الإجمالي Web **10/10** في **6 ملفات**.

## E2E الخاص بـ View First

`tests/e2e/admin-view-first.spec.ts` يثبت:

1. البيانات المرجعية: لا inputs داخل الصفوف، validation يبقي Add dialog، POST ناجح يظهر السجل، Edit/PATCH يحدث العرض، وrefresh يحتفظ بالتغيير.
2. الأدوار: Add dialog، Detail view بلا inputs، Edit dialog، تأكيد مجموعة حرجة، cancel delete، ثم confirmed delete.
3. المستخدم: profile للقراءة ثم Edit dialog بالقيم الحالية.
4. المرادفات: Add dialog ثم delete confirmation.
5. حساب view-only: إخفاء Add/Edit، نجاح GET، ورفض POST وPATCH مباشرةً بـ **403**.
6. إعدادات التنقل والصفحات: بطاقات بلا inputs، Edit dialog، Large Editor، تحذير dirty، والاستجابة على desktop وmobile 390.
7. سياسة سير العمل: التبديل لا يفقد المدخلات دون `ConfirmDialog`، والإلغاء يبقي التبويب.

## تغطية الصلاحيات والخادم

- `admin-auth.spec.ts`: 401/403، CSRF، Canonical RBAC، ceiling لمنع privilege escalation، persistence بعد refresh/login، وتحديثات الإعدادات والسياسات.
- `admin-view-first.spec.ts`: المستخدم دون `reference.create/update` لا يرى الإجراءات والخادم يرفض المسارين بـ403.
- `article-assignment.spec.ts`: المستخدم دون `article.update` ممنوع من API، والمستخدم المصرح له ينجح.
- اختبارات API integration/unit تتحقق من `PermissionGuard`, role/user grants, protected roles, sessions وworkflow policies.
- لم تتغير permissions أو Controllers في هذه المرحلة؛ الاختبارات تثبت تطابق شروط React مع الحماية الحالية في Backend.

## Route coverage

- الـ43 route states موثقة في `01_ADMIN_ROUTE_INVENTORY.md`.
- مسارات Entity المحولة مغطاة مباشرة في `admin-view-first`, `admin-ui`, `article-assignment`, و`import-structure`.
- مسارات Workflow/Settings مغطاة في `admin-auth` أو اختبارها البصري؛ مسارات القراءة والتشغيل البسيطة مدرجة في أداة الالتقاط الموسعة.
- Parser وBulk Structure Assignment لم يُعاد تصميمهما؛ شُغلت اختبارات regression الخاصة بهما ونجحت.

## Responsive وRTL والمراجعة البصرية

- Playwright: desktop 1440، tablet 1024، mobile 390، mobile 320.
- Visual capture: **26 وجهة ثابتة** × 3 أحجام، مع **6 لقطات dialog/editor إضافية** = 84.
- فُحصت يدويًا لقطات صفحات التنقل والصفحات العامة وحوار تعديل الرابط والمحرر الكبير على 390 و1024؛ لا قص أفقي، الحقول والأزرار مقروءة، والـmodal body قابل للتمرير.
- manifest النهائي: أقصى `overflowPixels = 0`، ولا أخطاء console/network/HTTP أو طلبات خارجية.

## قيود مقصودة

- `skipped` في Playwright ليست اختبارات معطلة بسبب فشل؛ الاختبارات تستخدم `test.skip` لتخصيص السيناريو للـviewport المناسب ومنع تكرار mutations نفسها أربع مرات.
- لا توجد migration أو API جديدة، لذلك لم يلزم اختبار migration إضافي خاص بهذه المرحلة؛ CI العام يعيد اختبار migrations والـseed.
