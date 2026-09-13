# تقرير اختبار إدارة ربط المواد

تاريخ التنفيذ: 2026-09-06.

## التغطية المضافة

### Backend integration

يغطي `article-assignment.integration.spec.ts`:

- مادة واحدة، عشر مواد، و500 مادة.
- empty selection، duplicate IDs، وoverlap.
- مادة وعقدة مفقودتان.
- مادة أو عقدة من تشريع آخر.
- نقل مواد مرتبطة، فك الربط، وإعادة الطلب نفسه.
- lifecycle للتشريع ولنسخة المادة.
- rollback حقيقي عند فشل كتابة لاحقة داخل المعاملة.
- Audit موجز وحالة القائمة الخفيفة والبحث/الفلترة.

### Frontend component

يغطي `ArticleAssignmentDialog.spec.tsx` فتح المنتقي، الموقع الحالي، البحث، الفلاتر، تحديد/إلغاء الظاهر، نطاق ترتيب الوثيقة، حفظ عدة مواد، تأكيد النقل، payload الدفعي، وبقاء النافذة مع server error.

### E2E

ينشئ `article-assignment.spec.ts` تشريعًا اصطناعيًا معزولًا في قاعدة الاختبار، وينظفه بعد التنفيذ، ثم يغطي:

1. ربط مادة غير مرتبطة بفصل.
2. نقل مادتين من فصل إلى فصل آخر مع التأكيد.
3. تحديث تفاصيل العقدة والشجرة.
4. refresh والتحقق من بقاء الربط ومن عدم وجود duplicate parent.
5. إخفاء الإجراء عن `LEGAL_REVIEWER`.
6. رفض API مباشرة بـ403، ورفض طلب بلا جلسة بـ401.
7. لقطة desktop وmobile وفحص عدم وجود overflow أفقي.

## النتائج

| المسار                         | الأمر                                                                                                                | النتيجة                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Lint / TypeScript              | `npm run lint`                                                                                                       | ناجح في API وWorker وWeb                                           |
| جميع اختبارات المستودع         | `npm test`                                                                                                           | 101/101: API ‏70، Web ‏6، Worker ‏25                               |
| Backend assignment integration | `npm run test -w @ylp/api -- article-assignment.integration.spec.ts`                                                 | 13/13 ناجح؛ شمل 1 و10 و500 مادة                                    |
| Frontend assignment component  | `npm run test -w @ylp/web -- ArticleAssignmentDialog.spec.tsx`                                                       | 3/3 ناجح                                                           |
| Assignment E2E                 | `npx playwright test tests/e2e/article-assignment.spec.ts --project=desktop-1440`                                    | 1/1 ناجح                                                           |
| Import regression + assignment | `npx playwright test tests/e2e/import-structure.spec.ts tests/e2e/article-assignment.spec.ts --project=desktop-1440` | 2/2 ناجح                                                           |
| E2E الكاملة المعزولة           | `YLP_TEST_API_PORT=4102 YLP_TEST_WEB_PORT=4275 npm run test:e2e -- --workers=1`                                      | 53 ناجح، 47 متخطى وفق شروط مصفوفة المشاريع، 0 فشل                  |
| Build                          | `npm run build`                                                                                                      | ناجح في API وWorker وWeb                                           |
| Infrastructure                 | `npm run test:infra`                                                                                                 | ناجح                                                               |
| الإدارة البصرية                | `npm run visual:admin`                                                                                               | 24 لقطة؛ overflow=0؛ لا console errors أو failed/external requests |

شملت اختبارات Backend رفض الربط عبر التشريعات، وفشل العقدة أو المادة غير الموجودة، ورفض lifecycle، والـrollback الكامل عند فشل خطوة لاحقة في المعاملة. وشمل E2E النقل ثم refresh والتحقق من بقاء parent واحدة فقط، وإخفاء الإجراء ورفض API بـ403 عند غياب `article.update`.

أظهر تشغيل E2E أولي على خادم التطوير المشترك حالتي `429` قديمتين في اختبارات المصادقة بعد استهلاك bucket الخادم من تشغيلات سابقة. أُعيدت المصفوفة كاملة على API وWeb معزولين بحد الاختبار المعرّف في `playwright.config.ts`، فنجحت النتيجة النهائية أعلاه دون تعديل سياسة الإنتاج.
