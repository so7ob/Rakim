# ضوابط الأمان المنفذة

## المرجعية وسقف السلطة

الخادم هو مرجع التفويض النهائي. تقبل طبقة RBAC فقط مفاتيح canonical نشطة وغير legacy ونطاق `ALL`. تقارن `AuthorizationPolicyService` مستوى الفاعل بالهدف داخل transaction؛ ولا يمكنه إدارة مستخدم أو دور بمستوى مساوٍ أو أعلى، أو منح permission غير موجودة ضمن صلاحياته الفعلية.

- `user.create` يقبل فقط أدوارًا نشطة، غير محمية، وأدنى من actor.
- إسناد الأدوار وdirect overrides يرفضان self-change.
- إدارة grants لا تتجاوز مجموعة actor الفعلية؛ direct `DENY` يتقدم على role/direct `ALLOW`.
- الدور `SUPER` نظامي ومحمي بمستوى 1000، ولا يقبل التعديل أو الحذف العادي.
- كل رفض لسقف السلطة يحمل سياق audit من طبقة السياسة؛ وبعد rollback تكتبه طبقة الأخطاء العامة بنتيجة `DENIED` وقبل إرسال 403، دون تسجيل payload حساس. يمنع ذلك تعارض سجل الرفض مع أقفال transaction.

## حماية آخر مدير

تقفل الاستعلامات الأدوار المحمية والمستخدمين النشطين ذوي الدور المحمي بواسطة `FOR UPDATE` قبل إزالة role أو تعطيل الحساب. يُرفض فقد آخر مدير محمي، وتوجد حماية أشد تمنع الفاعل الأدنى أو المساوي من الوصول إلى هذا التغيير أصلًا. يغطي E2E محاولتي تعطيل متزامنتين والتأكد من بقاء الحساب فعالًا.

## Workflow policy

فُصلت السلطات إلى `workflow_policy.view` و`workflow_policy.update` و`workflow_policy.overrides.manage`. مدير النظام يرى ويحدّث تفعيل السياسة، لكن حقول المستخدمين تُنقح ولا يستطيع endpoint الاستثناءات المنفصل. كما يرفض endpoint الإعدادات العام أي مجموعة `WORKFLOW`، فلا يوجد مسار تحديث بديل.

القدرات الاستثنائية الخمس تأتي من جدول `user_permissions` إلى `policyCapabilities` فقط. لا تدخل `permissions` ولا كتالوج role grants، ولا يحصل عليها `SUPER` تلقائيًا.

## تنقيح projections

- ملف المستخدم الأساسي لا يكشف roles/permissions/activity/sessions تلقائيًا؛ لكل projection endpoint وصلاحية مستقلة.
- ملف الدور الأساسي لا يكشف grants/users/audit؛ لكل tab endpoint مستقل.
- لوحة المؤشرات لا تعيد أحداث التدقيق ضمن `dashboard.view`.
- قائمة المستخدمين تنقح roles إن لم يملك actor `role.view`.

## حدود العرض العام

أصبحت القراءة العامة والفهرسة deny-by-default:

- المواد والتاريخ: parent منشور، ونسخة `PUBLISHED` أو `REPEALED`، و`valid_from<=CURRENT_DATE`.
- الملاحق والملفات: parent منشور، وحالة الملحق عامة، ونسخة سارية.
- العلاقات: `REVIEWED` فقط، وكلا التشريعين المصدر والهدف عامان.
- التعديلات والفهرس والتحليلات وCSV تمر بمرشحات النشر نفسها.

يغطي اختبار تكاملي حقيقي قاعدة البيانات ببيانات canary سرية ثم يثبت عدم ظهورها في detail/history/file/relation/search/analytics/CSV، ويحذف fixtures في teardown مع إعادة بناء الفهرس.

## Composite/state checks

تُختار permission الدقيقة في الخدمة حسب الحالة والانتقال، لا حسب إظهار زر أو decorator واسع: published metadata، انتقالات التشريع، حالة الملحق، وإنشاء/تحديث/مراجعة العلاقة. أزيل `RoleGuard` وrole-only annotations، وأصبح الاعتماد على permissions والسياسات المقصودة فقط.
