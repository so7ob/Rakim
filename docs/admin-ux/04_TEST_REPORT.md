# تقرير اختبار Admin UX — المرحلة الثالثة

تاريخ التشغيل النهائي: 2026-09-09. شُغلت اختبارات Playwright النهائية على منافذ معزولة (`4100/4273`) لمنع مشاركة rate-limit state مع خادم التطوير.

## النتيجة الإجمالية

| المسار | النتيجة |
|---|---|
| `npm run lint` | ناجح؛ typecheck لـ API وWeb وWorker |
| `npm test` | **112 ناجحة**: API 76، Web 11، Worker 25 |
| `npm run build` | ناجح للحزم الثلاث؛ Vite حوّل 98 module |
| `npm run test:infra` | ناجح؛ Nginx syntax وsystemd |
| `YLP_TEST_API_PORT=4100 YLP_TEST_WEB_PORT=4273 npm run test:e2e -- --workers=1` | **68 ناجحة، 88 skipped مقصودة حسب project، 0 فشل، 156 حالة** |
| `VISUAL_BASE_URL=http://127.0.0.1:4273 VISUAL_ADMIN_USERNAME=super npm run visual:admin` | **87 لقطة**، 0 overflow، 0 console errors، 0 HTTP errors، 0 failed requests، 0 external requests |

## اختبارات المكونات

- `AdminDialog.spec.tsx`: dialog semantics، Escape، return focus، والتحذير المخصص قبل فقد التغييرات.
- `ConfirmDialog`: فشل الخادم يبقي الحوار مفتوحًا ويعيد تمكين submit ويعرض alert.
- `UnsavedChangesGuard.spec.tsx`: إلغاء الانتقال يبقي المسار والمدخلات، والتأكيد ينفذ الانتقال.
- `AdminRowActions.spec.tsx`: إجراءات الصف داخل group دلالي باسم الكيان.
- بقية Web suite: Admin UI hooks/layout/import dialog. الإجمالي Web **11/11** في **7 ملفات**.

## E2E الخاص بـ View First

`tests/e2e/admin-view-first.spec.ts` يثبت:

1. البيانات المرجعية: لا inputs داخل الصفوف، validation يبقي Add dialog، POST ناجح يظهر السجل، Edit/PATCH يحدث العرض، وrefresh يحتفظ بالتغيير.
2. التشريعات: ظهور Add حسب `legislation.create`، validation، تحذير dirty، POST ناجح، ظهور السجل، وإجراء تعديل مباشر يفتح Dialog التفاصيل.
3. منع إنشاء التشريع: إخفاء Add عن `content_manager` ورفض `POST /legislations` مباشرةً بـ **403**.
4. فهرس البحث: وصول `system_admin` للإجراء، تأكيده، ونجاح `POST /admin/reindex`.
5. الأدوار: Add dialog، Detail view بلا inputs، Edit dialog، تأكيد مجموعة حرجة، ثم cancel وconfirmed delete من صف القائمة.
6. المستخدم: تعديل مباشر من صف القائمة، profile للقراءة، وتأكيد تعطيل/تفعيل لا ينفذ عند الإلغاء.
7. المرادفات: Add dialog ثم delete confirmation.
8. حساب view-only: إخفاء Add/Edit، نجاح GET، ورفض POST وPATCH مباشرةً بـ **403**.
9. إعدادات التنقل والصفحات: بطاقات بلا inputs، Edit dialog، Large Editor، تحذير dirty، والاستجابة على desktop وmobile 390.
10. سياسة سير العمل: التبديل لا يفقد المدخلات دون `ConfirmDialog`، والإلغاء يبقي التبويب.

## تغطية الصلاحيات والخادم

- `admin-auth.spec.ts`: 401/403، CSRF، Canonical RBAC، ceiling لمنع privilege escalation، persistence بعد refresh/login، وتحديثات الإعدادات والسياسات.
- سيناريو delete view-only: أبقى `role.view` وطبّق `DENY role.delete` على مدير نظام مؤقتًا؛ اختفى زر الحذف، أعاد DELETE المباشر **403**، وبقي المورد موجودًا ثم استُعيدت المنح ونُظفت البيانات في `finally`.
- سقف السلطة: لا يرى `system_admin` تعديل/تعطيل حساب `SUPER` ولا تعديل الدورين `SUPER` و`SYSTEM_ADMIN`، ويعيد الخادم `canManage=false` لهذه السجلات؛ أضيف اختبارا API لوصول هذه الإشارة دون كشف `authorityLevel` الخام.
- `admin-view-first.spec.ts`: المستخدم دون `reference.create/update` لا يرى الإجراءات والخادم يرفض المسارين بـ403.
- `article-assignment.spec.ts`: المستخدم دون `article.update` ممنوع من API، والمستخدم المصرح له ينجح.
- مقارنة ساكنة بين `@Permissions(...)` في Controllers ومفاتيح React: **0 permission تشغيلية بلا مدخل Frontend** بعد إضافة `legislation.create` و`search.index.rebuild`.
- اختبارات API integration/unit تتحقق من `PermissionGuard`, role/user grants, protected roles, sessions وworkflow policies.
- لم تتغير مفاتيح الصلاحيات أو write endpoints في تصحيح #54؛ استُخدمت `POST /legislations` و`POST /admin/reindex` القائمتان والمحميتان. أضيفت استجابة توافقية `canManage` إلى GET للأدوار والمستخدمين، وتمرر Controllers هوية المنفذ كي تطابق الواجهة سقف السلطة الذي يفرضه Backend.

## Route coverage

- الـ43 route states موثقة في `01_ADMIN_ROUTE_INVENTORY.md`.
- مسارات Entity المحولة مغطاة مباشرة في `admin-view-first`, `admin-ui`, `article-assignment`, و`import-structure`.
- مسارات Workflow/Settings مغطاة في `admin-auth` أو اختبارها البصري؛ مسارات القراءة والتشغيل البسيطة مدرجة في أداة الالتقاط الموسعة.
- Parser وBulk Structure Assignment لم يُعاد تصميمهما؛ شُغلت اختبارات regression الخاصة بهما ونجحت.

## Responsive وRTL والمراجعة البصرية

- Playwright: desktop 1440، tablet 1024، mobile 390، mobile 320.
- Visual capture: **26 وجهة ثابتة** × 3 أحجام، مع **9 لقطات dialog/editor إضافية** = 87.
- فُحصت يدويًا لقطتا حوار إضافة التشريع على 1440 و390، وقائمتا المستخدمين والأدوار بعد إضافة إجراءات الصف، إضافةً إلى صفحات التنقل والصفحات العامة وحوار تعديل الرابط والمحرر الكبير؛ لا قص في الصفحة، الجداول قابلة للتمرير داخل حاويتها، الحقول والأزرار مقروءة، والـmodal body قابل للتمرير.
- لقطات PR #55 المنتقاة: [`54-legislations-desktop.png`](screenshots/54-legislations-desktop.png)، [`54-users-desktop.png`](screenshots/54-users-desktop.png)، و[`54-legislation-add-mobile.png`](screenshots/54-legislation-add-mobile.png).
- manifest النهائي: أقصى `overflowPixels = 0`، ولا أخطاء console/network/HTTP أو طلبات خارجية.

## قيود مقصودة

- `skipped` في Playwright ليست اختبارات معطلة بسبب فشل؛ الاختبارات تستخدم `test.skip` لتخصيص السيناريو للـviewport المناسب ومنع تكرار mutations نفسها أربع مرات.
- لا توجد migration أو API جديدة، لذلك لم يلزم اختبار migration إضافي خاص بهذه المرحلة؛ CI العام يعيد اختبار migrations والـseed.
