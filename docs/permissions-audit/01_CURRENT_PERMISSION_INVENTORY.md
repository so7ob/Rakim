# جرد الصلاحيات الحالية

تاريخ التدقيق: 2026-09-05

المرجع: الفرع `docs/20-permissions-audit`، Issue #20، والنسخة `4f37abb`

النطاق: تحليل ساكن للكود وقراءات `SELECT` فقط من قاعدة التطوير المحلية.

## النتيجة التنفيذية

- كتالوج الصلاحيات النظامي يحتوي **56** مفتاحًا، وهو متطابق بين `permission-catalog.ts` وجدول `permission_definitions` في قاعدة التطوير.
- **54** مفتاحًا لها استدعاء فعلي في Backend أو Frontend، و**2** بلا إنفاذ وظيفي: `role.assign` و`permission.manage`.
- توجد **5** قدرات استثناء Workflow بصيغة `workflow:...:override` خارج الكتالوج؛ تُخزّن في `user_permissions` ولا يمكن إسنادها عبر الأدوار.
- لا توجد Direct grants/denies ولا استثناءات Workflow مسندة حاليًا في قاعدة التطوير.
- كل التعريفات الحالية تعلن `ALL` فقط. البنية تستوعب `OWN` و`ASSIGNED`، لكن الخادم لا يفرض Scope على الاستعلامات.

## مصادر الحقيقة

| المصدر                                                                  | ما أُثبت منه                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| `apps/api/src/common/permission-catalog.ts`                             | المفاتيح والبيانات الوصفية ومستوى الحساسية          |
| `apps/api/src/database/migrations/1700000000010-GranularPermissions.ts` | المخطط والبذور وروابط الدور/المستخدم                |
| `PermissionGuard` و`AuthService.userById`                               | الإنفاذ وحساب الصلاحية الفعالة                      |
| Controllers/Services                                                    | الاستخدام الفعلي لكل مفتاح                          |
| React routes/pages/layout                                               | إظهار المسارات والقوائم والأزرار                    |
| MariaDB المحلية                                                         | 56 تعريفًا، 6 أدوار، 7 مستخدمين، 0 direct overrides |

## الكتالوج الكامل

`ACTIVE` تعني أن المفتاح يُستخدم فعليًا. `UNUSED` يعني أنه موجود في الكتالوج/قاعدة البيانات بلا عملية محمية به. لا توجد مفاتيح ثبت أنها `LEGACY`؛ ولا مفاتيح `UNKNOWN`.

|   # | Permission                              | Backend use                  | Frontend use          | الحالة | ملاحظة                                      |
| --: | --------------------------------------- | ---------------------------- | --------------------- | ------ | ------------------------------------------- |
|   1 | `dashboard.view`                        | لوحة المؤشرات                | route/menu            | ACTIVE | الاستجابة تتضمن Audit لا يحميه `audit.view` |
|   2 | `legislation.view`                      | list/detail                  | route/menu            | ACTIVE | عرض إداري للمسودات والمنشور                 |
|   3 | `legislation.create`                    | `POST /legislations`         | لا يوجد زر ظاهر       | ACTIVE | API محمي، Frontend غير مكتمل                |
|   4 | `legislation.update`                    | تحديث المسودة                | زر/نموذج              | ACTIVE | خطأ OR موضح في تقرير API                    |
|   5 | `legislation.update_published_metadata` | تصحيح المنشور                | زر/نموذج              | ACTIVE | اسم غير منتظم                               |
|   6 | `legislation.submit`                    | 3 انتقالات مختلفة            | أزرار Workflow        | ACTIVE | واسع: prepare/submit/return                 |
|   7 | `legislation.approve`                   | اعتماد                       | Workflow              | ACTIVE | حساس                                        |
|   8 | `legislation.publish`                   | نشر ومسارا API               | Workflow              | ACTIVE | حرج                                         |
|   9 | `legislation.archive`                   | أرشفة                        | Workflow              | ACTIVE | لا توجد استعادة                             |
|  10 | `article.update`                        | نص وmetadata                 | نموذج المادة          | ACTIVE | يشمل move/reorder ضمن metadata              |
|  11 | `structure.manage`                      | create/update                | محرر البنية           | ACTIVE | يجب تفكيكه                                  |
|  12 | `annex.manage`                          | create/update وحالات قانونية | محرر الملاحق          | ACTIVE | يخفي خمس قدرات                              |
|  13 | `relation.manage`                       | create/update/review state   | محرر العلاقات         | ACTIVE | يخفي ثلاث قدرات                             |
|  14 | `reference.view`                        | قوائم مرجعية                 | بيانات مساعدة         | ACTIVE | مناسب                                       |
|  15 | `reference.manage`                      | create/update                | صفحة المرجع           | ACTIVE | يخفي عمليتين                                |
|  16 | `source.view`                           | list/detail/file             | route/menu            | ACTIVE | تنزيل المصدر ضمن view                       |
|  17 | `source.upload`                         | upload                       | زر/تبويب              | ACTIVE | يطلق job استخراج                            |
|  18 | `source.review`                         | review                       | زر                    | ACTIVE | Separation policy                           |
|  19 | `source.create_draft`                   | create draft                 | زر                    | ACTIVE | يقترح `source.draft.create`                 |
|  20 | `source.update`                         | metadata/status              | نموذج                 | ACTIVE | حساس                                        |
|  21 | `amendment.view`                        | candidates/list              | route/menu            | ACTIVE | candidates تستخدم create                    |
|  22 | `amendment.create`                      | create/candidates            | زر/تبويب              | ACTIVE | مناسب                                       |
|  23 | `amendment.review`                      | review                       | زر                    | ACTIVE | Separation policy                           |
|  24 | `amendment.publish`                     | apply temporal version       | زر                    | ACTIVE | حرج                                         |
|  25 | `quality.view`                          | live/stored checks           | route/menu            | ACTIVE | GET يشغّل فحوصًا قرائية                     |
|  26 | `quality.manage`                        | resolve/ignore               | زر                    | ACTIVE | الأفضل `quality.resolve`                    |
|  27 | `report.view`                           | content reports              | route/menu            | ACTIVE | ليس تقارير تحليلية                          |
|  28 | `report.manage`                         | triage/resolve/reject        | زر                    | ACTIVE | الأفضل `report.update`                      |
|  29 | `audit.view`                            | audit list                   | route/tab             | ACTIVE | السجل immutable في DB                       |
|  30 | `search.synonym.view`                   | list                         | route/menu            | ACTIVE | مناسب                                       |
|  31 | `search.synonym.manage`                 | create/delete/activate set   | أزرار                 | ACTIVE | يجب تفكيكه                                  |
|  32 | `search.reindex`                        | full rebuild بمسارين         | زر                    | ACTIVE | الأفضل `search.index.rebuild`               |
|  33 | `settings.view`                         | settings payload             | route/menu            | ACTIVE | يعرض جميع المجموعات                         |
|  34 | `settings.general.update`               | BRANDING                     | تبويب عام             | ACTIVE | مناسب ضمن النموذج الهرمي                    |
|  35 | `settings.appearance.update`            | COLORS/BACKGROUND/TYPOGRAPHY | تبويب المظهر          | ACTIVE | مناسب                                       |
|  36 | `settings.navigation.update`            | HEADER/FOOTER/navigation     | تبويب التنقل          | ACTIVE | واسع ويجمع موردين                           |
|  37 | `settings.content.update`               | TABS/public pages            | تبويب التشريع/الصفحات | ACTIVE | واسع ويجمع موردين                           |
|  38 | `settings.workflow.manage`              | policy + override users      | تبويب السياسة         | ACTIVE | يجب تفكيكه                                  |
|  39 | `user.view`                             | list/detail projection       | route/menu            | ACTIVE | detail يعيد بيانات تتجاوز view              |
|  40 | `user.create`                           | create + initial roles       | زر                    | ACTIVE | تصعيد حرج عبر `roles`                       |
|  41 | `user.update`                           | profile                      | نموذج                 | ACTIVE | مناسب                                       |
|  42 | `user.disable`                          | enable/disable               | أزرار وbulk           | ACTIVE | عمليتان متعاكستان                           |
|  43 | `user.reset_password`                   | reset                        | modal                 | ACTIVE | المورد صحيح                                 |
|  44 | `user.manage_roles`                     | replace roles                | tab                   | ACTIVE | يتداخل مع `role.assign`                     |
|  45 | `user.manage_permissions`               | direct ALLOW/DENY            | tab                   | ACTIVE | بلا authority ceiling                       |
|  46 | `user.activity.view`                    | user activity                | tab                   | ACTIVE | subresource صحيح                            |
|  47 | `user.sessions.view`                    | sessions                     | tab                   | ACTIVE | subresource صحيح                            |
|  48 | `user.sessions.revoke`                  | revoke one                   | زر                    | ACTIVE | لا يوجد admin revoke-all                    |
|  49 | `role.view`                             | list/detail                  | route/menu            | ACTIVE | detail يعيد users/audit أيضًا               |
|  50 | `role.create`                           | create                       | زر                    | ACTIVE | مناسب                                       |
|  51 | `role.update`                           | metadata + active            | نموذج                 | ACTIVE | يجمع update وactivate/deactivate            |
|  52 | `role.delete`                           | delete custom                | زر                    | ACTIVE | system roles محمية من الحذف                 |
|  53 | `role.assign`                           | لا endpoint                  | لا استخدام            | UNUSED | العملية تنفذ بـ`user.manage_roles`          |
|  54 | `role.manage_permissions`               | replace role grants          | tab                   | ACTIVE | بلا authority ceiling                       |
|  55 | `permission.view`                       | catalog                      | routes/tabs           | ACTIVE | مناسب؛ الكتالوج system-controlled           |
|  56 | `permission.manage`                     | لا CRUD                      | لا استخدام            | UNUSED | يظهر فقط في قوائم حماية lockout             |

## قدرات Workflow الخاصة

| المفتاح الحالي                                       | موضع الاستخدام                  | طبيعة القدرة                       |
| ---------------------------------------------------- | ------------------------------- | ---------------------------------- |
| `workflow:import-review-separation:override`         | مراجعة مصدر أنشأه المستخدم نفسه | استثناء سياسة، لا Permission دورية |
| `workflow:approval-separation:override`              | اعتماد تشريع عمل عليه المستخدم  | استثناء سياسة                      |
| `workflow:publication-separation:override`           | نشر تشريع عمل عليه المستخدم     | استثناء سياسة                      |
| `workflow:amendment-review-separation:override`      | مراجعة تعديل أنشأه المستخدم     | استثناء سياسة                      |
| `workflow:amendment-publication-separation:override` | نشر تعديل شارك فيه المستخدم     | استثناء سياسة                      |

## بيانات الأدوار الفعلية (دون بيانات شخصية)

| Role              | System | Users | Current permissions |
| ----------------- | -----: | ----: | ------------------: |
| `CONTENT_MANAGER` |    نعم |     2 |                  24 |
| `DATA_ENTRY`      |    نعم |     2 |                  15 |
| `LEGAL_REVIEWER`  |    نعم |     2 |                  13 |
| `READER`          |    نعم |     2 |                   0 |
| `SYSTEM_ADMIN`    |    نعم |     2 |                  30 |
| `SUPER`           | **لا** |     1 |              **56** |

وجود `SUPER` بكامل الكتالوج مع `is_system=0` نتيجة حرجة: الدور لا يستفيد من حماية الأدوار النظامية، ولا يوجد في الكود مفهوم Super Admin محمي بذاته.

## الجداول المرتبطة

- Business authorization: `users`, `roles`, `permission_definitions`.
- Join/technical: `user_roles`, `role_permissions`, `user_permission_overrides`; ليست Resources مستقلة.
- `user_permissions` اسم ملتبس: يخزن استثناءات Workflow فقط، لا direct RBAC permissions.
- `user_sessions` و`audit_logs` موارد إدارية فعلية لأن لهما عرضًا/إبطالًا أو عرضًا حساسًا.
- PK/unique constraints تمنع تكرار grant للدور أو override للمستخدم، وFKs موجودة في مخطط granular RBAC. استثناءات Workflow ليست مرتبطة بـFK إلى الكتالوج عن قصد، لكن يلزم توضيح تسميتها.

## تدقيق Schema وقاعدة البيانات

اكتُشف **49 جدولًا** في قاعدة التطوير. التقسيم المتعلق بالتفويض والوظائف هو:

| Group               | Tables                                                                                                                                                                                                                                                           | Authorization conclusion                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Access              | `users`, `roles`, `user_roles`, `permission_definitions`, `role_permissions`, `user_permission_overrides`, `user_permissions`, `user_sessions`                                                                                                                   | أول ثلاثة business identities/roles؛ جداول الربط ليست resources               |
| Legislative         | `legislations`, `legislation_versions`, `structure_nodes`, `articles`, `article_versions`, `paragraphs`, `amendments`, `amendment_operations`, `article_modifications`, `previous_text_snapshots`, `annexes`, `annex_versions`, `annex_files`, `legal_relations` | resources الخارجية هي aggregates/operations الظاهرة، لا كل version/join table |
| Reference/source    | `legislation_types`, `authorities`, `subjects`, `gazette_issues`, `source_documents`, `source_imports`, `legislation_subjects`                                                                                                                                   | type/authority/subject مجمعة تحت `reference`; source مورد مستقل               |
| Governance/workflow | `workflow_events`, `content_responsibilities`, `quality_issues`, `reports`, `audit_logs`, `verification_records`                                                                                                                                                 | audit immutable؛ responsibility دليل مستقبلي لـASSIGNED لا إنفاذ حالي         |
| Search/jobs         | `search_documents`, `search_tokens`, `search_synonym_sets`, `search_synonyms`, `job_queue`, `service_heartbeats`                                                                                                                                                 | index/jobs مشتقات أو system resources؛ trigger فقط يحتاج صلاحية               |
| Presentation        | `platform_settings`, `navigation_items`, `public_pages`, `viewer_metadata`                                                                                                                                                                                       | settings/navigation/public_page موارد ظاهرة؛ viewer metadata تقني             |
| Personal            | `favorites`, `saved_searches`, `user_notes`                                                                                                                                                                                                                      | ownership-bound self resources، لا admin RBAC                                 |

قيود RBAC المهمة:

- `permission_definitions.code` هو PK، مع indexes على `(domain_code,resource_code,action_code)` وعلى `(sensitivity,is_active)`.
- `role_permissions` له PK مركب `(role_id,permission_code)` وFKs إلى role/catalog/grantor، وindex حسب permission/scope.
- `user_permission_overrides` له PK مركب `(user_id,permission_code)` وFKs مماثلة و`effect ALLOW|DENY`.
- `user_roles` يحمل `assigned_by/assigned_at`، لكن الخادم لا يطبق authority ceiling.
- `audit_logs` محمي من UPDATE وDELETE بواسطة triggers؛ هذا يطابق عدم وجود صلاحيات تعديل/حذف.
- article-version triggers تمنع overlap وحذف النسخة المنشورة، لكنها لا تعوض مرشحات العرض العام.
- `roles` يحتوي `code/name_ar/description_ar/is_system/is_active/timestamps`، ولا يحتوي `is_protected`.
- تعريف `role.manage_permissions` يخزن `resource_code='role_permission'`، وهو مثال فعلي لخلط resource باسم join table.
