# دورة Git وGitHub

هذه السياسة إلزامية من نقطة التسوية الحالية فصاعدًا. فرع الإنتاج هو `main`، وفرع التكامل اليومي هو `develop`.

## Current Baseline Policy

كل كود كان مدمجًا في `main` أو فرع التطوير المعتمد قبل نقطة التحول يعد Existing Baseline. لا تنشأ له Issues أو Branches أو PRs بأثر رجعي، ولا يعاد ترتيب commits القديمة أو تغيير SHA أو المؤلف أو التاريخ. إذا ظهر عيب حالي في كود قديم، تنشأ Issue جديدة للعيب الحالي فقط.

## Reconciliation Policy

يفحص العمل الحي بالترتيب الآتي:

1. `git fetch --all --prune` ثم `git status` والفروع ومقارنات ahead/behind.
2. staged وunstaged وuntracked وعمليات merge/rebase/cherry-pick غير المكتملة.
3. commits المحلية غير المرفوعة والفروع المحلية/البعيدة ذات commits فريدة.
4. Issues وPRs المفتوحة والمغلقة دون دمج وRequired Checks.
5. stashes التي قد تحتوي عملًا مفيدًا.

تقسم التغييرات إلى وحدات وظيفية قابلة للاختبار والمراجعة. يبحث عن Issue مطابقة قبل إنشاء واحدة. تحمى الحالة المعقدة بـ recovery stash أو branch أو patch محلي موصوف، دون أسرار ودون `reset --hard` أو `clean`. ينقل العمل إلى Issue Branch بأقل وسيلة مخاطرة، ولا يعاد تنفيذ commit موجود بلا داعٍ. كل حالة تنتهي إلى: مدمجة في `develop`، أو PR مفتوحة بمانع، أو Issue مفتوحة، أو obsolete بسبب موثق، أو مانع خارجي موثق.

## New Development Workflow

المسار الإلزامي:

`Issue → Issue Branch → Code → Tests → Commit → Push → Pull Request → Review → Checks → Merge into develop → Close Issue`

قبل البدء: اجلب المراجع، افحص working tree، ابحث عن Issue، حدّث `develop`، ثم أنشئ الفرع منها. يمنع بدء التطوير قبل Issue، ويمنع push المباشر إلى `develop` أو `main`.

## Branch Naming

استخدم رقم Issue ووصفًا قصيرًا:

- `feature/123-role-management`
- `fix/145-permissions-refresh`
- `enhancement/152-admin-sidebar`
- `refactor/160-settings-tabs`
- `database/170-permissions-schema`

تزال الفروع المدمجة فقط بعد التحقق من وصول نتيجتها إلى `develop`.

## Commit Convention

استخدم Conventional Commits: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`. اجعل commit ذرية واذكر Issue عند ملاءمة ذلك، مثل `fix(auth): reject unsupported permission scopes (#145)` أو `Refs #145`. لا تجمع تغييرات غير مرتبطة ولا تنشئ commits شكلية.

## PR Requirements

قاعدة PR هي `develop`. يجب أن تتضمن حسب الحاجة: `Closes #N`، ملخص المشكلة والحل، أهم التغييرات، الاختبارات الفعلية ونتائجها، أثر قاعدة البيانات، أثر الأمن والصلاحيات، المخاطر، ولقطات UI. راجع diff مستقلًا للتغييرات العرضية وdebug code والأسرار وSQL والمهاجرات وغياب authorization والاختبارات.

## Testing Requirements

استخرج الأوامر من scripts الحالية. الحد المعتاد لهذا المشروع:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e -- --workers=1` عند تأثير التكامل أو الواجهة
- `npm run test:infra` عند تأثير النشر أو الإعدادات
- اختبارات migration على MariaDB عند تغيير المخطط

تغييرات UI تتطلب Playwright لسطح المكتب والهاتف وRTL وفحص console/network/overflow، وتشغيل مسار `visual:*` المناسب. تغييرات الصلاحيات تختبر 401/403 وCSRF والحماية في الخادم والوصول المباشر والثبات بعد refresh وإعادة الدخول وإبطال الجلسات عند تغيير المنح.

تشغّل GitHub Actions فحصين على كل PR إلى `develop`: `Lint, unit tests, build, and infrastructure`، و`MariaDB migrations, seed, and Playwright`. تستخدم CI قاعدة MariaDB وبيانات اصطناعية مؤقتة فقط، وتعيد تشغيل seed مرتين لكشف مشكلات التكرار. لا يُدمج PR إذا فشل أي فحص. تفعيل Required Checks على مستوى إعدادات GitHub يبقى مطلوبًا متى سمحت خطة المستودع بذلك.

## Merge Policy

لا يدمج PR قبل تحقق Acceptance Criteria والاختبارات والبناء والمراجعة وRequired Checks وحل التعارضات. استخدم استراتيجية المستودع؛ وعند غيابها استخدم Squash and Merge للأعمال المناسبة للحفاظ على تتبع واضح. بعد الدمج تحقق من حالة PR وإغلاق Issue ووجود النتيجة على `origin/develop`.

## Security Policy

افحص قبل كل push عدم وجود `.env` أو passwords أو tokens أو API keys أو private keys أو certificates أو database dumps أو production credentials. بيانات التطوير المعلنة لا تستخدم في الإنتاج. إذا وجد secret في التاريخ، لا تنشر قيمته؛ افتح Incident لإزالته بالطريقة المناسبة وتدويره ومراجعة أثره، فحذف أحدث نسخة وحده غير كافٍ.

كل إجراء إداري جديد يحتاج صلاحية `resource.action` مفروضة في Backend واختبار direct API access. لا تعرض أو تخزن scope لا يفرضه الخادم فعليًا.

## Database Migration Policy

كل تغيير مخطط في migration مستقلة مرتبة ومراجعة. يجب أن تكون حتمية ولا تستورد كتالوجًا حيًا قد يتغير بعد إصدارها. اختبر `up` و`down` على نسخة قابلة للاستعادة، ووثق data migration والتوافق وترتيب الاعتماد. لا تعدل migration مطبقة في بيئة مشتركة؛ أضف migration تصحيحية.

## UI Screenshot Policy

المراجع المحلية تبقى للقراءة في `_reference/` ولا تدخل المنتج. تحفظ تجهيزات الالتقاط في `tmp/reference-render/`. لا ينسخ شعار أو علم أو اسم جهة أو محتوى رسمي إماراتي. أرفق في PR اللقطات الضرورية للمراجعة فقط، ولا ترفع مخرجات مقارنة مولدة ضخمة دون حاجة موثقة.

## Release Policy

العمل اليومي ينتهي في `develop`. النقل من `develop` إلى `main` Release منفصلة وصريحة، لها Issue/PR وفحوص الإصدار وخطة migration/rollback. لا يدفع مباشرة إلى `main` ولا تنفذ Release ضمن تسوية العمل اليومي تلقائيًا.
