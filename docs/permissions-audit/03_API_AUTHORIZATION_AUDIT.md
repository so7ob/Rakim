# تدقيق Authorization في REST API

## الخلاصة

- جرى حصر **105 endpoints**: 24 عامة، 13 ذاتية بالجلسة، 68 محمية بصلاحية.
- لا يوجد endpoint إداري كتابي يعتمد على إخفاء زر React فقط؛ أي **Frontend-only protection = 0**.
- مع ذلك توجد **فجوات حرجة** لأن بعض endpoints تقبل مدخلات تتجاوز سلطة الفاعل، وبعض GET العامة تكشف بيانات غير منشورة، وبعض الاستجابات المركبة تتجاوز Permission المعلنة.
- `PermissionGuard` يطبّق **OR** عند تعدد المفاتيح.
- `RoleGuard` يعيد السماح دون فحص الدور عند وجود `@Permissions`؛ لذلك كل `@Roles(...)` بجوار Permission توثيق مضلل وليس قيدًا منفذًا.
- `SessionGuard` يفرض session، وCSRF على الطرق غير الآمنة، ويعيد حساب الصلاحيات من DB في كل طلب.

## أخطر endpoints

| Method     | Endpoint                                | Operation                     | Authentication | Authorization الحالي                                    | المطلوب                                                          | Risk     | Status                                                           |
| ---------- | --------------------------------------- | ----------------------------- | -------------- | ------------------------------------------------------- | ---------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| POST       | `/admin/users`                          | إنشاء مستخدم مع أدوار         | Session+CSRF   | `user.create`                                           | `user.create` + تحقق أن كل role قابلة للإسناد ضمن ceiling الفاعل | Critical | **Privilege escalation**                                         |
| PATCH      | `/admin/users/:id/roles`                | استبدال أدوار                 | Session+CSRF   | `user.manage_roles`                                     | `user.roles.manage` + authority ceiling + protected-target rules | Critical | **Privilege escalation**                                         |
| PATCH      | `/admin/access-roles/:id/permissions`   | استبدال grants                | Session+CSRF   | `role.manage_permissions`                               | `role.permissions.manage` + actor ceiling + protected role rules | Critical | **Privilege escalation**                                         |
| PATCH      | `/admin/users/:id/granular-permissions` | direct ALLOW/DENY             | Session+CSRF   | `user.manage_permissions`                               | `user.permissions.manage` + actor ceiling + no-self-escalation   | Critical | **Privilege escalation**                                         |
| GET        | `/articles/:id/versions`                | تاريخ النسخ                   | لا             | لا شيء                                                  | قيد parent legislation public + version visibility               | Critical | **Public data exposure**                                         |
| GET        | `/articles/:id/previous-texts`          | نصوص سابقة                    | لا             | لا شيء                                                  | القيد نفسه                                                       | Critical | **Public data exposure**                                         |
| GET        | `/annexes/:id`                          | ملحق                          | لا             | parent legislation public فقط                           | parent + annex published status                                  | Critical | **Draft annex exposure**                                         |
| GET        | `/annexes/:id/file`                     | ملف ملحق                      | لا             | parent legislation public فقط                           | parent + annex published status                                  | Critical | **Draft file exposure**                                          |
| GET        | `/legislations/:id/relations`           | علاقات                        | لا             | source legislation public                               | `REVIEWED` + target public                                       | High     | Unreviewed/draft target exposure                                 |
| PATCH      | `/admin/legislations/:id`               | تعديل metadata                | Session+CSRF   | update OR published-metadata                            | exact state-based permission                                     | High     | **Incorrect permission**: حامل المفتاح الثاني يستطيع تعديل draft |
| GET        | `/admin/dashboard`                      | مؤشرات + recentAudit          | Session        | `dashboard.view`                                        | فصل/تنقيح audit أو اشتراط `audit.view`                           | High     | Projection gap                                                   |
| GET        | `/admin/access-roles/:id`               | role/users/audit              | Session        | `role.view`                                             | field-level projection بحسب `user.view`,`audit.view`             | High     | Projection gap                                                   |
| GET        | `/admin/users/:id/access`               | user/access/activity/sessions | Session        | `user.view`                                             | field-level checks أو endpoints منفصلة                           | High     | Projection gap                                                   |
| PATCH      | `/site/settings`                        | تحديث settings groups         | Session+CSRF   | permission مشتقة من group                               | منع WORKFLOW عبر المسار العام                                    | High     | Alternate policy-management path                                 |
| POST/PATCH | annex endpoints                         | create/update/status          | Session+CSRF   | `annex.manage`; non-DRAFT يحتاج `legislation.publish`   | annex granular keys                                              | High     | Over-broad + incorrect cross-resource key                        |
| POST/PATCH | relation endpoints                      | create/update/review          | Session+CSRF   | `relation.manage`; REVIEWED يحتاج `legislation.approve` | relation granular keys                                           | High     | Over-broad + incorrect cross-resource key                        |
| GET        | `/admin/legislations/:id`               | full content/source data      | Session        | `legislation.view`                                      | تنقيح source fields بلا `source.view`                            | High     | Projection boundary                                              |
| GET        | `/search*`                              | query/export                  | لا             | public status filter                                    | ضمان status لكل article version indexed                          | High     | Derived-data boundary requires regression test                   |

## endpoints صحيحة أو تحتاج فقط Granularity

| Endpoint group                          | Authentication        | Current permission                  | Status                          | ملاحظة                                                              |
| --------------------------------------- | --------------------- | ----------------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| `/imports` GET/file                     | Session               | `source.view`                       | Protected correctly             | تنزيل الملف داخل view قرار مقبول إذا وثق                            |
| `/imports` POST                         | Session+CSRF          | `source.upload`                     | Protected correctly             | امتداد/حجم وتخزين مقيد، job لاحق system action                      |
| `/imports/:id/review`                   | Session+CSRF          | `source.review`                     | Protected correctly             | policy separation مفروضة في service                                 |
| `/imports/:id/draft`                    | Session+CSRF          | `source.create_draft`               | Protected correctly، naming فقط | rename proposed                                                     |
| `/admin/amendments/*`                   | Session(+CSRF writes) | view/create/review/publish          | Protected correctly             | service يفرض الحالة وفصل الواجبات                                   |
| `/admin/legislations` GET               | Session               | `legislation.view`                  | Protected correctly             | administrative view                                                 |
| `/admin/legislations/:id/workflow`      | Session+CSRF          | OR decorator ثم exact service check | Protected correctly             | التفكيك مطلوب للـprepare/return                                     |
| `/admin/articles/*`                     | Session+CSRF          | `article.update`                    | Protected correctly             | move/reorder داخل metadata؛ لا عمليات create/delete مستقلة          |
| `/admin/sources/:id`                    | Session+CSRF          | `source.update`                     | Protected correctly             | قيد حالة في service                                                 |
| `/admin/structure/*`                    | Session+CSRF          | `structure.manage`                  | Over-broad                      | split create/update                                                 |
| `/admin/reference-data*`                | Session(+CSRF writes) | `reference.manage`                  | Over-broad                      | split create/update؛ active toggle ضمن update                       |
| `/admin/audit`                          | Session               | `audit.view`                        | Protected correctly             | لا update/delete، DB triggers تمنعها                                |
| `/admin/users` GET                      | Session               | `user.view`                         | Protected correctly             | قائمة لا تعرض أسرارًا                                               |
| `/admin/users/:id/profile`              | Session+CSRF          | `user.update`                       | Protected correctly             | target rules يمكن تحسينها                                           |
| `/admin/users/:id/state`                | Session+CSRF          | `user.disable`                      | Over-broad                      | enable/disable؛ last-admin checks جزئية                             |
| `/admin/users/:id/reset-password`       | Session+CSRF          | `user.reset_password`               | Protected correctly             | يبطل الجلسات؛ المورد صحيح                                           |
| `/admin/users/:id/activity`             | Session               | `user.activity.view`                | Protected correctly             | sensitive read                                                      |
| `/admin/users/:id/sessions`             | Session               | `user.sessions.view`                | Protected correctly             | sensitive read                                                      |
| `/admin/users/:id/sessions/:sid/revoke` | Session+CSRF          | `user.sessions.revoke`              | Protected correctly             | target session/user match checked                                   |
| `/admin/access-roles` GET/POST          | Session(+CSRF create) | `role.view/create`                  | Protected correctly             | code uniqueness validated                                           |
| `/admin/access-roles/:id` PATCH         | Session+CSRF          | `role.update`                       | Partially protected             | system role cannot disable؛ name/description ما زالا قابلين للتعديل |
| `/admin/access-roles/:id` DELETE        | Session+CSRF          | `role.delete`                       | Protected correctly             | system role and assigned role blocked                               |
| `/admin/permissions`                    | Session               | `permission.view`                   | Protected correctly             | read-only catalog                                                   |
| synonym writes                          | Session+CSRF          | `search.synonym.manage`             | Over-broad                      | create/delete/activate                                              |
| quality GET/PATCH                       | Session(+CSRF write)  | `quality.view/manage`               | Correct but naming broad        | GET computes live checks; PATCH resolve/ignore                      |
| reports GET/PATCH                       | Session(+CSRF write)  | `report.view/manage`                | Correct but naming broad        | reports = public content reports                                    |
| `/admin/reindex`, `/reindex`            | Session+CSRF          | `search.reindex`                    | Protected, duplicated           | destructive only to derived index                                   |
| `/publications`                         | Session+CSRF          | `legislation.publish`               | Protected, duplicated           | same transition service                                             |

## العامة والذاتية

الـ24 العامة موثقة تفصيليًا في `02_SYSTEM_OPERATION_INVENTORY.md`. المسارات العامة السليمة تقيد التشريع بالحالات المنشورة. الاستثناءات المثبتة هي article history، annex visibility، relation review/target، ومخاطر محتوى الفهرس المشتق.

الـ13 الذاتية تستمد `userId` من session ولا تقبل هوية مستخدم بديلة من body/path، ولذلك لا تحتاج RBAC. تغيير كلمة المرور وlogout يبطلان الجلسات المعنية. لا يوجد admin `revoke_all` حاليًا.

## تطابق Frontend/Backend

| Pattern                 | Frontend                                 | Backend                                  | Verdict                                   |
| ----------------------- | ---------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Route guard             | `RequirePermission(anyOf)`               | `PermissionGuard`                        | متطابق في OR semantics                    |
| Button/action           | `hasPermission`                          | decorator + service state checks         | جيد عمومًا                                |
| Roles                   | لا تعتمد الواجهة على role names          | `@Roles` موجود لكنه متجاوز               | إزالة الالتباس أو تنفيذ policy صريح مطلوب |
| Scopes                  | لا تعرض Scope فعليًا إلا editor metadata | لا filter                                | غير منفذ end-to-end                       |
| Composite response tabs | tabs مخفية بمفاتيح مختلفة                | endpoint يعيد كل الحقول بمفتاح view واحد | **غير متطابق**                            |

## ملاحظة حفظ الصلاحيات

### Trace الحالي

1. React يرسل `PATCH` إلى role permissions أو user granular permissions بقائمة `{code, scope}` / `{code,effect,scope}`.
2. Backend يتحقق من المفاتيح والنطاقات ويرفض `OWN/ASSIGNED` حاليًا.
3. service ينفذ replace-all داخل transaction: `DELETE` ثم `INSERT`.
4. PK المركب يمنع التكرار، ثم تبطل جلسات المتأثرين، ويسجل audit، ويعيد detail.
5. الواجهة تصفر selection المحلي وتستدعي `retry()`؛ لا يوجد query-cache يخزن نتيجة قديمة.
6. اختبار E2E موجود بعنوان `granular permissions persist, enforce in API, drive navigation` ويغطي الحفظ وإعادة تسجيل الدخول والتنقل، ويغطي role inheritance/removal أيضًا.

### Root Cause conclusion

لم يظهر سبب جذري قائم يجعل الحفظ ينجح ثم يختفي بعد refresh، ولم تُعد المشكلة قابلة للإثبات بالتحليل الساكن الحالي. المسار الحالي persistence صحيح. الاحتمال الموثق الوحيد الذي قد يبدو للمستخدم كفشل حفظ: تعديل صلاحيات/أدوار المستخدم الحالي يبطل جلسته فورًا؛ فيفشل GET اللاحق بـ401 أو ينتقل إلى login بينما البيانات محفوظة.

### Affected files

- `apps/web/src/components/PermissionExplorer.tsx`
- `apps/web/src/pages/admin/AdminRoleDetailPage.tsx`
- `apps/web/src/pages/admin/AdminUserDetailPage.tsx`
- `apps/web/src/hooks/useApi.ts`
- `apps/api/src/admin/access-control.controller.ts`
- `apps/api/src/admin/access-control.service.ts`
- `tests/e2e/admin-auth.spec.ts`

### Recommended fix (بعد الموافقة فقط)

الإبقاء على transaction، وإضافة UX صريح عند session revocation، واختبار refresh مباشر بعد PATCH لمستخدم آخر وللمستخدم الحالي، وتسجيل request/response عند إعادة ظهور العرض. لم يُشغّل E2E في التدقيق لأنه يكتب بيانات تطوير ويعيدها في `finally` وليس read-only بحتًا.
