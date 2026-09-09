# جرد مسارات الإدارة — المرحلة الثالثة

تاريخ الجرد: 2026-09-09. المصدر الحاكم هو إعداد `React Router` الفعلي في `apps/web/src/App.tsx`، ثم مكونات الصفحات وControllers في `apps/api/src`. لا تدخل المسارات العامة أو صفحة الحساب في هذا الجرد.

## الملخص العددي

- حالات التوجيه المعرفة مباشرة تحت `admin`: **22** (ومنها index وثلاثة redirects/مسارات افتراضية).
- حالات صفحات الإدارة الفعلية بعد توسيع قيم `:tab` و`:kind`: **43**.
- Entity/List/Detail: **19**.
- Settings: **6**.
- Editor/Workflow/Operational: **18**.
- حالات كانت تعرض تعديلًا inline لسجل موجود: **20**.
- حالات حُولت من inline إلى View First: **13**.
- حالات inline المتبقية كاستثناء منطقي: **7** (4 مجموعات إعدادات مستمرة، ومصفوفة صلاحيات دور، ومصفوفتا أدوار/صلاحيات مستخدم).
- صفحات Entity في الحالة النهائية التي تعرض البيانات أولًا: **19 من 19**.

المسارات `/ar/admin/imports` و`/ar/admin/content/:id` و`/ar/admin/amendments` تختار تبويبًا افتراضيًا داخل الصفحة. أما `/ar/admin/permissions` و`/ar/admin/settings` و`/ar/admin/reference-data` فتُعيد التوجيه إلى التبويب القانوني الافتراضي؛ لذلك لا تُحسب كصفحات إضافية.

## مفاتيح الجدول

- `V` عرض، `C` إنشاء، `U` تعديل، `D` حذف نهائي، `A` أرشفة/تعطيل، `W` انتقال سير عمل.
- «لا» في عملية يعني أن API/Lifecycle لا يدعمها؛ لم تُنشأ endpoint اصطناعية لتوحيد الشكل.
- كل API أدناه يبدأ بـ `/api/v1` في وقت التشغيل.

## الجرد الكامل

| # | Route / Resource | النوع | النمط السابق وInline؟ | العمليات الفعلية | الصلاحيات Canonical | Backend API | النمط النهائي والمكونات المشتركة | الحالة / الاستثناء / الاختبار |
|---:|---|---|---|---|---|---|---|---|
| 1 | `/ar/admin` — dashboard | Operational | بطاقات عرض؛ لا | V | `dashboard.view` | `GET /admin/dashboard` | `AdminLayout`, `AdminPageHeader`, بطاقات مؤشرات | لا يحتاج refactor؛ `admin-ui`, visual |
| 2 | `/ar/admin/no-permission` — access feedback | Operational | رسالة منع؛ لا | لا عمليات بيانات | المصادقة فقط؛ تصل إليها حواجز الصفحات | لا API | حالة خطأ داخل `AdminLayout` | استثناء وظيفي؛ visual |
| 3 | `/ar/admin/imports/queue` — import queue | Workflow | قائمة تشغيل وإجراءات؛ المدخلات للإجراء فقط | V/W | `source.view`, `source.review`, `source.draft.create` | `GET /imports`, `POST /imports/:id/review`, `POST /imports/:id/draft` | قائمة تشغيل + preview كبير + حوارات الإجراء القائمة | استثناء Workflow؛ `admin-ui`, `import-structure`, visual |
| 4 | `/ar/admin/imports/upload` — source import | Editor/Workflow | نموذج رفع مخصص؛ لا تعديل سجل inline | C | `source.view`, `source.upload` | `POST /imports` | Dedicated upload form | استثناء Editor؛ `admin-ui`, visual |
| 5 | `/ar/admin/content` — legislations | Entity/List | جدول بحث وفلترة؛ لا | V؛ الإنشاء عبر الاستيراد | `legislation.view` | `GET /admin/legislations` | جدول قراءة + Search/Filter/Pagination | View First أصلًا؛ `admin-ui`, visual |
| 6 | `/ar/admin/content/:id/general` — legislation metadata | Entity/Detail | Form دائم؛ **نعم** | V/U/W-A؛ لا D | `legislation.view`, `legislation.update` أو `legislation.published_metadata.update` | `GET/PATCH /admin/legislations/:id` | `EntityDetails` + `AdminDialog`؛ Workflow مستقل | **محول**؛ `admin-ui` |
| 7 | `/ar/admin/content/:id/articles` — legal articles | Editor | كل مادة textarea ومدخلات؛ **نعم** | V/U؛ لا C/D في API الحالية | `legislation.view`, `article.update` | `GET /admin/legislations/:id?articleContent=full`, `PATCH /admin/articles/:id`, `/metadata` | نص/metadata للقراءة + `AdminDialog` كبير dirty | **محول**؛ Large Editor داخل حوار كبير؛ `admin-ui`, `admin-view-first` |
| 8 | `/ar/admin/content/:id/structure` — structure | Editor | عقد قابلة للتعديل دائمًا؛ **نعم** | V/C/U؛ لا D | `legislation.view`, `structure.create/update`, `article.update` للإسناد | `POST /admin/legislations/:id/structure`, `PATCH /admin/structure/:id`, `/articles` | بطاقات قراءة + Add/Edit dialogs؛ `ArticleAssignmentDialog` متخصص | **محول**؛ الإسناد استثناء؛ `article-assignment`, `import-structure` |
| 9 | `/ar/admin/content/:id/annexes` — annexes | Entity | Forms دائمة؛ **نعم** | V/C/U/W؛ replace/repeal بدل D | `annex.create/update/publish/replace/repeal` | `POST /admin/legislations/:id/annexes`, `PATCH /admin/annexes/:id` | بطاقات قراءة + Add/Edit dialog كبير | **محول**؛ Lifecycle قانوني بلا hard delete؛ `admin-ui` |
| 10 | `/ar/admin/content/:id/relations` — legal relations | Entity | Forms دائمة؛ **نعم** | V/C/U/review؛ لا D | `relation.create/update/review` | `POST /admin/legislations/:id/relations`, `PATCH /admin/relations/:id` | بطاقات قراءة + Add/Edit dialogs | **محول**؛ `admin-ui` |
| 11 | `/ar/admin/content/:id/sources` — sources | Entity | Form دائم؛ **نعم** | V/U؛ لا C/D هنا | `legislation.view`, `source.update` | `PATCH /admin/sources/:id` | بطاقات metadata + Edit dialog | **محول**؛ `admin-ui` |
| 12 | `/ar/admin/content/:id/workflow` — legislation lifecycle | Workflow | أزرار انتقال + سبب | W/A | `legislation.prepare/submit/return/approve/publish/archive` | `POST /admin/legislations/:id/workflow` | واجهة إجراء حسب الحالة والصلاحية | استثناء Workflow؛ `admin-auth`, `admin-ui` |
| 13 | `/ar/admin/amendments/list` — amendments | Workflow/List | جدول وإجراءات مراجعة/نشر؛ لا | V/W | `amendment.view/review/publish` | `GET /admin/amendments`, `POST /admin/amendments/:id/review|publish` | قائمة تشغيل، الإجراءات المتاحة فقط | استثناء Workflow؛ `admin-auth`, visual |
| 14 | `/ar/admin/amendments/create` — amendment creation | Editor/Workflow | نموذج مخصص؛ لا تعديل inline | C | `amendment.view/create` | `GET /admin/amendments/candidates`, `POST /admin/amendments` | Dedicated relationship form | استثناء Editor؛ visual |
| 15 | `/ar/admin/audit` — audit | Operational | سجل + filter؛ لا | V | `audit.view` | `GET /admin/audit` | قائمة قراءة، inputs للفلترة فقط | لا refactor؛ `admin-auth`, visual |
| 16 | `/ar/admin/reports` — reports | Operational | بطاقات + إجراء حالة؛ لا | V/U workflow | `report.view/update` | `GET /admin/reports`, `PATCH /admin/reports/:id` | بطاقات وإجراء تشغيلي | استثناء Operational؛ visual |
| 17 | `/ar/admin/users` — users | Entity/List | جدول قراءة لكن إنشاء inline | V/C/A enable/disable | `user.view/create/enable/disable`, `role.view` | `GET/POST /admin/users`, `PATCH /admin/users/:id/state` | جدول + Add dialog + `ConfirmDialog` للحالة | **محسن**؛ `admin-view-first`, `admin-auth`, visual |
| 18 | `/ar/admin/users/:id/profile` — user profile | Entity/Detail | Form دائم؛ **نعم** | V/U/A/reset | `user.view/update/enable/disable/reset_password` | `GET /admin/users/:id/access`, `PATCH /profile`, `PATCH /state`, `POST /reset-password` | `EntityDetails` + Edit/Reset dialogs + confirmations | **محول**؛ `admin-view-first` |
| 19 | `/ar/admin/users/:id/roles` — membership | Operational | Checkboxes إسناد؛ **نعم** | assign/revoke | `role.view`, `user.roles.manage` | `GET/PATCH /admin/users/:id/roles` | مصفوفة membership متخصصة + guard للتغييرات | استثناء منطقي RBAC؛ `admin-auth` |
| 20 | `/ar/admin/users/:id/permissions` — direct overrides | Operational | Permission matrix؛ **نعم** | assign/revoke | `permission.view`, `user.permissions.manage` | `GET /admin/users/:id/permissions`, `PATCH /granular-permissions` | `PermissionExplorer` متخصص + تأكيد حساس + guard | استثناء منطقي RBAC؛ permission integration |
| 21 | `/ar/admin/users/:id/effective` — effective access | Entity/Detail | قراءة فقط؛ لا | V | `permission.view` | `GET /admin/users/:id/permissions` | `PermissionExplorer` read-only | View First أصلًا؛ `admin-auth` |
| 22 | `/ar/admin/users/:id/activity` — user audit | Operational | سجل؛ لا | V | `user.activity.view` | `GET /admin/users/:id/activity` | قائمة قراءة | استثناء Operational؛ `admin-auth` |
| 23 | `/ar/admin/users/:id/sessions` — sessions | Operational | قائمة + revoke؛ لا | V/revoke | `user.sessions.view/revoke` | `GET /admin/users/:id/sessions`, `POST /sessions/:sessionId/revoke` | قائمة + `ConfirmDialog` | Lifecycle revoke؛ `admin-auth` |
| 24 | `/ar/admin/roles` — roles | Entity/List | جدول قراءة لكن إنشاء inline | V/C | `role.view/create` | `GET/POST /admin/access-roles` | جدول + Add dialog | **محسن**؛ `admin-view-first`, visual |
| 25 | `/ar/admin/roles/:id/general` — role | Entity/Detail | Form دائم؛ **نعم** | V/U/D للمخصص غير المسند | `role.view/update/delete` | `GET/PATCH/DELETE /admin/access-roles/:id` | `EntityDetails` + Edit dialog + `ConfirmDialog` | **محول**؛ `admin-view-first` |
| 26 | `/ar/admin/roles/:id/permissions` — role grants | Operational | Permission matrix؛ **نعم** | assign/revoke | `permission.view`, `role.permissions.manage` | `GET/PATCH /admin/access-roles/:id/permissions` | `PermissionExplorer` + critical confirmation + guard | استثناء منطقي RBAC؛ `admin-view-first`, permission integration |
| 27 | `/ar/admin/roles/:id/users` — role members | Entity/Detail | جدول قراءة؛ لا | V | `user.view` | `GET /admin/access-roles/:id/users` | جدول قراءة وروابط profiles | View First أصلًا؛ `admin-auth` |
| 28 | `/ar/admin/roles/:id/activity` — role audit | Operational | سجل؛ لا | V | `audit.view` | `GET /admin/access-roles/:id/audit` | قائمة قراءة | استثناء Operational؛ `admin-auth` |
| 29 | `/ar/admin/permissions/matrix` — catalog matrix | Entity/Reference | مصفوفة read-only؛ لا | V | `permission.view` | `GET /admin/permissions` | Matrix responsive متخصصة | View First أصلًا؛ visual |
| 30 | `/ar/admin/permissions/resources` — catalog by resource | Entity/Reference | كتالوج read-only؛ لا | V | `permission.view` | `GET /admin/permissions` | `PermissionExplorer` catalog | View First أصلًا؛ visual |
| 31 | `/ar/admin/permissions/roles` — role summary | Entity/Reference | بطاقات read-only؛ لا | V | `permission.view` | `GET /admin/permissions` | بطاقات وروابط تفاصيل | View First أصلًا؛ visual |
| 32 | `/ar/admin/permissions/sensitive` — sensitive catalog | Entity/Reference | كتالوج read-only؛ لا | V | `permission.view` | `GET /admin/permissions` | `PermissionExplorer` filtered | View First أصلًا؛ visual |
| 33 | `/ar/admin/synonyms` — search synonyms | Entity/List | جدول؛ إنشاء inline وحذف مباشر | V/C/D/activate | `search.synonym.view/create/delete`, `search.synonym_set.activate` | `GET/POST/DELETE /admin/synonyms`, `POST /admin/synonym-sets/:id/activate` | Add dialog + delete/activate confirmations | **محسن**؛ `admin-view-first`, visual |
| 34 | `/ar/admin/quality` — quality issues | Operational | بطاقات + resolution form | V/resolve | `quality.view/resolve` | `GET /admin/quality`, `PATCH /admin/quality/:id` | إجراءات تشغيلية فقط | استثناء Operational؛ visual |
| 35 | `/ar/admin/settings/general` — branding settings | Settings | Form داخل section؛ **نعم** | V/U | `settings.view`, `settings.general.update` | `GET /admin/site`, `PATCH /admin/site/settings` | Form إعدادات مستمرة؛ view-only يستخدم `EntityDetails` | استثناء Settings مبرر؛ `admin-auth`, visual |
| 36 | `/ar/admin/settings/appearance` — appearance | Settings | Forms داخل sections؛ **نعم** | V/U | `settings.view`, `settings.appearance.update` | نفس API الإعدادات | Sections داخل `AdminTabs`، dirty guard | استثناء Settings مبرر؛ visual |
| 37 | `/ar/admin/settings/navigation` — navigation entities | Settings/Entity | Forms دائمة؛ **نعم** | V/C/U؛ لا D في API | `settings.view`, `navigation.create/update`, `settings.header/footer.update` | `POST/PATCH /admin/site/navigation`, settings API | بطاقات قراءة + Add/Edit dialogs؛ إعدادات header/footer تبقى sections | **محول**؛ `admin-view-first`, visual |
| 38 | `/ar/admin/settings/legislation` — legislation UI settings | Settings | Form section؛ **نعم** | V/U | `settings.view`, `settings.legislation_page.update` | settings API | Form إعدادات مستمرة + dirty guard | استثناء Settings مبرر؛ visual |
| 39 | `/ar/admin/settings/workflow` — workflow policies | Settings/Workflow | Forms policy/membership؛ **نعم** | V/U/override | `workflow_policy.view/update/overrides.manage` | `GET/PATCH /admin/workflow-policies`, `/overrides` | تبويبات سياسة متخصصة + تأكيد الانتقال + guard | استثناء Settings/RBAC؛ `admin-auth`, visual |
| 40 | `/ar/admin/settings/pages` — public pages | Settings/Editor | كل الصفحات Forms كبيرة؛ **نعم** | V/U/publish/archive؛ لا D | `settings.view`, `public_page.update/publish/archive` | `PATCH /admin/site/pages/:id` | بطاقات قراءة + `AdminDialog` large dirty | **محول**؛ Large Editor؛ `admin-view-first`, visual |
| 41 | `/ar/admin/reference-data/types` — legislation types | Entity/List | كل صف Form؛ **نعم** | V/C/U؛ لا D/A API | `reference.view/create/update` | `GET /admin/reference-data`, `POST/PATCH /admin/reference-data/types` | جدول قراءة + Add/Edit dialogs | **محول**؛ `admin-view-first`, visual |
| 42 | `/ar/admin/reference-data/subjects` — subjects | Entity/List | كل صف Form؛ **نعم** | V/C/U؛ لا D/A API | `reference.view/create/update` | `GET /admin/reference-data`, `POST/PATCH /admin/reference-data/subjects` | جدول قراءة + Add/Edit dialogs | **محول**؛ `admin-view-first`, visual |
| 43 | `/ar/admin/reference-data/authorities` — authorities | Entity/List | كل صف Form؛ **نعم** | V/C/U؛ لا D/A API | `reference.view/create/update` | `GET /admin/reference-data`, `POST/PATCH /admin/reference-data/authorities` | جدول قراءة + Add/Edit dialogs | **محول**؛ `admin-view-first`, visual |

## قرارات Lifecycle وعدم الإضافة

- لا توجد endpoint حذف للمادة أو عقدة البنية أو المصدر أو البيانات المرجعية أو رابط التنقل؛ لذلك لا يظهر زر حذف لها.
- التشريع والملحق والصفحة العامة تملك حالات قانونية (`archive`, `replace`, `repeal`, `publish`) بدل hard delete.
- المستخدم لا يُحذف؛ يعطّل أو يفعّل. الجلسة تُسحب (`revoke`).
- حذف الدور محصور بدور مخصص غير محمي وغير مسند، والخادم يعيد التحقق.
- حذف المرادف مدعوم فعليًا للمسودة ويستخدم تأكيدًا قبل الطلب.
- إنشاء التشريع يتم عبر مسار الاستيراد الحالي؛ لم تُضف واجهة إنشاء موازية أو Backend CRUD عام.
