# تقرير تنفيذ واجهة الإدارة ونظام الصلاحيات

## الملخص

أعيد بناء لوحة الإدارة كواجهة مؤسسية RTL ذات تنقل هرمي وتبويبات مرتبطة بالمسارات. أضيف نموذج صلاحيات تفصيلي محفوظ في MariaDB ومطبق في Backend، وصفحات مستقلة للمستخدمين والأدوار والصلاحيات، وتقسيم لصفحات الإعدادات والتشريع والاستيراد والتعديلات والقوائم المرجعية. لم تُستبدل بنية React + Node.js + MariaDB ولم تُحذف وظيفة إدارية قائمة.

## ما نُفذ

### التنقل والبنية المشتركة

- قائمة شجرية حسب الصلاحيات، فتح/طي الفروع، فتح الفرع النشط تلقائيًا وحفظ حالته.
- تصغير كامل للشريط مع عناوين مساعدة، وdrawer للهاتف مع scrim وزر إغلاق داخلي.
- `AdminPageHeader` موحد للمسار والعنوان والوصف والحالة والإجراءات.
- `AdminTabs` بمسارات URL مباشرة وعدادات عند توفر البيانات.
- `UnsavedChangesGuard` وتحذير الانتقال من نموذج غير محفوظ.
- حالات تحميل وخطأ وفراغ ورفض صلاحية واضحة.

### إعدادات المنصة والسياسات

- المسارات: `general`, `appearance`, `navigation`, `legislation`, `workflow`, `pages`.
- حفظ مستقل لكل مجموعة، سبب إلزامي، حالة saving، وتعطيل الحفظ دون تغييرات.
- خمسة تبويبات مستقلة لسياسات فصل الواجبات.
- لكل سياسة: تعطيل عالمي، واختيار مستخدمين مستثنين من الصفحة نفسها.
- استثناء السياسة ظاهر للقراءة أمام المستخدم ولا يوجد محرر ثانٍ في شاشة المستخدمين.

### المستخدمون

- بحث وفلاتر حالة ودور وpagination وتحديد متعدد وتفعيل/تعطيل جماعي مشروط بالصلاحية.
- صفحة تفاصيل: ملف شخصي، أدوار، صلاحيات مباشرة، صلاحيات فعالة، نشاط، جلسات.
- عرض مصدر الدور ووقت الإسناد والمانح عند توفره.
- منح/رفض مباشر مع سبب وتدقيق وإبطال جلسات المستخدم.
- تفسير الصلاحية الفعالة: موروثة من دور/أدوار، منح مباشر، رفض مباشر أو غير ممنوحة.
- عرض الجلسات وإبطال النشطة بصلاحية مستقلة.

### الأدوار والصلاحيات

- قائمة أدوار تعرض النظامي/المخصص والحالة وعدد المستخدمين والصلاحيات.
- إنشاء دور مخصص وتعديل بياناته وحذفه عند عدم إسناده.
- تفاصيل الدور: عام، Permission Explorer، المستخدمون، سجل التغييرات.
- تحديد صلاحية أو مجموعة ومسح المجموعة، مع تحذير قبل مجموعة تحتوي صلاحيات حرجة.
- صفحة نموذج الصلاحيات: مصفوفة مورد × عملية، حسب الموارد، حسب الأدوار، والحساسة.
- 56 تعريفًا فعليًا بصيغة `resource.action` ومستويات `NORMAL/ELEVATED/CRITICAL`.

### فرض الصلاحيات في الخادم

- أضيف `PermissionGuard` و`@Permissions` إلى endpoints الإدارة والاستيراد والتعديلات والتشريعات وإعدادات الموقع.
- القرار الدقيق المعتمد على البيانات بقي داخل الخدمات، مثل انتقال سير العمل ومجموعة الإعدادات.
- تجمع المصادقة الأدوار والمنح والرفض المباشر واستثناءات السياسات من MariaDB عند كل جلسة جديدة.
- التعديل الأمني يبطل جلسات المتأثر حتى لا تستمر صلاحيات مخزنة في جلسة قديمة.
- بقي RoleGuard للتوافق فقط ويتنحى عندما يحدد endpoint صلاحية تفصيلية.
- أضيفت حماية آخر مدير نظام والدور النظامي ومنع الإغلاق الذاتي غير المقصود.

### بقية صفحات الإدارة

- التشريعات: بحث، فلتر حالة، pagination، وصفحة تفاصيل ذات سبعة تبويبات.
- الاستيراد: قائمة الانتظار ورفع المصدر في مسارين.
- التعديلات: القائمة والإنشاء في مسارين.
- القوائم المرجعية: مسار مستقل للنوع والموضوع والجهة.
- قاموس البحث والجودة والبلاغات: فصل صلاحية العرض عن أدوات المعالجة.
- سجل التدقيق: رأس موحد، فلتر operation، pagination، وتفاصيل قبل/بعد.

## قاعدة البيانات والترحيل

- `1700000000010-granular-access-control.ts`: migration ذات snapshot ثابت أنشأت `permission_definitions`, `role_permissions`, `user_permission_overrides` ووسعت `roles` و`user_roles` وربطت الأدوار التاريخية.
- حُفظت أدوار المستخدمين القديمة عبر mapping صريح دون توسيع عشوائي للصلاحيات.
- نتيجة `npm run db:migrate`: لا توجد migrations معلقة بعد التطبيق.

## الملفات الرئيسية

### Backend

- `apps/api/src/common/permission-catalog.ts`
- `apps/api/src/common/permission.guard.ts`
- `apps/api/src/common/role.guard.ts`
- `apps/api/src/admin/access-control.controller.ts`
- `apps/api/src/admin/access-control.service.ts`
- `apps/api/src/admin/admin.controller.ts`
- `apps/api/src/admin/admin.service.ts`
- controllers/modules لخدمات `imports`, `amendments`, `site`, `legislations`
- `apps/api/src/auth/auth.service.ts`, `auth.types.ts`
- ترحيل قاعدة البيانات `1700000000010`

### Frontend

- `apps/web/src/components/AdminLayout.tsx`
- `apps/web/src/components/admin/AdminPageHeader.tsx`
- `apps/web/src/components/admin/AdminTabs.tsx`
- `apps/web/src/components/admin/PermissionExplorer.tsx`
- `apps/web/src/components/admin/UnsavedChangesGuard.tsx`
- `apps/web/src/auth/RequirePermission.tsx`
- `apps/web/src/pages/admin/AdminUsersPage.tsx`
- `apps/web/src/pages/admin/AdminUserDetailPage.tsx`
- `apps/web/src/pages/admin/AdminRolesPage.tsx`
- `apps/web/src/pages/admin/AdminRoleDetailPage.tsx`
- `apps/web/src/pages/admin/AdminPermissionsPage.tsx`
- `apps/web/src/pages/admin/AdminSettingsPage.tsx`
- `apps/web/src/pages/admin/WorkflowPoliciesEditor.tsx`
- صفحات الإدارة القائمة و`apps/web/src/App.tsx` و`styles.css`

### الاختبارات واللقطات

- `apps/api/src/common/permission.guard.spec.ts`
- `apps/api/src/admin/workflow-policy.spec.ts`
- `tests/e2e/admin-auth.spec.ts`
- `tests/e2e/admin-ui.spec.ts`
- `scripts/reference/capture-admin-ui.mjs`
- `scripts/reference/capture-workflow-controls.mjs`
- `artifacts/admin-ui/`: 21 لقطة عبر 1440×1000 و1024×900 و390×844 مع manifest.
- `artifacts/workflow-controls/`: كل تبويبات السياسات وشاشة ظهور الاستثناءات في 1440 و390.

## نتائج التحقق

| التحقق                    | النتيجة                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `npm run lint`            | ناجح لجميع workspaces                                                        |
| `npm run build`           | ناجح؛ API وworker وVite (91 module)                                          |
| `npm test`                | 42 ناجحًا: API 33، Web 2، Worker 7                                           |
| `npm run test:e2e`        | 50 ناجحًا، 38 مستبعدة عمدًا بحسب project، دون فشل                            |
| `npm run test:infra`      | Nginx وsystemd ناجحان                                                        |
| `npm run db:migrate`      | ناجح على قاعدة فارغة؛ 56 تعريفًا و82 منحة دور بعد seed، ونجح down لـ0010     |
| `npm run visual:admin`    | 21 لقطة، لا console errors أو failed assets أو external requests أو overflow |
| `npm run visual:workflow` | سطح مكتب وهاتف، دون overflow أو console errors                               |
| `git diff --check`        | ناجح                                                                         |

اختبارات الصلاحيات الفعلية تحققت من 401/403 وCSRF، العرض دون تعديل، منح مباشر وحفظه بعد login جديد، سحبه، توريث صلاحية من دور مؤقت، إزالة الدور وسحب الصلاحية، تصفية القائمة الشجرية، والوصول المباشر للمسار. اختبارات الواجهة تحققت من الفروع والتصغير وحفظ الحالة والتبويبات وBack/Forward وrefresh وقائمة الهاتف ولوحة المفاتيح وRTL وعدم overflow.

تتحقق اختبارات الوحدة كذلك من رفض `OWN` و`ASSIGNED` قبل أي كتابة في قاعدة البيانات، لأن الخادم يدعم `ALL` فقط في الإصدار الحالي.

بعد الاختبارات أُكد عدم بقاء دور تجريبي أو override مباشر أو استثناء سياسة تجريبي. سياسة منع الاعتماد الذاتي باقية معطلة عالميًا كما كانت مطلوبة، والقارئ فعال وغير مقفل.

## الفجوات الحقيقية

- بنية `OWN` و`ASSIGNED` موجودة في قاعدة البيانات، لكنها غير مفعلة في المنتج لأن النظام الحالي لا يملك حقول ملكية/إسناد موحدة يمكن فرضها في كل استعلام. يعرض المنتج `ALL` فقط حتى يوجد enforcement حقيقي.
- لا توجد في النظام الحالي عملية حذف تشريع أو حذف مستخدم، ولا صفحة نسخ احتياطي أو مراقبة أخطاء مستقلة؛ لم تُنشأ أزرار شكلية أو endpoints غير مدعومة.
- كتالوج تعريفات الصلاحيات للعرض والتحليل؛ تعديل المنح يتم من الدور أو المستخدم. إنشاء تعريفات runtime غير متاح عمدًا حتى لا ينشأ رمز صلاحية لا يحمي endpoint فعليًا.
- لقطات الإدارة هي baseline للمنصة الحالية؛ لم يقدم مرجع بصري خارجي للوحة الإدارة يسمح بادعاء مطابقة pixel-perfect لها.

## أوامر التشغيل

```bash
npm run db:migrate
npm run dev
npm run lint
npm test
npm run build
npm run test:e2e
npm run visual:admin
npm run visual:workflow
```

على الإنتاج تُستبدل حسابات وكلمات مرور التطوير وتُشغل API والworker عبر وحدات systemd الموجودة خلف Nginx.
