# نموذج الصلاحيات المقترح

## المبادئ

1. Backend هو policy enforcement point؛ React يعكس القرار فقط.
2. كل عملية إدارية مؤثرة ترتبط بمفتاح واحد دقيق، مع state/policy checks إضافية داخل service.
3. لا تُشتق Resources من أسماء الجداول. Join tables ليست موارد.
4. لا wildcard ولا implicit `manage` في النموذج المقترح.
5. catalog system-controlled؛ التطبيق/الهجرة يعرّفان المفاتيح، والواجهة تعرضها ولا تنشئ مفاتيح اعتباطية.
6. Deny صريح يتغلب على grants العادية؛ استثناءات Workflow capabilities منفصلة ومقيدة من تبويب policy.
7. أقل صلاحية افتراضيًا، ولا ترقية تلقائية لأي مستخدم أثناء migration.

## Naming

الصيغة: `<resource>[.<subresource>].<action>`.

- resource مفرد: `user`, `role`, `legislation`.
- الفعل آخر segment ومن قاموس محدود: `view/create/update/delete/enable/disable/submit/return/approve/publish/archive/review/resolve/revoke/rebuild/manage`.
- `manage` يسمح فقط لمجموعة إسناد واضحة مثل `user.roles.manage`، وليس CRUD متعدد المخاطر.
- أمثلة: `settings.appearance.update`, `search.index.rebuild`, `legislation.published_metadata.update`.

تم اكتشاف **20 root resources** و**30 addressable resource paths** في المصفوفة، بعد استبعاد join/technical tables.

## الموارد

| Category            | Resource paths                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Overview            | `dashboard`                                                                                                                               |
| Legislative content | `legislation`, `article`, `structure`, `annex`, `relation`, `reference`                                                                   |
| Sources/workflow    | `source`, `amendment`, `workflow_policy`, `workflow_policy.overrides`                                                                     |
| Governance          | `quality`, `report`, `audit`                                                                                                              |
| Search              | `search.synonym`, `search.synonym_set`, `search.index`                                                                                    |
| Presentation        | `settings.general`, `settings.appearance`, `settings.header`, `settings.footer`, `settings.legislation_page`, `navigation`, `public_page` |
| Access              | `user`, `user.activity`, `user.sessions`, `role`, `role.permissions`, `permission`                                                        |

## Effective permission algorithm المقترح

```text
Input: active user, active roles, active catalog, direct overrides

1. Collect every active role grant for an active catalog key.
2. Normalize/merge scope with an explicit lattice; reject undefined combinations.
3. Apply direct DENY last over all ordinary role/direct ALLOW grants.
4. Apply direct ALLOW only when it was legally grantable by the assigning actor.
5. Evaluate policy exceptions in a separate namespace; do not mix them into role catalog.
6. Authorize only when:
   authentication && permission key && resource scope filter && state policy && target policy
7. Return an explanation graph for each decision.
```

مثال explanation:

```json
{
  "permission": "legislation.publish",
  "allowed": true,
  "scope": "ALL",
  "sources": [
    { "type": "ROLE", "code": "CONTENT_MANAGER", "name": "مدير المحتوى" }
  ],
  "overrides": [],
  "policyChecks": [{ "code": "publication-separation", "result": "passed" }]
}
```

إذا وُجد DENY فتعاد أيضًا هويته المنطقية (role/direct/policy) دون كشف بيانات حساسة. بهذه البنية يستطيع النظام الإجابة: لماذا يمتلك المستخدم هذه الصلاحية؟

## Scope

الحالة الحالية: `ALL` فقط مسموح في catalog؛ service يرفض `OWN/ASSIGNED`. هذا سلوك آمن حاليًا، بينما guard لا يفسر scope.

| Resource/action family                                  | supports_scope now | Future evidence-based candidate | شرط التفعيل                             |
| ------------------------------------------------------- | -----------------: | ------------------------------- | --------------------------------------- |
| dashboard/settings/audit/access control/publish/approve |              false | none                            | تبقى ALL                                |
| legislation view/update                                 |              false | ASSIGNED                        | وجود assignment relation وquery filters |
| article/structure/annex/relation draft edits            |              false | ASSIGNED عبر parent legislation | parent-scoped enforcement               |
| source view/update/review                               |              false | ASSIGNED                        | assignment ownership موثق               |
| amendment view/review                                   |              false | ASSIGNED                        | assignment relation موثق                |
| personal favorites/searches/notes                       |                n/a | OWN                             | مطبق كملكية لا RBAC scope               |

لا يقترح تمكين Scope الآن. في المصفوفة، `false (candidate ASSIGNED)` مجرد تصميم مستقبلي وليس grant قابلًا للاستخدام.

## Risk levels

- `normal`: عرض بيانات إدارية غير شديدة الحساسية أو تعديل محدود منخفض الأثر.
- `sensitive`: تعديل محتوى/حالة أو عرض نشاط/جلسات أو إعادة بناء مشتقات.
- `critical`: نشر/اعتماد ذو أثر عام، إدارة أدوار/صلاحيات، استثناءات policy، أو عملية يمكنها توسيع السلطة.

Risk metadata لا يكفي للمنع؛ يستخدم للمراجعة، approval workflow، logging، واختبارات ceiling.

## Permission metadata مقابل Schema الحالي

| Desired          | Current                                | Assessment                                       |
| ---------------- | -------------------------------------- | ------------------------------------------------ |
| `id`             | لا id؛ `code` PK                       | code PK مقبول، لكن rename أصعب                   |
| `key`            | `code`                                 | مكافئ                                            |
| `resource`       | موجود                                  | جيد                                              |
| `action`         | موجود                                  | جيد                                              |
| `name_ar`        | `label_ar`                             | مكافئ                                            |
| `description`    | `description_ar`                       | عربي فقط؛ مناسب حاليًا                           |
| `category`       | `domain`                               | مكافئ وظيفيًا                                    |
| `risk_level`     | `sensitivity` NORMAL/ELEVATED/CRITICAL | mapping واضح إلى normal/sensitive/critical       |
| `supports_scope` | `supported_scopes` JSON                | أغنى من boolean، جيد إذا فُرض                    |
| `is_system`      | لا؛ يوجد `is_active`                   | يلزم تمييز system-controlled قبل أي catalog CRUD |
| timestamps       | موجودة                                 | جيد                                              |

لا يلزم تغيير Schema فورًا. الأولوية لإنفاذ scopes والceiling، ثم قرار stable numeric id مقابل code PK في خطة migration.

## Role metadata مقابل Schema الحالي

| Desired                       | Current                             | Assessment                                          |
| ----------------------------- | ----------------------------------- | --------------------------------------------------- |
| `code`, `name`, `description` | موجودة (`name_ar`,`description_ar`) | جيد                                                 |
| `is_system`                   | موجود                               | system seeded، لكنه لا يعني immutable بالكامل       |
| `is_active`                   | موجود                               | جيد                                                 |
| `is_protected`                | غير موجود                           | مطلوب لفصل protected/immutable عن system provenance |
| timestamps                    | موجودة                              | جيد                                                 |

الدور `SUPER` يثبت أن الاسم أو امتلاك كل المفاتيح لا يعوض `is_protected`. يلزم قرار صريح قبل أي migration.

## عمليات لا تحتاج Permission جديدة

- Public browse/search/export/download المنشور: status/visibility policy لا RBAC.
- Account self-service والمفضلة والبحث المحفوظ والملاحظات: session ownership.
- Background jobs: system identity؛ trigger permission تكفي.
- Bulk: يستخدم permission الفردية مع تحقق كل target؛ لا مفتاح bulk مستقل الآن.
- Article create/delete، amendment update/revoke، role clone، audit export، admin revoke-all: غير موجودة وظيفيًا.

## قواعد الإسناد المقترحة

- `grantablePermissions(actor)` لا تتجاوز effective permissions للفاعل، مع deny-list للقدرات الحرجة التي تتطلب protected authority.
- `assignableRoles(actor)` يستبعد protected/equal-or-higher roles.
- لا يجوز تعديل self access في نفس request العادي.
- system/protected invariants تفحص transactionally وتُسجل before/after والسبب.
- لا تعتمد القواعد على إخفاء UI أو role name وحده.
