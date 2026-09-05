# تحليل أثر النموذج على الأدوار والمستخدمين

البيانات snapshot من قاعدة التطوير المحلية بقراءات فقط. لا تعرض أسماء مستخدمين أو credentials، ولم تُعدّل grants.

## الأدوار الحالية

| Role              | System | Users | Current permission count | Current permissions                                                                                                                                                      |
| ----------------- | -----: | ----: | -----------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `READER`          |    نعم |     2 |                        0 | لا RBAC admin permissions؛ self/public فقط                                                                                                                               |
| `DATA_ENTRY`      |    نعم |     2 |                       15 | dashboard، reference.view، source view/upload/draft/update، legislation view/create/update/submit، article.update، structure.manage، annex.manage، amendment view/create |
| `LEGAL_REVIEWER`  |    نعم |     2 |                       13 | dashboard، reference.view، source view/review/update، legislation view/approve/submit، relation.manage، amendment view/review، quality view/manage                       |
| `CONTENT_MANAGER` |    نعم |     2 |                       24 | content publish/archive/correction، structure/annex/relation/reference manage، amendment publish، quality/report/audit، synonym/index، settings view/content             |
| `SYSTEM_ADMIN`    |    نعم |     2 |                       30 | settings/access/user/role/permission administration، audit/quality/source/reference view، reindex/dashboard                                                              |
| `SUPER`           | **لا** |     1 |                   **56** | جميع مفاتيح الكتالوج الحالي                                                                                                                                              |

أعداد users لكل role غير قابلة للجمع للحصول على distinct total لأن المستخدم قد يحمل أكثر من دور. إجمالي المستخدمين في snapshot سبعة.

## أثر كل دور

### READER

لا أثر RBAC مباشر. يبقى public/account self-service دون منح admin permissions. لا ينبغي منحه `dashboard.view` ضمن الترحيل.

### DATA_ENTRY

- rename: `source.create_draft` → `source.draft.create`.
- `structure.manage` → create+update.
- `annex.manage` → create+update فقط؛ الدور لا يملك `legislation.publish` حاليًا، لذلك لا ينبغي منحه annex publish/replace/repeal.
- `legislation.submit` يحتاج قرارًا: المقترح الأقل توسعًا `prepare + submit`، وعدم منح `return` إلا إذا كان مدخل البيانات مخولًا بإرجاع عمل في المراجعة.
- بقية المفاتيح KEEP. الأثر المتوقع: حفظ الوظائف الحالية المقصودة مع إزالة إمكانية transition غير المقصودة إن اعتمد القرار.

### LEGAL_REVIEWER

- `legislation.submit` يحتاج قرارًا: map إلى `return` فقط بحسب فصل الواجبات، أو `submit+return` للحفاظ الحرفي على السلوك الحالي.
- `relation.manage` → create+update+review؛ الدور يملك حاليًا `legislation.approve` ولذلك يستطيع REVIEWED.
- `quality.manage` → `quality.resolve`.
- بقية المفاتيح KEEP.

### CONTENT_MANAGER

- published metadata rename.
- structure → create/update.
- annex → create/update/publish/replace/repeal؛ هذه تعكس سلطة manage + publish الحالية.
- relation → create/update فقط افتراضيًا؛ الدور لا يملك `legislation.approve` حاليًا فلا ينبغي منحه review تلقائيًا.
- reference → create/update.
- quality/report renames.
- synonym → create/delete/activate.
- reindex rename.
- settings.content → legislation-page update + public-page update/publish/archive.

### SYSTEM_ADMIN

- settings navigation/content splits وworkflow policy split.
- user.disable → enable+disable.
- `user.manage_roles` + `role.assign` → `user.roles.manage` مرة واحدة.
- user/role permission-management renames.
- `permission.manage` deprecated دون بديل؛ catalog يبقى read-only.
- لا ينبغي منحه content publishing تلقائيًا لمجرد كونه مدير نظام.
- authority ceiling/protected-role policy شرط سابق لأي migration.

### SUPER

الدور custom (`is_system=0`) مع 56/56. لا يطبق الترحيل عليه تلقائيًا. الخيارات تحتاج موافقة مالك:

1. تحويله إلى protected break-glass role مع ضوابط وجلسات خاصة.
2. إلغاؤه تدريجيًا بعد نقل الحاجة إلى SYSTEM_ADMIN/roles محددة.
3. إبقاؤه custom لكن عدم منحه تلقائيًا كل الـ74؛ مراجعة كل قدرة يدويًا.

الخيار الثالث هو أقل افتراضًا في مرحلة التصميم، لكن بقاء role غير محمي كامل السلطة خطر غير مقبول للتنفيذ النهائي.

## عدد المستخدمين المتأثرين بكل Current key

هذه الأعداد هي distinct users الذين يرثون المفتاح عبر role في snapshot؛ لا توجد direct overrides حاليًا.

| Current permission change               | Roles affected | Users affected | Migration             |
| --------------------------------------- | -------------: | -------------: | --------------------- |
| `legislation.update_published_metadata` |              2 |              3 | RENAME                |
| `legislation.submit`                    |              3 |              4 | SPLIT                 |
| `structure.manage`                      |              3 |              4 | SPLIT                 |
| `annex.manage`                          |              3 |              4 | SPLIT                 |
| `relation.manage`                       |              3 |              4 | SPLIT                 |
| `reference.manage`                      |              2 |              3 | SPLIT                 |
| `source.create_draft`                   |              2 |              3 | RENAME                |
| `quality.manage`                        |              3 |              4 | RENAME                |
| `report.manage`                         |              2 |              3 | RENAME                |
| `search.synonym.manage`                 |              2 |              3 | SPLIT                 |
| `search.reindex`                        |              3 |              4 | RENAME                |
| `settings.navigation.update`            |              2 |              3 | SPLIT                 |
| `settings.content.update`               |              3 |              4 | SPLIT                 |
| `settings.workflow.manage`              |              2 |              3 | SPLIT                 |
| `user.disable`                          |              2 |              3 | SPLIT                 |
| `user.manage_roles`                     |              2 |              3 | MERGE/RENAME          |
| `role.assign`                           |              2 |              3 | MERGE/DEPRECATE alias |
| `user.manage_permissions`               |              2 |              3 | RENAME                |
| `role.manage_permissions`               |              2 |              3 | RENAME                |
| `permission.manage`                     |              2 |              3 | DEPRECATE             |

الأعداد ليست additive؛ المستخدم نفسه يظهر في عدة صفوف. كل صف يتضمن مستخدم `SUPER` لأنه يرث جميع المفاتيح.

## قرارات mapping التي تمنع التوسع التلقائي

| Broad current grant                   | Role               | Proposed least-privilege mapping         | Requires owner approval |
| ------------------------------------- | ------------------ | ---------------------------------------- | ----------------------- |
| legislation.submit                    | DATA_ENTRY         | prepare + submit                         | نعم                     |
| legislation.submit                    | LEGAL_REVIEWER     | return (أو submit+return للتوافق الحرفي) | نعم                     |
| annex.manage                          | DATA_ENTRY         | create + update                          | نعم                     |
| annex.manage + legislation.publish    | CONTENT_MANAGER    | all five annex operations                | نعم                     |
| relation.manage + legislation.approve | LEGAL_REVIEWER     | create + update + review                 | نعم                     |
| relation.manage فقط                   | CONTENT_MANAGER    | create + update                          | نعم                     |
| settings.workflow.manage              | SYSTEM_ADMIN/SUPER | policy update + override manage          | نعم؛ override critical  |
| all 56                                | SUPER              | لا automatic all-74 mapping              | **نعم، حرج**            |

## مخاطر الترحيل

- منح كل نواتج SPLIT لكل role يوسع السلطة في حالات كان service يشترط فيها cross-permission إضافية.
- عدم dual-read قد يقطع الجلسات/الواجهة أثناء rollout.
- تعديل code PK مباشرة قد يكسر FKs.
- وجود users متعددة الأدوار يجعل أثر role منفرد غير كافٍ؛ يجب حساب effective before/after لكل user دون طباعة هوياتهم.
- policy exception rows صفر حاليًا، لكن migration يجب أن يدعم وجودها في بيئات أخرى.
