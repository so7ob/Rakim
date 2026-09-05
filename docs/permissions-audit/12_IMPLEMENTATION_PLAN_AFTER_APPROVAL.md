# خطة التنفيذ بعد الموافقة

هذه الخطة غير منفذة. لا تبدأ أي مرحلة قبل اعتماد المصفوفة وقرارات الأدوار والحماية العليا.

## بوابة القرار صفر

يلزم اعتماد:

1. Naming convention الهرمية.
2. خريطة 56→74 ومفاتيح Workflow الخمسة المنفصلة.
3. mapping كل system role، خصوصًا submit/return وannex/relation.
4. مصير role `SUPER` وحماية آخر مدير.
5. authority ceiling/no-self-escalation.
6. public visibility fixes كأولوية أمنية.
7. عدم تفعيل scopes في الإصدار الأول.

## المرحلة 1: Security containment

- Issue/branch مستقل لكل حزمة وفق `GIT_WORKFLOW.md`.
- إصلاح public article/annex/relation/search visibility مع اختبارات تسريب negative.
- تنقيح dashboard/user/role composite payloads.
- إصلاح exact state-based legislation update check.
- إضافة target/actor ceiling إلى create user، role assignment، role grants، direct overrides.
- توحيد last-admin invariants وحماية system/protected roles transactionally.
- حسم `SUPER` قبل نشر أي تغيير.

هذه المرحلة تسبق إعادة التسمية لأنها تسد مخاطر قابلة للاستغلال بالمفاتيح الحالية.

## المرحلة 2: Catalog additive migration

- migration تضيف proposed keys ولا تحذف القديمة.
- metadata كاملة: domain/resource/action/Arabic label/description/risk/supported scopes/system flag إن اعتمد.
- aliases أو mapping table مؤقتة للـRENAME/MERGE/SPLIT.
- إبقاء `ALL` وحدها مفعلة.
- جعل policy exception namespace/system control منفصلًا عن role grants.

## المرحلة 3: Grants migration

- snapshot مجهول الهوية لـeffective permissions قبل الترحيل.
- role-by-role mapping مع approvals الموثقة في تقرير 11.
- لا map لكل نواتج SPLIT تلقائيًا.
- migrate direct overrides إن وجدت في البيئة المستهدفة مع نفس semantics.
- validate user-by-user effective before/after؛ أي توسع غير معتمد يفشل migration.
- session revocation مدروس ورسالة UX واضحة.

## المرحلة 4: Backend enforcement

- endpoint واحد/سياسة واحدة لكل عملية متكررة (publication/reindex).
- decorators تستخدم canonical keys.
- service يفرض state transition وtarget policy وseparation of duties.
- إزالة الاعتماد المضلل على `@Roles` أو تحويله إلى policy مقصودة ومختبرة؛ لا إبقاء annotation غير منفذ.
- منع تحديث WORKFLOW من settings endpoint العام.
- permission explanation service يعيد sources/denies/scope/policy checks.

## المرحلة 5: React administration

- تحديث `RequirePermission`, sidebar, tabs, actions بالمفاتيح canonical.
- ربط pages المشتركة بـ`AdminLayout`, `AdminPageHeader`, `AdminTabs` حسب قواعد المشروع.
- جلب payloads منفصلة حسب صلاحيات tabs بدل الاعتماد على الإخفاء.
- Permission matrix read-only catalog؛ لا arbitrary Permission CRUD.
- إظهار سبب فقد الجلسة بعد self-affecting access change.
- إصلاح DownloadPage method ضمن Issue منفصل لأنه خلل وظيفي لا جزء RBAC.

## المرحلة 6: Verification

### Unit/integration

- Permission OR/exact-state semantics.
- role/direct DENY/ALLOW precedence.
- policy exception precedence.
- grantable permissions وassignable roles.
- self-escalation/peer-escalation negative tests.
- concurrent last-admin invariants.
- public draft/non-reviewed data non-disclosure.
- scope values غير المدعومة تظل مرفوضة.

### E2E

- PATCH role grants → GET → browser refresh → logout/login → same effective result.
- direct permissions equivalent flow.
- current-session revocation UX.
- every admin mutation returns 403 without exact key حتى لو ظهر الزر يدويًا.
- publication/annex/relation workflow matrices.

### Project checks

- lint/typecheck/unit/integration/e2e حسب scripts.
- Playwright screenshots و`visual:*` لكل تغيير بصري.
- migration rehearsal على نسخة development مع backup وrollback validation.
- secret scan وعدم إدخال `.env` أو dumps.

## المرحلة 7: Rollout/deprecation

- Backend dual-read أولًا، ثم data mapping، ثم frontend canonical keys.
- telemetry للمفاتيح القديمة دون تسجيل بيانات شخصية زائدة.
- إزالة dual-read في release لاحقة فقط بعد صفر استخدام وفترة rollback متفق عليها.
- عدم حذف Legacy permissions في أول migration.
- rollout تدريجي مع اختبار حسابات تمثل كل role.

## Git/GitHub delivery

كل تطوير جديد بعد الموافقة يبدأ Issue وفرعًا يحمل رقمها، لا commits مباشرة على `develop/main`. تُشغّل الاختبارات المناسبة، وتستخدم Conventional Commits، ويُفتح PR إلى `develop` يربط ويغلق Issue. لا merge مع checks فاشلة، ولا حذف لفروع العمل دون طلب صريح.

## Rollback

- migrations additive أولًا لتجنب rollback مدمر.
- الاحتفاظ بالمفاتيح القديمة والgrants snapshot طوال نافذة الانتقال.
- feature flag/dual-read rollback للخادم والواجهة.
- استعادة role grants من mapping snapshot transactionally لا عبر تعديل يدوي.
- public security fixes لا تُعكس إلا إذا أثبتت regression أشد، ويكون البديل deny-by-default.

## Definition of done

- كل واحدة من العمليات الإدارية المهمة مرتبطة بمفتاح canonical ومفروضة server-side.
- لا يستطيع actor منح ما لا يملك حق منحه.
- آخر protected administrator لا يمكن فقده حتى مع concurrency.
- لا بيانات draft/non-reviewed في public APIs/index.
- effective permission explanation قابل للتدقيق.
- roles/users after-matrix مطابقة للقرارات المعتمدة دون توسع صامت.
- required checks وreview ناجحان قبل الدمج.
