# مفاتيح Legacy المتبقية

توجد **18** permission definitions قديمة متبقية عمدًا (`is_legacy=1`). لا يعرضها الكتالوج الإداري ولا تقبلها عمليات الكتابة الجديدة. تبقى فقط لفترة dual-read/rollback:

| Legacy key                              | Canonical target(s)                                               |
| --------------------------------------- | ----------------------------------------------------------------- |
| `legislation.update_published_metadata` | `legislation.published_metadata.update`                           |
| `structure.manage`                      | `structure.create`, `structure.update`                            |
| `annex.manage`                          | `annex.create`, `annex.update`؛ العمليات العامة لا تُمنح تلقائيًا |
| `relation.manage`                       | `relation.create`, `relation.update`؛ review لا تُمنح تلقائيًا    |
| `reference.manage`                      | `reference.create`, `reference.update`                            |
| `source.create_draft`                   | `source.draft.create`                                             |
| `quality.manage`                        | `quality.resolve`                                                 |
| `report.manage`                         | `report.update`                                                   |
| `search.synonym.manage`                 | create/delete/activate canonical                                  |
| `search.reindex`                        | `search.index.rebuild`                                            |
| `settings.navigation.update`            | header/footer/navigation create+update                            |
| `settings.content.update`               | legislation-page/public-page update+publish+archive               |
| `settings.workflow.manage`              | `workflow_policy.view`, `workflow_policy.update` فقط              |
| `user.manage_roles`                     | `user.roles.manage`                                               |
| `role.assign`                           | `user.roles.manage`                                               |
| `user.manage_permissions`               | `user.permissions.manage`                                         |
| `role.manage_permissions`               | `role.permissions.manage`                                         |
| `permission.manage`                     | لا بديل؛ catalog نظامي للقراءة فقط                                |

`legislation.submit` و`user.disable` مفاتيح canonical قائمة، رغم أن الترحيل فصل منها عمليات إضافية؛ لذلك لا تُعدان ضمن الـ18 legacy-only.

قدرات workflow ذات صيغة colon القديمة لا تبقى في catalog؛ يحول الترحيل أي rows موجودة في مخزن policy إلى الأسماء الخمسة الجديدة ويحذف الاسم القديم من ذلك المخزن بعد النسخ.

## شرط الإزالة المستقبلية

لا تحذف هذه المفاتيح إلا بعد قياس صفر استعمال في كل البيئات، وترقية كل الأدوار إلى model version 2، وعدم وجود direct override قديم، ومرور release window مع نسخة احتياطية واختبار rollback مستقل. الإزالة ليست ضمن Issue التنفيذ الحالي.
