# تقرير ترحيل RBAC

## الحماية المسبقة

- أُنشئت نسخة احتياطية قبل الترحيل في `/root/legislations/data/backups/20260905T182433Z`.
- لم تُحذف ملفات أو أسرار أو بيانات مستخدمين.
- الترحيل: `CanonicalRbacSecurity1700000000012`، إضافي في مسار `up` ويحتفظ بالـlegacy definitions.

## Before

| المقياس                              | القيمة                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Permission definitions               | 56؛ digest مختصر `681af6ab1fcb`                                                           |
| Legacy markers                       | غير موجودة قبل إضافة الأعمدة                                                              |
| Roles/grants                         | READER 0، DATA_ENTRY 15، LEGAL_REVIEWER 13، CONTENT_MANAGER 24، SYSTEM_ADMIN 30، SUPER 56 |
| SUPER                                | `is_system=0`، غير محمي                                                                   |
| Users                                | 7، النشطون 7؛ aggregate digest `8012f3600858`                                             |
| Direct overrides / policy exceptions | 0 / 0 في snapshot التطوير                                                                 |

## Up result

| المقياس                          | القيمة                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| Definitions الكلية               | 93                                                                                        |
| Canonical active/non-legacy      | **75**                                                                                    |
| Legacy retained                  | **18**                                                                                    |
| Invalid/non-ALL canonical scopes | **0**                                                                                     |
| Policy capabilities داخل RBAC    | **0**                                                                                     |
| Role grants                      | READER 0، DATA_ENTRY 18، LEGAL_REVIEWER 15، CONTENT_MANAGER 36، SYSTEM_ADMIN 36، SUPER 75 |
| SUPER                            | system + protected، authority 1000، model version 2                                       |

قورنت كل مجموعة role grants بالمصفوفة المعتمدة: missing=0 وextra=0 لكل الأدوار القياسية. تحافظ الأدوار المخصصة على semantics محافظة، وتحوّل direct overrides القديمة إلى canonical؛ non-ALL ALLOW لا يُرقّى إلى ALL، وDENY المتعارض يفوز. نُقلت أسماء قدرات workflow القديمة إلى dot notation داخل مخزن policy فقط.

## Rollback rehearsal

ينشئ الترحيل قبل أي mutation خمس جداول snapshot داخل قاعدة البيانات لتعريفات الصلاحيات، role grants، direct overrides، policy capabilities، وmetadata الأدوار. نُفذ `down` فعليًا في بيئة التطوير وكانت النتيجة:

- تعريفات الصلاحيات وdigests كل role grants وusers/direct/policy مطابقة للـbaseline.
- اختفت أعمدة وفهارس 0012 وجداول snapshot الخمسة بعد الاستعادة.
- كان migration `ReferenceThemeDefaults0011` موجودًا مسبقًا ولم يكن جزءًا من RBAC؛ عند rehearsal أرجع CLI آخر migrationين بالتتابع للوصول إلى baseline، ثم أعاد تطبيقهما. هذه ملاحظة تشغيلية لترتيب TypeORM وليست فقد بيانات.

بعد نجاح المقارنة، أُعيد تطبيق migrations وseed التطوير، وأصبح 0012 هو migration RBAC المطبق.

## Effective-permission compatibility

القراءة القديمة مؤقتة ومحدودة:

- role legacy aliases تُقرأ فقط عندما `permission_model_version<2`.
- direct overrides القديمة تُحوّل عند القراءة إن كان التعريف legacy.
- كل كتابة جديدة تتحقق من canonical/non-legacy و`ALL` فقط.
- `permissionDetails` يفسر مصادر role/direct وDENY، بينما قدرات policy منفصلة.

الإزالة النهائية للـ18 تعريفًا وdual-read ليست جزءًا من هذا الإصدار وتتطلب migration وإقرار rollback جديدين.
