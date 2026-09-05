# تقرير تسوية Git

تاريخ التدقيق: 5 سبتمبر 2026. هذا جرد لنقطة بدء الحوكمة، وليس إعادة بناء للتاريخ القديم.

## Baseline

- Production Branch: `main` عند `92d8f2b`.
- Development Branch: `develop`، أنشئ من `main` عند `92d8f2b` بعد تأكيد عدم وجود فرع تطوير قائم.
- Default Branch على GitHub: `main`، والوصول الحالي بصلاحية `ADMIN`.

## الحالات الحية المكتشفة

| العمل                                   | الحالة الأصلية                                  | Issue | Branch                                                       | PR          | النتيجة                                                    |
| --------------------------------------- | ----------------------------------------------- | ----- | ------------------------------------------------------------ | ----------- | ---------------------------------------------------------- |
| إعدادات الموقع والواجهة العامة المرجعية | commit مرفوعة فريدة مع تغييرات محلية لاحقة      | #1    | `feature/uae-reference-ui-fidelity`؛ سيعاد تسميته برقم Issue | لم يفتح بعد | اختبارات ناجحة؛ يحتاج فصل الأصول الرسمية وPR إلى `develop` |
| سياسات فصل الواجبات                     | تغييرات محلية غير ملتزمة + migrations 0008/0009 | #2    | ينتظر فصل #1                                                 | لم يفتح بعد | ناجحة اختباريًا؛ تنتظر الفصل بحسب الاعتماد                 |
| RBAC تفصيلي وواجهة الإدارة              | تغييرات محلية غير ملتزمة + migrations 0010/0011 | #3    | ينتظر #1 ثم #2                                               | لم يفتح بعد | مانع مراجعة: scopes غير مفروضة وmigration غير حتمية        |
| حوكمة Git/GitHub                        | ملفات مطلوبة بهذه التسوية                       | #4    | `chore/4-git-governance`                                     | #5          | مفتوحة ومتحققة محليًا؛ تنتظر Checks وMerge                 |

## Uncommitted Changes

وجدت 62 ملفًا متتبعًا معدلًا، وملفات مصدر/اختبار/توثيق جديدة، إضافة إلى `_reference/` و`artifacts/` محليين. لا توجد تغييرات staged. أنشئ `stash@{0}` باسم `reconciliation-recovery-2026-09-05-before-governance` ثم أعيد تطبيقه بنجاح؛ وهو لقطة استرداد وليس مخرجًا نهائيًا.

## Unpushed Commits

لا توجد commits محلية غير مرفوعة. الفرع الحالي يطابق `origin/feature/uae-reference-ui-fidelity` عند `e7f7aae`، وهو commit واحدة أمام `main` و`develop`.

## Branches ذات Unique Work

- `feature/uae-reference-ui-fidelity`: commit فريدة `e7f7aae` وتغييرات working tree كبيرة. تحتوي commit على ZIP ولقطات مرجع إماراتي؛ لا تدخل كأصل أب في `develop`. تستخدم Squash PR مع استبعاد المحتوى الرسمي، ثم يحذف الفرع فقط بعد تحقق الدمج.
- لا توجد فروع أخرى ذات عمل فريد بعد `fetch --all --prune`.

## Open PRs

لم توجد PRs مفتوحة أو مغلقة عند بدء التسوية، ولم يكن الفرع الحالي مرتبطًا بـPR.

## Stashes ذات Work مفيد

- `stash@{0}`: لقطة استرداد كاملة للعمل الحي قبل الحوكمة، تبقى حتى إتمام الفصل والدمج والتحقق.

## الأعمال التي تم دمجها إلى Development

لا شيء حتى الآن؛ Issues #1 و#2 و#3 و#4 تمثل كل العمل الحي المعروف.

## التحقق المنفذ

- `npm run lint`: ناجح.
- `npm test`: 38 اختبارًا ناجحًا.
- `npm run build`: ناجح.
- `npm run test:e2e -- --workers=1`: 50 ناجحًا، 38 skipped مقصودة، صفر فشل.
- `npm run test:infra`: ناجح.
- `npm run db:migrate`: ناجح، لا migrations معلقة.
- `visual:admin`: 21 لقطة؛ صفر overflow/console/network/external requests.
- `visual:workflow`: حجمان؛ صفر overflow/console/network errors.
- `visual:implementation`: 56 زوج صفحة/حجم؛ صفر overflow/console/network errors.
- `git diff --check`: ناجح.

## الأعمال المتبقية

1. إنهاء PR #5 للحوكمة ودمجها.
2. فصل #1 و#2 و#3 وفق ترتيب الاعتماد دون فقد العمل.
3. إصلاح رفض scopes غير المدعومة وجعل migrations حتمية، ثم إعادة الاختبارات.
4. استبعاد `_reference/` ولقطات/ZIP الهوية الرسمية والمخرجات الضخمة من المنتج والـPRs.
5. مراجعة Checks وSquash Merge كل عمل إلى `develop`.
6. حذف stash وفرع العمل فقط بعد تحقق وصول كل عمل مطلوب إلى `origin/develop`.
