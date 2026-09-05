# تدقيق Authorization في React

## البنية الحالية

`RequireAuth` يحمي account وكل `/ar/admin/*`. ثم تستخدم المسارات `RequirePermission(anyOf)`. `AuthContext.hasPermission` يفحص قائمة المفاتيح التي يعيدها `/auth/me`. `AdminLayout` يخفي عناصر القائمة، والصفحات تخفي/تعطل الأزرار. لا يوجد اعتماد فعلي على `isAdmin` أو مقارنة مثل `user.role === 'admin'` في React.

هذا دفاع UX جيد لكنه ليس حدًا أمنيًا؛ Backend هو المرجع. توجد فجوات payload لأن بعض tabs مخفية في React بينما endpoint الأساسي يعيد بياناتها أصلًا.

## Routes والقائمة

| Route                            | Component                | Route permission      | Menu permission | Status                                                                |
| -------------------------------- | ------------------------ | --------------------- | --------------- | --------------------------------------------------------------------- |
| `/ar/admin`                      | `AdminDashboardPage`     | `dashboard.view`      | same            | متطابق                                                                |
| `/ar/admin/imports[/:tab]`       | `AdminImportsPage`       | `source.view`         | same            | متطابق؛ upload tab له check إضافي                                     |
| `/ar/admin/content[/:id/:tab]`   | content pages            | `legislation.view`    | same            | متطابق                                                                |
| `/ar/admin/amendments[/:tab]`    | `AdminAmendmentsPage`    | `amendment.view`      | same            | متطابق؛ create tab يحتاج create                                       |
| `/ar/admin/audit`                | `AdminAuditPage`         | `audit.view`          | same            | متطابق                                                                |
| `/ar/admin/reports`              | `AdminReportsPage`       | `report.view`         | same            | متطابق                                                                |
| `/ar/admin/users`                | `AdminUsersPage`         | `user.view`           | same            | متطابق                                                                |
| `/ar/admin/users/:id/:tab`       | `AdminUserDetailPage`    | `user.view`           | parent          | **Backend projection أوسع من tab checks**                             |
| `/ar/admin/roles`                | `AdminRolesPage`         | `role.view`           | same            | متطابق                                                                |
| `/ar/admin/roles/:id/:tab`       | `AdminRoleDetailPage`    | `role.view`           | parent          | **Backend projection أوسع من tab checks**                             |
| `/ar/admin/permissions/:tab`     | `AdminPermissionsPage`   | `permission.view`     | same            | متطابق                                                                |
| `/ar/admin/synonyms`             | `AdminSynonymsPage`      | `search.synonym.view` | same            | متطابق                                                                |
| `/ar/admin/quality`              | `AdminQualityPage`       | `quality.view`        | same            | متطابق                                                                |
| `/ar/admin/settings/:tab`        | `AdminSettingsPage`      | `settings.view`       | most tabs same  | workflow menu يحتاج manage لكن URL route يحتاج view فقط؛ editor يخفيه |
| `/ar/admin/reference-data/:kind` | `AdminReferenceDataPage` | `reference.manage`    | same            | view-only catalog path غير منفصل                                      |
| `/ar/account`                    | `AccountPage`            | authentication        | n/a             | ownership boundary، صحيح                                              |

جميع المسارات العامة تحت `/ar` لا تستخدم RBAC؛ وهي تعتمد على API العام المرشح للنشر. صفحة forgot-password واجهة فقط ولا تستدعي endpoint لاستعادة كلمة المرور.

## الأزرار والنماذج والإجراءات

| Location                   | UI action                       | Current UI check                                     | Backend check                                        | Finding                                              |
| -------------------------- | ------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| Imports                    | upload tab/submit               | `source.upload`                                      | same                                                 | صحيح                                                 |
| Imports                    | review                          | `source.review`                                      | same + separation policy                             | صحيح                                                 |
| Imports                    | create draft                    | `source.create_draft`                                | same                                                 | صحيح، rename فقط                                     |
| Content detail             | edit draft                      | `legislation.update`                                 | OR decorator                                         | **Backend أوسع**                                     |
| Content detail             | edit published metadata         | `legislation.update_published_metadata`              | state check                                          | صحيح للمنشور                                         |
| Content detail             | workflow buttons                | available transitions from API                       | exact service permission                             | صحيح، لكن submit key واسع                            |
| Content detail             | article text/metadata/move      | `article.update`                                     | same                                                 | صحيح                                                 |
| Content detail             | structure create/edit           | `structure.manage`                                   | same                                                 | متطابق لكنه over-broad                               |
| Content detail             | annex create/edit/status        | `annex.manage`                                       | manage + conditional legislation.publish             | UI لا يعكس المفتاح الإضافي بوضوح                     |
| Content detail             | relation create/edit/review     | `relation.manage`                                    | manage + conditional legislation.approve             | UI لا يعكس المفتاح الإضافي بوضوح                     |
| Content detail             | source edit                     | `source.update`                                      | same                                                 | صحيح                                                 |
| Amendments                 | create                          | `amendment.create`                                   | same                                                 | صحيح                                                 |
| Amendments                 | review                          | `amendment.review`                                   | same + policy                                        | صحيح                                                 |
| Amendments                 | publish                         | `amendment.publish`                                  | same + policy                                        | صحيح                                                 |
| Users                      | create                          | `user.create`                                        | same only                                            | **Critical:** form roles enable escalation           |
| Users                      | bulk activate/deactivate        | `user.disable`                                       | same                                                 | same key for opposite operations                     |
| User detail                | roles tab/save                  | view=`role.view`; edit=`user.manage_roles`           | detail payload under `user.view`; write manage_roles | read projection gap + escalation                     |
| User detail                | permissions/effective tabs      | `permission.view`                                    | detail payload under `user.view`                     | read projection gap                                  |
| User detail                | direct overrides save           | `user.manage_permissions`                            | same                                                 | self/peer escalation possible                        |
| User detail                | activity tab                    | `user.activity.view`                                 | separate endpoint same                               | base detail already includes recent activity summary |
| User detail                | sessions/revoke                 | `user.sessions.view/revoke`                          | same endpoints                                       | صحيح للعمليات التفصيلية                              |
| User detail                | profile/state/reset             | `user.update`, `user.disable`, `user.reset_password` | same                                                 | صحيح عدا granularity enable                          |
| Roles                      | create                          | `role.create`                                        | same                                                 | صحيح                                                 |
| Role detail                | metadata/active                 | `role.update`                                        | same                                                 | system role UI disables active، server checks it     |
| Role detail                | delete                          | `role.delete`, hidden for system                     | same + server system check                           | صحيح                                                 |
| Role detail                | permissions                     | `role.manage_permissions`                            | same                                                 | escalation ceiling absent                            |
| Role detail                | users/audit tabs                | `user.view`/`audit.view`                             | base role response under `role.view`                 | **projection gap**                                   |
| Synonyms                   | add/delete/activate             | `search.synonym.manage`                              | same                                                 | over-broad                                           |
| Quality                    | resolve/ignore                  | `quality.manage`                                     | same                                                 | rename to actual action                              |
| Reports                    | triage/resolve/reject           | `report.manage`                                      | same                                                 | rename to update                                     |
| Settings/general           | save                            | `settings.general.update`                            | group mapping                                        | صحيح                                                 |
| Settings/appearance        | save                            | `settings.appearance.update`                         | group mapping                                        | صحيح                                                 |
| Settings/navigation        | header/footer/nav create/update | `settings.navigation.update`                         | same                                                 | over-broad/mixed resource                            |
| Settings/legislation/pages | tabs/public page status         | `settings.content.update`                            | same                                                 | over-broad/mixed resource                            |
| Settings/workflow          | policy + user exceptions        | `settings.workflow.manage`                           | same                                                 | split read/update/override management                |
| Dashboard                  | view cards/recent audit         | `dashboard.view`                                     | same                                                 | recent audit leaks audit data                        |

## Bulk operations

المكتشف فقط هو bulk enable/disable للمستخدمين في الواجهة، ويستدعي العملية الفردية لكل مستخدم ويستخدم `user.disable`. لا حاجة إلى bulk permission مستقلة؛ الخطر ناتج عن authority ceiling وlast-admin invariant ويجب فحص كل عنصر server-side داخل عملية batch إن أضيف endpoint جماعي لاحقًا. لم يثبت وجود bulk publish/archive/delete/export إداري.

## مواضع Authorization

- Routes: `apps/web/src/App.tsx`.
- Authentication: `apps/web/src/auth/AuthContext.tsx`, `RequireAuth.tsx`.
- Permission guard: `apps/web/src/auth/RequirePermission.tsx`.
- Menu: `apps/web/src/components/AdminLayout.tsx`.
- Action checks: صفحات `AdminContentDetail`, `AdminImports`, `AdminAmendments`, `AdminUsers`, `AdminUserDetail`, `AdminRoles`, `AdminRoleDetail`, `AdminSynonyms`, `AdminQuality`, `AdminReports`, `AdminSettings`.

## ملاحظات UX/اتساق

1. `/admin/settings` و`/admin/permissions` redirects لا تحمل guard بذاتها، لكن target guarded؛ لا تجاوز.
2. route الخاص بالـworkflow يمر بـ`settings.view`، والقائمة تخفيه دون `settings.workflow.manage`، والصفحة تخفي المحرر. Backend write محمي؛ ليس تجاوزًا لكنه وصول غير متناسق.
3. `DownloadPage` يستدعي annex metadata دون تحديد `GET` بينما helper default هو `POST`؛ التدفق يفشل وظيفيًا، وليس Authorization bypass.
4. لا ينبغي إصلاح أي مما سبق في هذه المرحلة؛ المطلوب أولًا اعتماد المصفوفة.
