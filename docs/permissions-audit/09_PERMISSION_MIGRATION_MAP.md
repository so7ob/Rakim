# خريطة ترحيل الصلاحيات

هذه خريطة تصميم فقط؛ لم تنفذ أي rename/split/merge أو migration.

## ملخص كتالوج الـ56

| Migration type | Current rows | Proposed unique outputs |
| -------------- | -----------: | ----------------------: |
| KEEP           |           36 |                      36 |
| RENAME         |            7 |                       7 |
| SPLIT          |           10 |                      30 |
| MERGE          |            2 |                       1 |
| DEPRECATE      |            1 |                       0 |
| NEW            |            0 |                       0 |
| **Total**      |       **56** |                  **74** |

`NEW=0` لأن كل مفتاح مقترح له أصل تشغيلي حالي تحت مفتاح قائم واسع؛ نواتج SPLIT ليست اختراع features جديدة.

## الخريطة الكاملة

| Current permission                      | Proposed permission(s)                                                                                 | Type      | Reason                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------- |
| `dashboard.view`                        | same                                                                                                   | KEEP      | operation مطابق                           |
| `legislation.view`                      | same                                                                                                   | KEEP      | operation مطابق                           |
| `legislation.create`                    | same                                                                                                   | KEEP      | API فعلي                                  |
| `legislation.update`                    | same                                                                                                   | KEEP      | draft edit                                |
| `legislation.update_published_metadata` | `legislation.published_metadata.update`                                                                | RENAME    | subresource + stable action               |
| `legislation.submit`                    | `legislation.prepare`, `legislation.submit`, `legislation.return`                                      | SPLIT     | ثلاث transitions وسلطات مختلفة            |
| `legislation.approve`                   | same                                                                                                   | KEEP      | transition فعلي                           |
| `legislation.publish`                   | same                                                                                                   | KEEP      | transition فعلي                           |
| `legislation.archive`                   | same                                                                                                   | KEEP      | transition فعلي                           |
| `article.update`                        | same                                                                                                   | KEEP      | النص/metadata/move الفعلي                 |
| `structure.manage`                      | `structure.create`, `structure.update`                                                                 | SPLIT     | create/update فقط؛ لا delete              |
| `annex.manage`                          | `annex.create`, `annex.update`, `annex.publish`, `annex.replace`, `annex.repeal`                       | SPLIT     | CRUD جزئي وحالات عامة/قانونية             |
| `relation.manage`                       | `relation.create`, `relation.update`, `relation.review`                                                | SPLIT     | lifecycle فعلي                            |
| `reference.view`                        | same                                                                                                   | KEEP      | lookup view                               |
| `reference.manage`                      | `reference.create`, `reference.update`                                                                 | SPLIT     | لا delete endpoint                        |
| `source.view`                           | same                                                                                                   | KEEP      | list/detail/file                          |
| `source.upload`                         | same                                                                                                   | KEEP      | upload فعلي                               |
| `source.review`                         | same                                                                                                   | KEEP      | review فعلي                               |
| `source.create_draft`                   | `source.draft.create`                                                                                  | RENAME    | action segment أخير                       |
| `source.update`                         | same                                                                                                   | KEEP      | operation مطابق                           |
| `amendment.view`                        | same                                                                                                   | KEEP      | operation مطابق                           |
| `amendment.create`                      | same                                                                                                   | KEEP      | operation مطابق                           |
| `amendment.review`                      | same                                                                                                   | KEEP      | operation مطابق                           |
| `amendment.publish`                     | same                                                                                                   | KEEP      | apply/publish فعلي                        |
| `quality.view`                          | same                                                                                                   | KEEP      | operation مطابق                           |
| `quality.manage`                        | `quality.resolve`                                                                                      | RENAME    | resolve/ignore disposition فقط            |
| `report.view`                           | same                                                                                                   | KEEP      | content reports                           |
| `report.manage`                         | `report.update`                                                                                        | RENAME    | status update فقط                         |
| `audit.view`                            | same                                                                                                   | KEEP      | immutable read                            |
| `search.synonym.view`                   | same                                                                                                   | KEEP      | operation مطابق                           |
| `search.synonym.manage`                 | `search.synonym.create`, `search.synonym.delete`, `search.synonym_set.activate`                        | SPLIT     | ثلاث عمليات مختلفة                        |
| `search.reindex`                        | `search.index.rebuild`                                                                                 | RENAME    | rebuild كامل لا incremental reindex       |
| `settings.view`                         | same                                                                                                   | KEEP      | admin settings read                       |
| `settings.general.update`               | same                                                                                                   | KEEP      | BRANDING group                            |
| `settings.appearance.update`            | same                                                                                                   | KEEP      | appearance groups                         |
| `settings.navigation.update`            | `settings.header.update`, `settings.footer.update`, `navigation.create`, `navigation.update`           | SPLIT     | يفصل settings عن navigation records       |
| `settings.content.update`               | `settings.legislation_page.update`, `public_page.update`, `public_page.publish`, `public_page.archive` | SPLIT     | يفصل settings عن public content lifecycle |
| `settings.workflow.manage`              | `workflow_policy.update`, `workflow_policy.overrides.manage`                                           | SPLIT     | policy versus user exceptions             |
| `user.view`                             | same                                                                                                   | KEEP      | بعد تنقيح projection                      |
| `user.create`                           | same                                                                                                   | KEEP      | مع assignable-role ceiling                |
| `user.update`                           | same                                                                                                   | KEEP      | profile update                            |
| `user.disable`                          | `user.enable`, `user.disable`                                                                          | SPLIT     | عمليتان متعاكستان                         |
| `user.reset_password`                   | same                                                                                                   | KEEP      | المورد صحيح                               |
| `user.manage_roles`                     | `user.roles.manage`                                                                                    | MERGE     | canonical owner هو user subresource       |
| `user.manage_permissions`               | `user.permissions.manage`                                                                              | RENAME    | canonical subresource                     |
| `user.activity.view`                    | same                                                                                                   | KEEP      | canonical already                         |
| `user.sessions.view`                    | same                                                                                                   | KEEP      | canonical already                         |
| `user.sessions.revoke`                  | same                                                                                                   | KEEP      | لا revoke-all admin endpoint              |
| `role.view`                             | same                                                                                                   | KEEP      | بعد تنقيح projection                      |
| `role.create`                           | same                                                                                                   | KEEP      | operation مطابق                           |
| `role.update`                           | same                                                                                                   | KEEP      | metadata/active حاليًا                    |
| `role.delete`                           | same                                                                                                   | KEEP      | custom roles only                         |
| `role.assign`                           | `user.roles.manage`                                                                                    | MERGE     | غير مستخدم ومكرر دلاليًا                  |
| `role.manage_permissions`               | `role.permissions.manage`                                                                              | RENAME    | subresource وليس join table               |
| `permission.view`                       | same                                                                                                   | KEEP      | read-only catalog                         |
| `permission.manage`                     | —                                                                                                      | DEPRECATE | لا CRUD؛ catalog system-controlled        |

## استثناءات Workflow خارج الكتالوج

لا تدخل في أعداد الـ56/74، وتقترح كقدرات policy-only غير قابلة للإسناد إلى roles:

| Current code                                         | Proposed code                                    | Type   |
| ---------------------------------------------------- | ------------------------------------------------ | ------ |
| `workflow:import-review-separation:override`         | `workflow.source_import.self_review.override`    | RENAME |
| `workflow:approval-separation:override`              | `workflow.legislation.self_approval.override`    | RENAME |
| `workflow:publication-separation:override`           | `workflow.legislation.self_publication.override` | RENAME |
| `workflow:amendment-review-separation:override`      | `workflow.amendment.self_review.override`        | RENAME |
| `workflow:amendment-publication-separation:override` | `workflow.amendment.self_publication.override`   | RENAME |

إجمالي المفاتيح المحكومة بعد التصميم: **74 RBAC permissions + 5 policy exception capabilities = 79**.

## Compatibility strategy بعد الموافقة

1. Freeze inventory وربط كل endpoint/action بالمفتاح المقترح.
2. إضافة المفاتيح الجديدة دون حذف القديمة.
3. backfill role/direct grants بنهج least privilege يعتمد كل role، لا منح كل مخرجات SPLIT آليًا.
4. دعم aliases/dual-read مؤقتًا، مع كتابة الكود الجديد فقط.
5. تحديث Backend أولًا، ثم React، ثم اختبارات API/visual.
6. قياس استعمال المفاتيح القديمة وتسجيل أي caller باقٍ.
7. deprecate ثم إزالة alias في release لاحقة فقط؛ لا حذف Legacy في الترحيل الأول.
8. كل mapping للأدوار والمستخدمين يحتاج approval منفصل، خاصة `SUPER`.

لا يمكن استخدام simple string rename مع `code` كـPK دون مراعاة FKs في grant tables؛ خطة التنفيذ يجب أن تضيف/تنسخ/تحول references transactionally بدلاً من rename متعجل.
