# تدقيق Privilege Escalation

## الحكم

النظام يمنع بعض حالات lockout، لكنه لا يطبق قاعدة أساسية: **لا يجوز للفاعل منح قدرة لا يملكها أو إدارة target أعلى/مساويًا لمرتبته المحمية**. توجد أربعة مسارات مباشرة قابلة للتصعيد بمجرد امتلاك مفتاح إداري واحد مناسب.

## مسارات التصعيد

### 1. إنشاء مستخدم بصلاحيات أعلى — Critical

`POST /admin/users` يحتاج `user.create` فقط، وDTO يقبل مصفوفة role codes. الـservice يتحقق من وجود الأدوار ونشاطها، ولا يتحقق أن الفاعل يملك `user.manage_roles` ولا أن الدور المراد أقل من authority ceiling لديه.

سيناريو: حامل `user.create` ينشئ حسابًا جديدًا بدور `SYSTEM_ADMIN` أو الدور الفعلي `SUPER` ثم يسجل الدخول به.

### 2. إسناد دور للنفس أو للغير — Critical

`PATCH /admin/users/:id/roles` يحتاج `user.manage_roles`. توجد حماية من إزالة `SYSTEM_ADMIN` من النفس ومن إزالة آخر admin، لكن لا توجد حماية من **إضافة** SYSTEM_ADMIN/SUPER للنفس أو للغير، ولا يوجد assignable role policy.

### 3. توسيع صلاحيات دور — Critical

`PATCH /admin/access-roles/:id/permissions` يقبل أي code في catalog. لا يقارن grants بصلاحيات الفاعل ولا يمنع تعديل system roles. يجبر SYSTEM_ADMIN فقط على الاحتفاظ بثلاثة مفاتيح، لكنه يسمح بإضافة كل الكتالوج أو إزالة بقية المفاتيح الحرجة.

سيناريو: حامل `role.manage_permissions` يضيف `user.manage_permissions` أو `legislation.publish` إلى دور يملكه.

### 4. Direct permission escalation — Critical

`PATCH /admin/users/:id/granular-permissions` يسمح ALLOW/DENY لأي catalog key. توجد self-DENY checks محدودة، لكن لا يوجد self-ALLOW prohibition أو actor ceiling.

سيناريو: حامل `user.manage_permissions` يمنح نفسه `role.manage_permissions` ثم يوسع دوره.

## خوارزمية Effective Permissions الحالية

```text
effective = Map()
for each active role grant:
  if key absent: effective[key] = {scope, source role}
  else: append role source (scope لا يدمج بقانون قوة واضح)

for each direct override:
  DENY  => delete effective[key]
  ALLOW => replace effective[key] with direct source/scope

for each workflow policy exception:
  effective[overrideCode] = {scope: ALL, source: policy override}

allowed := key exists in effective
```

الترتيب الحالي واضح من حيث role → direct override → policy exception. Deny يتغلب على role grant، وdirect allow يتغلب على role، لكن policy exception يُطبق أخيرًا. لا يوجد wildcard أو inheritance بين permissions. لا يوجد scope enforcement في guard أو repository filters.

## حماية المدير الأعلى

| Invariant                          | Current state             | Severity |
| ---------------------------------- | ------------------------- | -------- |
| منع تعطيل النفس                    | موجود                     | Good     |
| منع تعطيل آخر SYSTEM_ADMIN فعال    | موجود                     | Good     |
| منع إزالة SYSTEM_ADMIN من النفس    | موجود                     | Good     |
| منع إزالة دور آخر SYSTEM_ADMIN     | موجود                     | Good     |
| منع حذف/تعطيل system role          | موجود                     | Good     |
| منع تغيير اسم/وصف system role      | غير موجود                 | High     |
| منع إزالة جميع مفاتيحه الحرجة      | جزئي؛ قائمة من 3 فقط      | Critical |
| منع direct DENY على آخر admin      | جزئي وقائمة غير متسقة     | Critical |
| منع self-grant                     | غير موجود                 | Critical |
| منع إسناد role أعلى                | غير موجود                 | Critical |
| حماية role اسمه SUPER              | غير موجود و`is_system=0`  | Critical |
| منع حذف آخر Super Admin بمعنى واضح | لا يوجد مفهوم Super Admin | Critical |

التناقض: حماية self-DENY تشمل `user.manage_permissions` ولا تشمل `user.manage_roles`، بينما حماية last-admin تفحص `user.manage_roles` ولا تشمل `user.manage_permissions`. كما أن `permission.manage` محمي رغم أنه غير مستخدم وظيفيًا.

## النموذج المطلوب بعد الموافقة

1. تعريف roles محمية وimmutable fields وrole rank/tier أو سياسة `canManageTarget` صريحة.
2. أي grant/assignment يجب أن يحقق: target قابل للإدارة، وكل Permission/Role ممنوحة ضمن grantable set للفاعل.
3. منع self-escalation افتراضيًا؛ الاستثناء يحتاج break-glass process خارج الطلب المعتاد وتدقيقًا قويًا.
4. `user.create` لا يسمح بأدوار إلا default/assignable roles؛ الإسناد الأعلى يحتاج `user.roles.manage` أيضًا.
5. تحقق invariant داخل transaction وبقفل مناسب لمنع race عند آخر admin.
6. فصل system role وprotected role؛ `is_system` وحده لا يكفي لوصف immutability.
7. عدم افتراض أن اسم `SUPER` يمنح semantics؛ يجب قرار مالك واضح ومعرف ثابت.
8. رفض scopes غير المنفذة كما يحدث الآن، ثم عدم تمكينها إلا مع filters واختبارات IDOR.
9. إرجاع explanation structured لكل effective permission: result، source type/id/name، effect، scope، وأي policy exception.

## اختبارات آمنة مطلوبة لاحقًا

- مستخدم محدود لا يستطيع إنشاء مستخدم بدور أعلى.
- لا يستطيع actor إسناد نفسه دورًا أعلى.
- لا يستطيع منح role/user Permission لا يملك صلاحية منحها.
- direct DENY precedence وpolicy exception precedence موثقتان.
- محاولتان متزامنتان لا تعطلان آخر admin.
- system/protected role لا يحذف ولا يعطل ولا يغير مفتاحه.
- `SUPER` يعامل وفق القرار المعتمد، لا وفق الاسم وحده.

لم تُنفذ محاولات تصعيد أو writes في هذه المرحلة؛ النتائج مستخلصة من مسارات الكود والقيود فقط.
