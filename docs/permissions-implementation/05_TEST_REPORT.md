# تقرير الاختبارات والتحقق

## تغطية الاختبارات

| المجال                | التحقق                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| Catalog               | 75 مفتاحًا فريدًا، metadata والنطاق، SUPER=75، وفصل قدرات policy                                    |
| Migration DB          | العدد الفعلي، 18 legacy، exact role sets، حماية SUPER، وعدم وجود policy codes في catalog            |
| Effective permissions | role inheritance، direct allow، direct deny precedence، explanation، policy separation              |
| Authority             | self/peer/higher escalation، create-with-SUPER، grant ceiling، protected role، last protected admin |
| Concurrency           | محاولتا تعطيل متزامنتان للمدير المحمي ترفضان ويبقى الحساب فعالًا                                    |
| Persistence           | PATCH direct/role grants ثم GET، تسجيل دخول جديد، Refresh، enforcement، ثم restore                  |
| Scopes                | `OWN` مرفوض؛ `ALL` وحده مقبول                                                                       |
| Workflow              | view/update/overrides منفصلة، system admin redaction و403، SUPER policy-only grant/restore          |
| Public visibility     | draft article/history/annex/file، unreviewed relation، draft target، index/search/analytics/CSV     |
| Frontend              | routes/sidebar/buttons/tabs بالمفاتيح canonical، RTL، keyboard، overflow، axe A/AA                  |

## النتائج

- `npm run lint`: ناجح.
- `npm run build`: ناجح للحزم API وworker وweb.
- `npm test`: ناجح؛ API **54/54**، web **2/2**، worker **7/7**.
- Playwright الكامل على desktop/tablet/mobile: **51 passed، 41 skipped بحسب شروط المشاريع، 0 failed**. وتشمل نتيجة desktop RBAC **8/8** بعد تصحيح الاختبار ليستخدم CSRF المدور من `/auth/status`؛ لذلك أصبحت حالات 403 ناتجة من policy نفسها لا من CSRF.
- `visual:admin`: التُقطت 21 شاشة عبر desktop/tablet/mobile؛ overflow=0 ولا console/request/external errors.
- `visual:workflow`: التُقط viewportان (1440 و390)؛ لا overflow ولا console/request failures.
- `visual:compare`: نجح وأنشأ 168 overlay/difference comparison.
- فحص WCAG الآلي وkeyboard/focus والمسارات RTL ناجح ضمن Playwright.
- `test:infra`: تكوين Nginx وsystemd ناجح.
- `test:performance`: 50 دورة، average 13.75ms وp95 18.67ms وmax 26.87ms مقابل هدف 2000ms.
- migration `up/down/up`: ناجح مع تطابق digests بعد rollback.

استُخدمت منافذ اختبار منفصلة لأن خادم تطوير للمستخدم كان قائمًا على `4000/5173`؛ لم يُوقف أو يُعدّل ذلك الخادم. كشف تشغيل مبكر أمرين في بيئة الاختبار وأُغلقا: تجاوز rate limit عند تكرار 92 اختبارًا، فرفع أمر Playwright حد خادمه المعزول فقط؛ واستخدام CSRF قديم بعد endpoint يقوم بالتدوير، فصحح الاختبار. لا يتغير حد التشغيل العادي ولا حماية CSRF.

## مشكلة حفظ الصلاحيات

كان الالتباس مرتبطًا بخلط projection الوصول ضمن payload المستخدم/الدور وبقاء session/query state قديمًا بعد mutation. أصبح الحفظ يستخدم endpoints مخصصة، transaction، canonical IDs/keys وduplicate constraints، ثم يُبطل جلسات المتأثرين ويعيد GET مستقلًا. يثبت E2E بقاء direct grant وrole inheritance بعد GET/login/Refresh وإزالتهما بعد restore. لا يوجد فقد persistence في النتيجة الحالية.

## قيود الاختبار

- لم تُنفذ mutation على production؛ الاستعمال كان على قاعدة التطوير بعد backup.
- اختبار current-session self-change غير قابل للتنفيذ عمدًا لأن no-self-change يرفض الطلب قبل mutation؛ اختُبر الرفض بدلًا منه.
- لا يختبر هذا الإصدار `OWN/ASSIGNED` لأنها غير مفعلة أصلًا.
