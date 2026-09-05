# الكتالوج النهائي للصلاحيات

المصدر التنفيذي الوحيد هو `canonical-permission-catalog.ts`. يحتوي الكتالوج **75 صلاحية RBAC فريدة**، كلها نظامية، ولا يقبل الإصدار الحالي إلا نطاق `ALL`. درجات الخطر: `NORMAL` = عادي، `ELEVATED` = حساس، `CRITICAL` = حرج.

|   # | Permission                              | الاسم العربي                    | الخطر    |
| --: | --------------------------------------- | ------------------------------- | -------- |
|   1 | `dashboard.view`                        | عرض لوحة المؤشرات               | NORMAL   |
|   2 | `legislation.view`                      | عرض التشريعات الإدارية          | NORMAL   |
|   3 | `legislation.create`                    | إنشاء تشريع                     | ELEVATED |
|   4 | `legislation.update`                    | تعديل مسودة تشريع               | ELEVATED |
|   5 | `legislation.published_metadata.update` | تصحيح بيانات تشريع منشور        | ELEVATED |
|   6 | `legislation.prepare`                   | تجهيز الوارد كمسودة             | ELEVATED |
|   7 | `legislation.submit`                    | إرسال التشريع للمراجعة          | ELEVATED |
|   8 | `legislation.return`                    | إعادة التشريع للمسودة           | ELEVATED |
|   9 | `legislation.approve`                   | اعتماد التشريع                  | CRITICAL |
|  10 | `legislation.publish`                   | نشر التشريع                     | CRITICAL |
|  11 | `legislation.archive`                   | أرشفة التشريع                   | ELEVATED |
|  12 | `article.update`                        | تعديل المواد                    | ELEVATED |
|  13 | `structure.create`                      | إنشاء عقدة بنية                 | ELEVATED |
|  14 | `structure.update`                      | تعديل بنية التشريع              | ELEVATED |
|  15 | `annex.create`                          | إنشاء ملحق                      | ELEVATED |
|  16 | `annex.update`                          | تعديل ملحق                      | ELEVATED |
|  17 | `annex.publish`                         | نشر ملحق                        | CRITICAL |
|  18 | `annex.replace`                         | استبدال ملحق                    | CRITICAL |
|  19 | `annex.repeal`                          | إلغاء ملحق قانونيًا             | CRITICAL |
|  20 | `relation.create`                       | إنشاء علاقة قانونية             | ELEVATED |
|  21 | `relation.update`                       | تعديل علاقة قانونية             | ELEVATED |
|  22 | `relation.review`                       | مراجعة علاقة قانونية            | ELEVATED |
|  23 | `reference.view`                        | عرض القوائم المرجعية            | NORMAL   |
|  24 | `reference.create`                      | إنشاء قيمة مرجعية               | ELEVATED |
|  25 | `reference.update`                      | تعديل قيمة مرجعية               | ELEVATED |
|  26 | `source.view`                           | عرض المصادر                     | ELEVATED |
|  27 | `source.upload`                         | رفع مصدر                        | ELEVATED |
|  28 | `source.review`                         | مراجعة المصدر                   | ELEVATED |
|  29 | `source.draft.create`                   | إنشاء مسودة من مصدر             | ELEVATED |
|  30 | `source.update`                         | تعديل بيانات المصدر             | ELEVATED |
|  31 | `amendment.view`                        | عرض التعديلات                   | NORMAL   |
|  32 | `amendment.create`                      | إنشاء تعديل                     | ELEVATED |
|  33 | `amendment.review`                      | مراجعة تعديل                    | CRITICAL |
|  34 | `amendment.publish`                     | نشر تعديل                       | CRITICAL |
|  35 | `quality.view`                          | عرض مشكلات الجودة               | NORMAL   |
|  36 | `quality.resolve`                       | معالجة مشكلة جودة               | ELEVATED |
|  37 | `report.view`                           | عرض بلاغات المحتوى              | ELEVATED |
|  38 | `report.update`                         | معالجة بلاغ محتوى               | ELEVATED |
|  39 | `audit.view`                            | عرض سجل التدقيق                 | ELEVATED |
|  40 | `search.synonym.view`                   | عرض قاموس البحث                 | NORMAL   |
|  41 | `search.synonym.create`                 | إنشاء مرادف                     | ELEVATED |
|  42 | `search.synonym.delete`                 | حذف مرادف                       | ELEVATED |
|  43 | `search.synonym_set.activate`           | تفعيل مجموعة مرادفات            | CRITICAL |
|  44 | `search.index.rebuild`                  | إعادة بناء فهرس البحث           | ELEVATED |
|  45 | `settings.view`                         | عرض إعدادات المنصة              | NORMAL   |
|  46 | `settings.general.update`               | تحديث الإعدادات العامة          | ELEVATED |
|  47 | `settings.appearance.update`            | تحديث المظهر                    | ELEVATED |
|  48 | `settings.header.update`                | تحديث الترويسة                  | ELEVATED |
|  49 | `settings.footer.update`                | تحديث التذييل                   | ELEVATED |
|  50 | `settings.legislation_page.update`      | تحديث صفحة التشريع              | ELEVATED |
|  51 | `navigation.create`                     | إنشاء عنصر تنقل                 | ELEVATED |
|  52 | `navigation.update`                     | تعديل عنصر تنقل                 | ELEVATED |
|  53 | `public_page.update`                    | تعديل صفحة عامة                 | ELEVATED |
|  54 | `public_page.publish`                   | نشر صفحة عامة                   | CRITICAL |
|  55 | `public_page.archive`                   | أرشفة صفحة عامة                 | ELEVATED |
|  56 | `workflow_policy.view`                  | عرض سياسات سير العمل            | NORMAL   |
|  57 | `workflow_policy.update`                | تحديث سياسة سير العمل           | CRITICAL |
|  58 | `workflow_policy.overrides.manage`      | إدارة استثناءات سير العمل       | CRITICAL |
|  59 | `user.view`                             | عرض المستخدمين                  | ELEVATED |
|  60 | `user.create`                           | إنشاء مستخدم                    | CRITICAL |
|  61 | `user.update`                           | تعديل المستخدم                  | ELEVATED |
|  62 | `user.enable`                           | تفعيل مستخدم                    | CRITICAL |
|  63 | `user.disable`                          | تعطيل مستخدم                    | CRITICAL |
|  64 | `user.reset_password`                   | إعادة تعيين كلمة المرور         | CRITICAL |
|  65 | `user.roles.manage`                     | إدارة أدوار المستخدم            | CRITICAL |
|  66 | `user.permissions.manage`               | إدارة صلاحيات المستخدم المباشرة | CRITICAL |
|  67 | `user.activity.view`                    | عرض نشاط المستخدم               | ELEVATED |
|  68 | `user.sessions.view`                    | عرض جلسات المستخدم              | ELEVATED |
|  69 | `user.sessions.revoke`                  | إبطال جلسة مستخدم               | CRITICAL |
|  70 | `role.view`                             | عرض الأدوار                     | ELEVATED |
|  71 | `role.create`                           | إنشاء دور                       | CRITICAL |
|  72 | `role.update`                           | تعديل دور                       | CRITICAL |
|  73 | `role.delete`                           | حذف دور                         | CRITICAL |
|  74 | `role.permissions.manage`               | إدارة صلاحيات الدور             | CRITICAL |
|  75 | `permission.view`                       | عرض كتالوج الصلاحيات            | ELEVATED |

## قدرات Workflow المنفصلة

القدرات التالية ليست permission definitions ولا role grants؛ مصدرها `workflow_policy_user_exceptions` فقط:

- `workflow.source_import.self_review.override`
- `workflow.legislation.self_approval.override`
- `workflow.legislation.self_publication.override`
- `workflow.amendment.self_review.override`
- `workflow.amendment.self_publication.override`

وبذلك يكون الإجمالي المحكوم: **75 RBAC + 5 policy-only = 80**.
