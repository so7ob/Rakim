# جرد عمليات النظام

## منهج العد

اكتُشفت **125 عملية قابلة للتنفيذ**: 105 عمليات REST موثقة أدناه، و15 فرع عمل مستقل داخل endpoints مركبة، و5 أعمال خلفية/نظامية. لا يعني العدد أن كل عملية تحتاج Permission مستقلة؛ العمليات العامة والذاتية والأعمال النظامية مستثناة حيث يوجد حد ثقة مناسب.

توزيع REST: **24 عامة عمدًا، 13 موثقة بالجلسة ومقيدة بملكية المستخدم، 68 محمية بصلاحية Backend**. لا توجد عملية كتابة إدارية تفتقد authentication/permission decorator بالكامل، لكن توجد صلاحيات خاطئة أو واسعة وفجوات projection موثقة في التقارير التالية.

## العمليات العامة (24)

| Method | Endpoint                             | Operation            | Database/side effect | Authorization decision                                 |
| ------ | ------------------------------------ | -------------------- | -------------------- | ------------------------------------------------------ |
| GET    | `/health`                            | health check         | قراءة اتصال          | Public intentionally                                   |
| POST   | `/auth/login`                        | تسجيل الدخول         | session + audit      | Public entry point، rate limit مطلوب تشغيليًا          |
| GET    | `/auth/status`                       | حالة الدخول/CSRF     | تدوير CSRF           | Public intentionally                                   |
| GET    | `/site/config`                       | إعدادات العرض العامة | settings read        | Public intentionally                                   |
| GET    | `/site/pages`                        | صفحة منشورة          | public_pages read    | Public intentionally                                   |
| GET    | `/search`                            | بحث                  | derived index read   | Public intentionally                                   |
| GET    | `/search/analytics`                  | facets/counts        | derived index read   | Public intentionally                                   |
| GET    | `/search/export.csv`                 | تصدير نتائج عامة     | stream               | Public intentionally؛ نفس مرشح النشر مطلوب             |
| GET    | `/legislations`                      | قائمة منشورة         | legislation read     | Public intentionally                                   |
| GET    | `/legislations/suggestions`          | اقتراحات             | search/read          | Public intentionally                                   |
| GET    | `/legislations/latest-modifications` | آخر التعديلات        | read                 | Public intentionally                                   |
| GET    | `/legislations/:id/source`           | بيانات المصدر العامة | read                 | Public intentionally؛ لا يعيد الملف الأصلي             |
| GET    | `/legislations/:id`                  | تفاصيل منشورة        | read                 | Public intentionally                                   |
| GET    | `/legislations/:id/structure`        | بنية المنشور         | read                 | Public intentionally                                   |
| GET    | `/legislations/:id/articles`         | مواد المنشور         | read                 | Public intentionally                                   |
| GET    | `/legislations/:id/modifications`    | تعديلات منشورة       | read                 | Public intentionally                                   |
| GET    | `/legislations/:id/annexes`          | ملاحق التشريع        | read                 | Public intentionally؛ يلزم status filter للملاحق       |
| GET    | `/legislations/:id/relations`        | علاقات التشريع       | read                 | Public intentionally؛ يلزم review/public target filter |
| GET    | `/articles/:id`                      | مادة منشورة          | read                 | Public intentionally                                   |
| GET    | `/articles/:id/at`                   | مادة عند تاريخ       | temporal read        | Public intentionally                                   |
| GET    | `/articles/:id/versions`             | نسخ المادة           | temporal read        | **فجوة:** لا يتحقق من نشر التشريع                      |
| GET    | `/articles/:id/previous-texts`       | النصوص السابقة       | temporal read        | **فجوة:** لا يتحقق من نشر التشريع                      |
| GET    | `/annexes/:id`                       | بيانات ملحق          | read                 | parent public check؛ annex status غير مفحوص            |
| GET    | `/annexes/:id/file`                  | تنزيل ملف ملحق       | stream               | parent public check؛ annex status غير مفحوص            |

## العمليات الذاتية الموثقة بالجلسة (13)

| Method | Endpoint                 | Operation                        | Boundary          | Permission decision |
| ------ | ------------------------ | -------------------------------- | ----------------- | ------------------- |
| GET    | `/auth/me`               | الهوية والصلاحيات الفعالة        | session user      | لا RBAC؛ صحيح       |
| POST   | `/auth/logout`           | إبطال الجلسة الحالية             | current session   | لا RBAC؛ صحيح       |
| POST   | `/auth/change-password`  | تغيير كلمة المرور وإبطال الجلسات | current user      | لا RBAC؛ صحيح       |
| GET    | `/me/favorites`          | قائمة المفضلة                    | `request.user.id` | ownership، صحيح     |
| POST   | `/me/favorites/:id`      | إضافة مفضلة                      | current user      | ownership، صحيح     |
| DELETE | `/me/favorites/:id`      | حذف مفضلة                        | current user      | ownership، صحيح     |
| GET    | `/me/saved-searches`     | قائمة محفوظة                     | current user      | ownership، صحيح     |
| POST   | `/me/saved-searches`     | حفظ بحث                          | current user      | ownership، صحيح     |
| DELETE | `/me/saved-searches/:id` | حذف بحث                          | current user      | ownership، صحيح     |
| GET    | `/me/notes`              | الملاحظات                        | current user      | ownership، صحيح     |
| POST   | `/me/notes`              | إنشاء ملاحظة                     | current user      | ownership، صحيح     |
| DELETE | `/me/notes/:id`          | حذف ملاحظة                       | current user      | ownership، صحيح     |
| POST   | `/me/reports`            | بلاغ محتوى                       | current user      | self-service، صحيح  |

## العمليات المحمية بصلاحية (68)

| Area                           | Endpoints | Operations                                                                                                          | Current permission(s)                             |
| ------------------------------ | --------: | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Create legislation             |         1 | `POST /legislations`                                                                                                | `legislation.create`                              |
| Imports/sources                |         6 | upload، list، detail، file، review، create draft                                                                    | `source.upload/view/review/create_draft`          |
| Amendments                     |         5 | candidates، list، create، review، publish                                                                           | `amendment.create/view/review/publish`            |
| Site admin                     |         5 | settings update، navigation create/update، public page update، admin settings read                                  | `settings.*`                                      |
| Admin content                  |        19 | dashboard، references، legislation list/detail/update/workflow، articles، source، structure، annex، relation، audit | الموارد الحالية ذات الصلة                         |
| Users/workflow                 |         8 | users/roles summaries، workflow policy read/update، create/state/roles/reset                                        | `user.*`, `role.view`, `settings.workflow.manage` |
| Synonyms/quality/reports/index |         9 | synonym CRUD/activate، quality، reports، reindex                                                                    | `search.*`, `quality.*`, `report.*`               |
| Duplicate publication/index    |         2 | `POST /publications`, `POST /reindex`                                                                               | `legislation.publish`, `search.reindex`           |
| Access control                 |        13 | catalog، roles CRUD/grants، user profile/overrides/activity/sessions                                                | `permission.view`, `role.*`, `user.*`             |
| **Total**                      |    **68** |                                                                                                                     |                                                   |

### قائمة endpoints المحمية

| Method | Endpoint                                      | Operation                               | Permission                                          |
| ------ | --------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| POST   | `/legislations`                               | create draft                            | `legislation.create`                                |
| POST   | `/imports`                                    | upload source                           | `source.upload`                                     |
| GET    | `/imports`                                    | list sources                            | `source.view`                                       |
| GET    | `/imports/:id`                                | source detail                           | `source.view`                                       |
| GET    | `/imports/:id/source`                         | original source file                    | `source.view`                                       |
| POST   | `/imports/:id/review`                         | review extraction                       | `source.review`                                     |
| POST   | `/imports/:id/draft`                          | convert to draft                        | `source.create_draft`                               |
| GET    | `/admin/amendments/candidates`                | create candidates                       | `amendment.create`                                  |
| GET    | `/admin/amendments`                           | list                                    | `amendment.view`                                    |
| POST   | `/admin/amendments`                           | create                                  | `amendment.create`                                  |
| POST   | `/admin/amendments/:id/review`                | review                                  | `amendment.review`                                  |
| POST   | `/admin/amendments/:id/publish`               | apply/publish                           | `amendment.publish`                                 |
| GET    | `/site`                                       | admin settings/pages/navigation         | `settings.view`                                     |
| PATCH  | `/site/settings`                              | update setting groups                   | one of `settings.*` selected by group               |
| POST   | `/site/navigation`                            | create item                             | `settings.navigation.update`                        |
| PATCH  | `/site/navigation/:id`                        | update/reorder/hide                     | `settings.navigation.update`                        |
| PATCH  | `/site/pages/:id`                             | update/status page                      | `settings.content.update`                           |
| GET    | `/admin/dashboard`                            | dashboard                               | `dashboard.view`                                    |
| GET    | `/admin/references`                           | reference lookup                        | `reference.view`                                    |
| GET    | `/admin/reference-data`                       | manage list                             | `reference.manage`                                  |
| POST   | `/admin/reference-data/:kind`                 | create                                  | `reference.manage`                                  |
| PATCH  | `/admin/reference-data/:kind/:id`             | update/activate                         | `reference.manage`                                  |
| GET    | `/admin/legislations`                         | list all statuses                       | `legislation.view`                                  |
| GET    | `/admin/legislations/:id`                     | full detail                             | `legislation.view`                                  |
| PATCH  | `/admin/legislations/:id`                     | update metadata                         | `legislation.update` OR `update_published_metadata` |
| POST   | `/admin/legislations/:id/workflow`            | transition                              | exact transition checked in service                 |
| PATCH  | `/admin/articles/:id`                         | text update                             | `article.update`                                    |
| PATCH  | `/admin/articles/:id/metadata`                | text/label/move/reorder                 | `article.update`                                    |
| PATCH  | `/admin/sources/:id`                          | update source                           | `source.update`                                     |
| PATCH  | `/admin/structure/:id`                        | update/move/reorder                     | `structure.manage`                                  |
| POST   | `/admin/legislations/:id/structure`           | create node                             | `structure.manage`                                  |
| PATCH  | `/admin/annexes/:id`                          | update/status                           | `annex.manage` (+publish for non-draft in service)  |
| POST   | `/admin/legislations/:id/annexes`             | create/status                           | `annex.manage` (+publish for non-draft)             |
| PATCH  | `/admin/relations/:id`                        | update/review state                     | `relation.manage` (+approve for reviewed)           |
| POST   | `/admin/legislations/:id/relations`           | create/review state                     | `relation.manage` (+approve for reviewed)           |
| GET    | `/admin/audit`                                | audit list                              | `audit.view`                                        |
| GET    | `/admin/users`                                | users                                   | `user.view`                                         |
| GET    | `/admin/roles`                                | roles summary                           | `role.view`                                         |
| GET    | `/admin/workflow-policies`                    | policies/overrides                      | `settings.workflow.manage`                          |
| PATCH  | `/admin/workflow-policies/:code`              | policy + exceptions                     | `settings.workflow.manage`                          |
| POST   | `/admin/users`                                | create with roles                       | `user.create`                                       |
| PATCH  | `/admin/users/:id/state`                      | enable/disable                          | `user.disable`                                      |
| PATCH  | `/admin/users/:id/roles`                      | replace roles                           | `user.manage_roles`                                 |
| POST   | `/admin/users/:id/reset-password`             | reset                                   | `user.reset_password`                               |
| GET    | `/admin/synonyms`                             | list                                    | `search.synonym.view`                               |
| POST   | `/admin/synonyms`                             | create                                  | `search.synonym.manage`                             |
| POST   | `/admin/synonym-sets/:id/activate`            | activate set                            | `search.synonym.manage`                             |
| DELETE | `/admin/synonyms/:id`                         | delete                                  | `search.synonym.manage`                             |
| GET    | `/admin/quality`                              | run/read checks                         | `quality.view`                                      |
| PATCH  | `/admin/quality/:id`                          | resolve/ignore                          | `quality.manage`                                    |
| GET    | `/admin/reports`                              | list content reports                    | `report.view`                                       |
| PATCH  | `/admin/reports/:id`                          | triage/resolve/reject                   | `report.manage`                                     |
| POST   | `/admin/reindex`                              | rebuild index                           | `search.reindex`                                    |
| POST   | `/publications`                               | publish                                 | `legislation.publish`                               |
| POST   | `/reindex`                                    | rebuild index                           | `search.reindex`                                    |
| GET    | `/admin/permissions`                          | permission catalog                      | `permission.view`                                   |
| GET    | `/admin/access-roles`                         | roles                                   | `role.view`                                         |
| POST   | `/admin/access-roles`                         | create role                             | `role.create`                                       |
| GET    | `/admin/access-roles/:id`                     | role + users + audit                    | `role.view`                                         |
| PATCH  | `/admin/access-roles/:id`                     | metadata/active                         | `role.update`                                       |
| PATCH  | `/admin/access-roles/:id/permissions`         | replace grants                          | `role.manage_permissions`                           |
| DELETE | `/admin/access-roles/:id`                     | delete custom                           | `role.delete`                                       |
| GET    | `/admin/users/:id/access`                     | profile/access/session/activity summary | `user.view`                                         |
| PATCH  | `/admin/users/:id/profile`                    | display name                            | `user.update`                                       |
| PATCH  | `/admin/users/:id/granular-permissions`       | direct allow/deny                       | `user.manage_permissions`                           |
| GET    | `/admin/users/:id/activity`                   | activity                                | `user.activity.view`                                |
| GET    | `/admin/users/:id/sessions`                   | sessions                                | `user.sessions.view`                                |
| POST   | `/admin/users/:id/sessions/:sessionId/revoke` | revoke one                              | `user.sessions.revoke`                              |

## الفروع المركبة الإضافية (15)

هذه عمليات مميزة من ناحية القرار الأمني رغم مشاركتها endpoint:

1. INBOX → DRAFT (prepare).
2. DRAFT → IN_REVIEW (submit).
3. IN_REVIEW → DRAFT (return).
4. IN_REVIEW → APPROVED_FOR_PUBLISHING (approve).
5. APPROVED_FOR_PUBLISHING → PUBLISHED (publish).
6. حالة منشورة/معدلة/ملغاة/موقوفة → ARCHIVED.
7. enable user.
8. disable user.
9. create annex as DRAFT.
10. publish annex.
11. replace annex.
12. legally repeal annex.
13. mark relation REVIEWED.
14. mark relation REJECTED.
15. publish/archive public page through the shared update endpoint.

## الأعمال الخلفية/النظامية (5)

| Operation                       | Trigger           | Authorization conclusion                  |
| ------------------------------- | ----------------- | ----------------------------------------- |
| `IMPORT_SOURCE`                 | رفع مصدر محمي     | job system identity؛ لا Permission مستقلة |
| `OCR_SOURCE`                    | pipeline المصدر   | job system identity                       |
| `REINDEX_ENTITY`                | تغييرات/نشر محتوى | مشتق من عملية المستخدم الأصلية            |
| Full index rebuild              | endpoint محمي     | يحتاج `search.index.rebuild`              |
| Session expiry/cleanup behavior | session layer     | عملية نظامية؛ لا Permission مستخدم        |

## عمليات بحث عنها ولم تثبت في النظام

لا توجد حاليًا endpoints لـ: حذف/استعادة/استنساخ تشريع، unpublish، restore version، إنشاء/حذف مادة مستقل، حذف/استعادة تعديل، تعديل amendment بعد الإنشاء، admin revoke-all sessions، report export/schedule/generate، audit export، annex file replacement/upload، أو role clone. لذلك لم تُنشأ لها Permissions مقترحة.
