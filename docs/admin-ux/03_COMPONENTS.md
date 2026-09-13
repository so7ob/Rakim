# مكونات Admin المشتركة

## المكونات الجديدة أو المطورة

| المكون | الغرض | قواعد الاستخدام |
|---|---|---|
| `AdminDialog` | أساس موحد لـ Add/Edit/Large Editor | أحجام small/default/large، focus trap، Escape، return focus، RTL، وتحذير dirty داخلي دون browser confirm |
| `ConfirmDialog` | تأكيد delete/disable/revoke/critical actions | يبقى مفتوحًا عند فشل الخادم، يعرض error ويعطل submit أثناء التنفيذ |
| `EntityDetails` | عرض metadata دلاليًا | `dl/dt/dd` responsive؛ يدعم قيم React وحقلًا عريضًا؛ لا disabled inputs |
| `UnsavedChangesGuard` | حماية النماذج المتخصصة عند الانتقال | حوار داخلي للروابط + browser beforeunload عند مغادرة الوثيقة |
| `PermissionExplorer` | catalog وrole/user permission matrices | بقي محررًا متخصصًا؛ أضيف تأكيد Design System للمجموعات الحرجة |
| `AdminPageHeader` | عنوان ووصف وbreadcrumbs/status/actions | استُخدم دون إنشاء headers محلية جديدة |
| `AdminTabs` | IA ثابتة للمسارات الفرعية | تبويبات الإعدادات والمحتوى والوصول، مع إخفاء التبويب غير المصرح |
| `AdminRowActions` | تجميع إجراءات الصف المصرح بها | `role="group"` واسم وصول مرتبط بالكيان؛ استُخدم في التشريعات والمستخدمين والأدوار |
| `SearchReindexAction` | مدخل موحد للعملية التشغيلية `search.index.rebuild` | يخفي نفسه دون الصلاحية ويطلب تأكيدًا ويبقي خطأ الخادم داخل الحوار |
| `StatePanel` (`LoadingCards`, `ErrorPanel`) | حالات التحميل والخطأ | يحافظ على نمط feedback الموحد وretry |

## مواضع التطبيق

- `AdminContentPage` و`AdminContentDetailPage`: Add dialog لمسودة التشريع، و`AdminRowActions` للعرض/التعديل/الأرشفة، و`EntityDetails` و`AdminDialog` لبيانات التشريع والمواد والبنية والملاحق والعلاقات والمصادر.
- `AdminReferenceDataPage`: جدول قراءة وحوار واحد قابل لإعادة الاستخدام للإضافة والتعديل.
- `AdminRolesPage` و`AdminRoleDetailPage`: Add/Edit وdelete confirmation؛ صارت U/D متاحة أيضًا من صف القائمة عندما يسمح Lifecycle.
- `AdminUsersPage` و`AdminUserDetailPage`: Add/Edit/reset وحوارات state/session؛ صف القائمة يعرض تعديلًا وتعطيلًا/تفعيلًا مباشرًا.
- `AdminDashboardPage` و`AdminSynonymsPage`: `SearchReindexAction` للعملية التشغيلية المحمية.
- `AdminSynonymsPage`: Add وdelete/activate confirmations.
- `AdminSettingsPage`: قراءة كيانات التنقل والصفحات أولًا؛ dialogs للتنقل ومحرر كبير dirty للصفحات؛ تبقى sections للإعدادات المستمرة.

لم يُنشأ framework CRUD عام أو state-management جديد؛ المكونات صغيرة وتعمل مع `useApi` و`apiRequest` القائمين.
