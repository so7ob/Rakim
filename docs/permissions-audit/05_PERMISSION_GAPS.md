# فجوات الصلاحيات والأمن

## ملخص العد

| Metric                                                           | Count |
| ---------------------------------------------------------------- | ----: |
| عمليات مهمة بلا Permission مخصصة (مغطاة حاليًا بمفتاح واسع/خاطئ) |    31 |
| Admin writes بلا Backend permission أصلًا                        |     0 |
| Current permissions غير مستخدمة                                  |     2 |
| Critical findings                                                |     8 |
| High findings                                                    |    10 |
| Medium findings                                                  |     8 |
| Low findings                                                     |     4 |

## العمليات الـ31 غير المغطاة بمفتاح دقيق

|   # | Operation                      | Current coverage               | Proposed permission                | Risk/reason                |
| --: | ------------------------------ | ------------------------------ | ---------------------------------- | -------------------------- |
|   1 | prepare inbox as draft         | `legislation.submit`           | `legislation.prepare`              | فصل الإدخال عن الإرسال     |
|   2 | return review to draft         | `legislation.submit`           | `legislation.return`               | سلطة المراجع مختلفة        |
|   3 | create structure node          | `structure.manage`             | `structure.create`                 | Granularity                |
|   4 | update/move/reorder structure  | `structure.manage`             | `structure.update`                 | Granularity                |
|   5 | create annex                   | `annex.manage`                 | `annex.create`                     | Granularity                |
|   6 | update annex metadata          | `annex.manage`                 | `annex.update`                     | Granularity                |
|   7 | publish annex                  | manage + `legislation.publish` | `annex.publish`                    | legal/public effect        |
|   8 | replace annex                  | manage + `legislation.publish` | `annex.replace`                    | distinct legal state       |
|   9 | repeal annex                   | manage + `legislation.publish` | `annex.repeal`                     | legal repeal ≠ unpublish   |
|  10 | create relation                | `relation.manage`              | `relation.create`                  | Granularity                |
|  11 | update relation                | `relation.manage`              | `relation.update`                  | Granularity                |
|  12 | review/reject relation         | manage + `legislation.approve` | `relation.review`                  | wrong resource key         |
|  13 | create reference item          | `reference.manage`             | `reference.create`                 | Granularity                |
|  14 | update/activate reference item | `reference.manage`             | `reference.update`                 | no delete exists           |
|  15 | create synonym                 | `search.synonym.manage`        | `search.synonym.create`            | Granularity                |
|  16 | delete synonym                 | `search.synonym.manage`        | `search.synonym.delete`            | destructive                |
|  17 | activate synonym set           | `search.synonym.manage`        | `search.synonym_set.activate`      | set-wide effect            |
|  18 | update header settings         | `settings.navigation.update`   | `settings.header.update`           | setting group boundary     |
|  19 | update footer settings         | `settings.navigation.update`   | `settings.footer.update`           | setting group boundary     |
|  20 | create navigation item         | `settings.navigation.update`   | `navigation.create`                | business resource          |
|  21 | update/hide/reorder navigation | `settings.navigation.update`   | `navigation.update`                | business resource          |
|  22 | update legislation page tabs   | `settings.content.update`      | `settings.legislation_page.update` | setting group boundary     |
|  23 | update public page content     | `settings.content.update`      | `public_page.update`               | resource boundary          |
|  24 | publish public page            | `settings.content.update`      | `public_page.publish`              | public effect              |
|  25 | archive public page            | `settings.content.update`      | `public_page.archive`              | public effect              |
|  26 | update workflow policy         | `settings.workflow.manage`     | `workflow_policy.update`           | policy resource            |
|  27 | manage policy exceptions       | `settings.workflow.manage`     | `workflow_policy.overrides.manage` | privilege-sensitive        |
|  28 | enable user                    | `user.disable`                 | `user.enable`                      | opposite action            |
|  29 | disable user                   | `user.disable`                 | `user.disable`                     | keep semantics after split |
|  30 | resolve/ignore quality issue   | `quality.manage`               | `quality.resolve`                  | actual action              |
|  31 | triage/resolve/reject report   | `report.manage`                | `report.update`                    | actual action              |

## سجل المخاطر

### Critical (8)

| ID  | Finding                                                         | Evidence/impact                                                          |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| C1  | إنشاء مستخدم يسمح بإسناد أي role بواسطة `user.create` فقط       | attacker ينشئ حسابًا بـSYSTEM_ADMIN/SUPER                                |
| C2  | `user.manage_roles` بلا authority ceiling أو no-self-escalation | إسناد role أعلى للنفس/الغير                                              |
| C3  | `role.manage_permissions` بلا ceiling                           | إضافة أي critical key إلى دور يملكه الفاعل                               |
| C4  | `user.manage_permissions` بلا ceiling                           | direct ALLOW لأي key؛ حماية self-DENY المحدودة لا تمنع grant             |
| C5  | حماية آخر مدير غير مكتملة وغير متسقة                            | قوائم المفاتيح الحرجة تختلف، ويمكن إضعاف system role                     |
| C6  | دور `SUPER` الفعلي يحمل 56/56 لكنه `is_system=0`                | قابل للتعديل/الحذف وفق قواعد custom role، ولا يوجد Super Admin invariant |
| C7  | article versions/previous-texts عامة بلا تحقق نشر parent        | كشف نصوص draft/history بمعرفة article id                                 |
| C8  | annex detail/file عامة ولا تتحقق من annex status                | كشف DRAFT/REPLACED/REPEALED file تحت تشريع منشور                         |

### High (10)

| ID  | Finding                                                                         | Evidence/impact                                                      |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| H1  | relations العامة لا ترشح `review_status` أو نشر target                          | كشف علاقة غير مدققة أو عنوان draft target                            |
| H2  | dashboard يعيد `recentAudit` تحت `dashboard.view`                               | تجاوز `audit.view` وأسماء/أفعال حساسة                                |
| H3  | role detail يعيد users و50 audit records تحت `role.view`                        | UI tabs لا تمنع direct API access                                    |
| H4  | user access detail يعيد roles/direct/effective/session/activity تحت `user.view` | تجاوز مفاتيح subresources                                            |
| H5  | legislation update decorator يستخدم OR                                          | حامل published-metadata key يعدل draft                               |
| H6  | `/site/settings` يقبل WORKFLOW                                                  | مسار بديل خارج تبويب policy وقد لا يزامن exceptions                  |
| H7  | annex legal statuses تستخدم `legislation.publish`                               | cross-resource overgrant                                             |
| H8  | relation review يستخدم `legislation.approve`                                    | cross-resource overgrant                                             |
| H9  | admin legislation detail يعيد source metadata تحت `legislation.view`            | تجاوز `source.view` بحسب حساسية الحقول                               |
| H10 | الفهرسة تبني مستندات من versions لتشريع منشور دون برهان status لكل version      | احتمال كشف نسخة غير منشورة عبر البحث/التصدير؛ يلزم اختبار regression |

### Medium (8)

| ID  | Finding                                                                                   | Impact                                               |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| M1  | `@Roles` متجاوز عند وجود `@Permissions`                                                   | annotations و`requiredRole` قد توحيان بقيد غير موجود |
| M2  | Scopes مخزنة ومعادة للواجهة ولا يفرضها guard/query                                        | خطر مستقبلي عند تمكين OWN/ASSIGNED                   |
| M3  | دمج scope من عدة roles يحتفظ بأول قيمة بدل strongest-defined rule                         | نتائج تعتمد ترتيب query إذا توسعت scopes             |
| M4  | `permission.manage`, `role.manage_permissions`, `user.manage_permissions` متداخلة دلاليًا | التباس وحدود ملكية غير واضحة                         |
| M5  | `role.assign` يتداخل مع `user.manage_roles` وهو غير مستخدم                                | permission وهمية                                     |
| M6  | `settings.view` يعرض كل groups                                                            | قد يكشف إعدادات تكامل/أمن إذا أضيفت مستقبلًا         |
| M7  | قراءة workflow policy تتطلب manage ولا يوجد view                                          | Least privilege غير ممكن                             |
| M8  | duplicate publish/reindex endpoints                                                       | اتساق logging/testing والسياسات أصعب                 |

### Low (4)

| ID  | Finding                                                                   | Impact                                                |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| L1  | DownloadPage يرسل default POST لقراءة annex metadata                      | خلل وظيفي، لا bypass                                  |
| L2  | GET auth/status يدور CSRF وSessionGuard يحدث last_seen                    | GET له side effects تشغيلية                           |
| L3  | `legislation.create` لا يظهر له إجراء React مباشر                         | capability API-only؛ يحتاج قرار UX لا تغيير أمني فوري |
| L4  | سبب audit لبعض عمليات create/delete مشتق/ثابت لا يطلب تفسيرًا من المستخدم | جودة audit غير متجانسة                                |

## `manage` بالتفصيل

| Current permission         | ما تعنيه فعليًا                                   | القرار                                                         |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| `structure.manage`         | create + update + move + reorder                  | **SPLIT** إلى create/update؛ move/reorder جزء من update حاليًا |
| `annex.manage`             | create + update + publish + replace + repeal      | **SPLIT**؛ الحالات ذات الأثر العام/القانوني حرجة               |
| `relation.manage`          | create + update + review/reject                   | **SPLIT**                                                      |
| `reference.manage`         | create + update + enable/disable                  | **SPLIT**؛ لا delete فعلي                                      |
| `quality.manage`           | resolve + ignore                                  | **RENAME** إلى resolve؛ كلاهما disposition لنفس issue          |
| `report.manage`            | triage + resolve + reject                         | **RENAME** إلى update؛ لا generate/configure/export            |
| `search.synonym.manage`    | create + delete + set activation                  | **SPLIT**                                                      |
| `settings.workflow.manage` | read + update policy + add/remove exception users | **SPLIT**                                                      |
| `user.manage_roles`        | replace all role assignments                      | **MERGE/RENAME** إلى `user.roles.manage`                       |
| `user.manage_permissions`  | replace direct ALLOW/DENY                         | **RENAME**؛ يبقى حساسًا مع ceiling                             |
| `role.manage_permissions`  | replace role grants                               | **RENAME**؛ يبقى حرجًا مع ceiling                              |
| `permission.manage`        | لا عملية                                          | **DEPRECATE**؛ catalog system-controlled                       |

## التداخل وResource/Table confusion

- `role_permissions` join table، وليس `role_permission` resource. العملية الصحيحة `role.permissions.manage`.
- `user_roles` join table؛ الإسناد الصحيح `user.roles.manage` لا `role.assign` بالتوازي.
- `user_permission_overrides` join/override store؛ العملية `user.permissions.manage`.
- `user_permissions` الحالية جدول استثناء سياسة لا Direct RBAC؛ يقترح تغيير اسمه مستقبلاً لتجنب الالتباس، دون تنفيذ الآن.
- `permission.manage` لا يدير كتالوجًا وظيفيًا؛ المفاتيح code-controlled. إنشاء key عشوائي في DB لا يضيف guard أو feature.

## Naming convention

المقترح: `<resource>[.<subresource>].<action>`؛ resource مفرد، والفعل هو الجزء الأخير، و`snake_case` داخل المصطلح المركب فقط.

`settings.appearance_update` أبسط لمحلل ذي مستويين، لكنه يضخم قاموس الأفعال ويخفي أن appearance subresource. `settings.appearance.update` يجمع الصلاحيات حسب domain/resource ويُبقي الأفعال موحدة؛ وهو الأنسب لأن المشروع يستعمل أصلًا `user.sessions.view` و`search.synonym.view`. أي rename يحتاج alias/migration mapping مزدوج القراءة خلال الترحيل.

## Unused permissions

| Permission          | Classification | Decision                                                       |
| ------------------- | -------------- | -------------------------------------------------------------- |
| `role.assign`       | UNUSED         | merge into `user.roles.manage`; لا حذف قبل migration telemetry |
| `permission.manage` | UNUSED         | deprecate؛ catalog read-only/system-controlled                 |
