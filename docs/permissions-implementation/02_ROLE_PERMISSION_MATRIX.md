# مصفوفة صلاحيات الأدوار النهائية

منح الأدوار العادية مطابقة لـ`CANONICAL_ROLE_PERMISSION_MAP`. وفق توجيه المالك بتاريخ 2026-09-09، يرث `SUPER` النظامي المحمي جميع صلاحيات الكتالوج الفعال وقت التشغيل؛ تبقى منح الترحيل القديم المخزنة كما هي.

| Role              | Authority | System | Protected |                             Grants |
| ----------------- | --------: | ------ | --------- | ---------------------------------: |
| `READER`          |        10 | نعم    | لا        |                                  0 |
| `DATA_ENTRY`      |       100 | نعم    | لا        |                                 18 |
| `LEGAL_REVIEWER`  |       200 | نعم    | لا        |                                 15 |
| `CONTENT_MANAGER` |       300 | نعم    | لا        |                                 36 |
| `SYSTEM_ADMIN`    |       800 | نعم    | لا        |                                 36 |
| `SUPER`           |      1000 | نعم    | نعم       | جميع الفعالة تلقائياً (116 حالياً) |

## READER

لا صلاحيات إدارية.

## DATA_ENTRY

`dashboard.view`, `reference.view`, `source.view`, `source.upload`, `source.draft.create`, `source.update`, `legislation.view`, `legislation.create`, `legislation.update`, `legislation.prepare`, `legislation.submit`, `article.update`, `structure.create`, `structure.update`, `annex.create`, `annex.update`, `amendment.view`, `amendment.create`.

## LEGAL_REVIEWER

`dashboard.view`, `reference.view`, `source.view`, `source.review`, `source.update`, `legislation.view`, `legislation.approve`, `legislation.return`, `relation.create`, `relation.update`, `relation.review`, `amendment.view`, `amendment.review`, `quality.view`, `quality.resolve`.

## CONTENT_MANAGER

`dashboard.view`, `reference.view`, `reference.create`, `reference.update`, `source.view`, `legislation.view`, `legislation.update`, `legislation.published_metadata.update`, `legislation.publish`, `legislation.archive`, `structure.create`, `structure.update`, `annex.create`, `annex.update`, `annex.publish`, `annex.replace`, `annex.repeal`, `relation.create`, `relation.update`, `amendment.view`, `amendment.publish`, `quality.view`, `quality.resolve`, `report.view`, `report.update`, `audit.view`, `search.synonym.view`, `search.synonym.create`, `search.synonym.delete`, `search.synonym_set.activate`, `search.index.rebuild`, `settings.view`, `settings.legislation_page.update`, `public_page.update`, `public_page.publish`, `public_page.archive`.

## SYSTEM_ADMIN

`dashboard.view`, `reference.view`, `source.view`, `quality.view`, `audit.view`, `search.index.rebuild`, `settings.view`, `settings.general.update`, `settings.appearance.update`, `settings.header.update`, `settings.footer.update`, `settings.legislation_page.update`, `navigation.create`, `navigation.update`, `public_page.update`, `public_page.publish`, `public_page.archive`, `workflow_policy.view`, `workflow_policy.update`, `user.view`, `user.create`, `user.update`, `user.enable`, `user.disable`, `user.reset_password`, `user.roles.manage`, `user.permissions.manage`, `user.activity.view`, `user.sessions.view`, `user.sessions.revoke`, `role.view`, `role.create`, `role.update`, `role.delete`, `role.permissions.manage`, `permission.view`.

لا يملك `workflow_policy.overrides.manage`، ولا content publishing التشريعي بحكم كونه مدير نظام.

## SUPER

يرث جميع صلاحيات RBAC الفعالة غير القديمة ذات النطاق ALL (116 حالياً)، بما فيها الصلاحيات المضافة لاحقاً. يحسب `EFFECTIVE_ROLE_GRANTS_SQL` الوراثة للمصادقة وشاشات الأدوار والمستخدمين من المصدر نفسه، دون منح تلقائي للأدوار الأخرى. يبقى المنع الفردي الصريح مقدماً وفق سياسة النظام. لا يملك تلقائيًا أيًا من قدرات workflow policy-only الخمس؛ الاستثناء يُمنح لمستخدم محدد من endpoint مستقل ويظهر في `policyCapabilities` لا `permissions`.

## الأدوار المخصصة

رُحّلت بمنهج محافظ: KEEP/RENAME/MERGE مباشرة، ونواتج SPLIT لا تُوسع إلا حيث تثبتها مفاتيح مساندة قديمة. يرفض الخادم منح role أو permission عند مستوى actor أو أعلى، كما يرفض تعديل الأدوار النظامية أو المحمية.
