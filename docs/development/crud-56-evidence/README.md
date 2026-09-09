# أدلة واجهة CRUD — #56

لقطات Playwright لبيانات اصطناعية في قاعدة اختبار مستقلة. تستخدم الواجهة والصلاحيات وREST الحقيقي؛ منح حساب الاختبار صريحة ولا تغير منح المستخدمين القائمين.

- [وثيقة بثلاثة عناصر مستقلة بعد تحرير الثاني](amendment-elements-desktop.png).
- [مادة معطلة إدارياً على عرض 320px، مع بقاء حالة المسودة مستقلة](disabled-article-mobile.png).
- [إدارة أعداد الجريدة](gazettes-desktop.png).
- [نافذة إضافة مصدر فوق طابور الاستيراد](import-add-dialog-desktop.png).
- [نافذة إضافة وثيقة تعديل على الهاتف](amendment-add-dialog-mobile.png).
- [فصل الحالة القانونية وسير العمل والحالة الإدارية مع ظهور الحذف](legislation-states-desktop.png).
- [إجراءات المصدر ظاهرة فوق تفاصيل الاستيراد على الهاتف](source-actions-mobile.png).

المصفوفة ونتائج الحفظ والصلاحيات والقيود: [crud-coverage.md](../../crud-coverage.md).

إعادة الاختبار: تشغيل migrations وseed في قاعدة اختبار، ثم `npm run build` و`npm run test:e2e -- --workers=1`. يضيف ملف `tests/e2e/crud-coverage.spec.ts` حساباً ودوراً ومصدراً خاصاً بكل fixture، وينظف سجلاته فقط. لا تشغّل عدة مجموعات تعدل قاعدة الاختبار نفسها بالتوازي.

مسار الالتقاط `npm run visual:admin` يقرأ `VISUAL_BASE_URL` و`VISUAL_ADMIN_USERNAME` و`VISUAL_ADMIN_PASSWORD`، وينتج manifest ولقطات محلية في `artifacts/admin-ui`. يتحقق من 144 عرضاً على ثلاثة أحجام، ويخفق عند overflow أو خطأ شبكة/متصفح. لا تنفذ build أثناء الالتقاط لأن preview يقرأ مجلد المخرجات نفسه.
