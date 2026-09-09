# نمط إدارة البيانات في لوحة الإدارة

## القاعدة

الحالة الافتراضية لأي Entity هي **View First**: نص، badge، جدول، بطاقة، أو `EntityDetails`. لا تُستخدم input معطلة لتمثيل القراءة. تظهر Form controls فقط في البحث والفلترة، أو عند إنشاء/تعديل، أو عند إجراء يحتاج مدخلًا، أو داخل إعداد/محرر متخصص.

## View

- صفحة القائمة تعرض صفوفًا دلالية مع loading وempty وerror states الموجودة في النظام.
- عندما يملك الصف عمليتين أو ثلاثًا، يجمعها `AdminRowActions` باسم وصول يحدد الكيان؛ يبقى «عرض» واضحًا وتظهر «تعديل» وعملية Lifecycle بجانبه عند التصريح.
- صفحة التفاصيل تعرض metadata في `EntityDetails`، والنص الطويل في section قابلة للقراءة.
- تعرض الإجراءات التي يدعمها المورد فعليًا والتي يسمح بها Canonical RBAC فقط.
- لا يُحمّل dialog بيانات إضافية إن كانت بيانات السجل موجودة في cache الصفحة، وبعد النجاح يستخدم `retry` المحدد للمورد بدل full-page reload.

## Add

- الزر يحمل اسم المورد مثل «إضافة جهة» ويظهر فقط مع `resource.create`.
- إنشاء التشريع الأساسي يستخدم `legislation.create` و`POST /legislations`، بينما الاستيراد يبقى مسارًا مستقلًا تحت `source.upload`؛ لا يُخفى أحد المسارين خلف الآخر.
- الكيانات الصغيرة تستخدم `AdminDialog`; نماذج الاستيراد والتعديلات المتخصصة تبقى dedicated routes.
- يبقى dialog مفتوحًا ومدخلاته محفوظة عند validation أو server error، ويُعطّل submit أثناء الطلب.
- لا تغلق الواجهة ولا تعرض النجاح إلا بعد استجابة ناجحة، ثم تُحدّث القائمة.

## Edit

- يبدأ من زر «تعديل» في وضع القراءة ويحمّل القيم الحالية داخل dialog.
- نص المادة ومحتوى الصفحة العامة يستخدمان `size="large"` مع تحذير تغييرات غير محفوظة.
- يغلق dialog بعد نجاح الخادم فقط. الخطأ القابل للعرض يوضع مع `role="alert"` داخل النموذج.

## Delete / Archive / Disable / Revoke

- لا يظهر hard delete إلا إن دعمه Controller وLifecycle.
- `ConfirmDialog` إلزامي قبل حذف الدور أو المرادف، وتعطيل المستخدم، وسحب الجلسة، والعمليات المماثلة.
- التشريعات والملاحق والصفحات العامة تستخدم حالات Lifecycle القانونية بدل الحذف.
- لا تستخدم `window.confirm` أو `alert`; أخطاء الخادم تبقى داخل الحوار ولا تغلقه.

## Dialog وDrawer accessibility

- `AdminDialog` يستخدم `role="dialog"`, `aria-modal`, عنوانًا مرتبطًا ووصفًا اختياريًا.
- يدعم Escape، النقر على الخلفية، focus trap، initial focus، وإعادة focus إلى trigger.
- حوار فقد التغييرات يستخدم `role="alertdialog"` ويحبس focus مستقلًا.
- كل عناصر form تحمل labels، ورسائل الخطأ قابلة للقراءة، والحوار responsive وRTL.
- `UnsavedChangesGuard` يعترض روابط التطبيق بحوار تصميم النظام، ويستخدم `beforeunload` القياسي فقط عند مغادرة المستند نفسه.

## الصلاحيات

- شرط العرض في React يطابق permission الدقيقة مثل `reference.create` أو `role.delete`.
- Controller يفرض permission نفسها عبر `PermissionGuard`; إخفاء الإجراء ليس حماية.
- لا تعاد aliases قديمة ولا تُضاف صلاحية عامة بديلة.
- الأفعال الحرجة في `PermissionExplorer` تتطلب تأكيدًا قبل تغيير الاختيار محليًا، ثم يبقى حفظ المنح وسبب التغيير خطوة مستقلة.

## الاستثناءات

- Settings المستمرة: form داخل `AdminTabs` وsections مع save state واضح وdirty guard.
- Large editors: حوار كبير أو مسار متخصص؛ لا يُضغط النص القانوني في modal صغير.
- Permission/role membership matrices: محررات متخصصة لأن التفاعل الجماعي هو طبيعة المورد.
- Workflow/operational pages: تصمم حول الإجراء والحالة بدل CRUD مصطنع.
