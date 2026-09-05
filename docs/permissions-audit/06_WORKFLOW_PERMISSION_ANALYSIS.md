# تحليل صلاحيات دورة العمل

## دورة حياة التشريع الفعلية

الحالات المعرفة في قاعدة البيانات/الكود:

`INBOX`, `DRAFT`, `IN_REVIEW`, `APPROVED_FOR_PUBLISHING`, `PUBLISHED`, `AMENDED`, `REPEALED`, `SUSPENDED`, `ARCHIVED`.

الانتقالات التي ينفذها المستخدم فعليًا:

```text
INBOX
  └─ legislation.submit حاليًا (المقترح legislation.prepare) ─→ DRAFT

DRAFT
  └─ legislation.submit ─→ IN_REVIEW

IN_REVIEW
  ├─ legislation.submit حاليًا (المقترح legislation.return) ─→ DRAFT
  └─ legislation.approve ─→ APPROVED_FOR_PUBLISHING

APPROVED_FOR_PUBLISHING
  └─ legislation.publish ─→ PUBLISHED

PUBLISHED / AMENDED / REPEALED / SUSPENDED
  └─ legislation.archive ─→ ARCHIVED
```

لا توجد انتقالات فعلية لـreject أو unpublish أو restore أو delete. ولذلك لا تُقترح مفاتيح لها. `WorkflowDto` يقبل فقط DRAFT/IN_REVIEW/APPROVED_FOR_PUBLISHING/PUBLISHED/ARCHIVED، والـservice يحدد المفتاح الدقيق بعد قراءة الحالة الحالية.

### التوصية

| Actual operation           | Current               | Proposed              | Reason                      |
| -------------------------- | --------------------- | --------------------- | --------------------------- |
| Prepare inbox              | `legislation.submit`  | `legislation.prepare` | عمل إدخال لا إرسال للمراجعة |
| Submit draft               | `legislation.submit`  | KEEP                  | المعنى مطابق                |
| Return from review         | `legislation.submit`  | `legislation.return`  | قرار مراجع مستقل            |
| Approve                    | `legislation.approve` | KEEP                  | فصل واجبات                  |
| Publish                    | `legislation.publish` | KEEP                  | أثر عام حرج                 |
| Archive public/legal state | `legislation.archive` | KEEP                  | لا restore حاليًا           |

## الحالة القانونية مقابل حالة النشر

يوجد حقل `legalStatus` بقيم منها `IN_FORCE`, `AMENDED`, `PARTIALLY_REPEALED`, `REPEALED`, `SUSPENDED`. تعديله في تشريع منشور يتم حاليًا عبر `legislation.update_published_metadata`.

- **repeal**: إلغاء/إنهاء أثر قانوني، مع بقاء السجل منشورًا للتاريخ القانوني.
- **unpublish**: سحب العرض العام؛ غير مطبق.
- **archive**: نقل record من دورة المحتوى إلى ARCHIVED؛ لا يعني بالضرورة الإلغاء القانوني.
- **revoke**: لا يظهر كعملية Amendment في الكتالوج الحالي، رغم وروده في baseline المقدم. لا ينبغي استعماله مرادفًا لـrepeal أو unpublish.

القرار: إبقاء `legislation.published_metadata.update` لتصحيح metadata/status القانوني حاليًا، مع validation صريح. إذا أضيف لاحقًا endpoint قانوني مستقل لتغيير status، يعاد تقييم مفتاح مثل `legislation.legal_status.update`؛ لا يُضاف الآن.

## فصل الواجبات في التشريع

سياسات فعلية:

- منع المستخدم من اعتماد تشريع شارك في عمله.
- منع المستخدم من نشر تشريع شارك في عمله.
- يمكن تعطيل السياسة عالميًا أو منح استثناء لمستخدم بعينه.

الـservice يفرضها وليس React فقط. الاستثناءات تطبق كقدرات خاصة بعد direct overrides، ولذلك يمكنها تجاوز DENY مماثل لو وُجد مفتاح بنفس الاسم. ينبغي فصلها عن RBAC ومنع إسنادها عبر role catalog.

## دورة التعديل التشريعي

```text
DRAFT
  └─ amendment.review ─→ REVIEWED

REVIEWED
  └─ amendment.publish ─→ PUBLISHED
       └─ يطبّق ADD | REPLACE | DELETE | REPEAL | RENUMBER | CORRECT
          وينشئ/يحدّث النسخة الزمنية للمادة
```

| Capability searched                     |     Exists? | Conclusion                    |
| --------------------------------------- | ----------: | ----------------------------- |
| view/list                               |         نعم | `amendment.view`              |
| create                                  |         نعم | `amendment.create`            |
| edit amendment metadata/text            | لا endpoint | لا Permission جديدة           |
| link affected article/source            |  ضمن create | `amendment.create`            |
| review                                  |         نعم | `amendment.review`            |
| approve separate from review            |          لا | لا Permission                 |
| publish/apply                           |         نعم | `amendment.publish`، critical |
| revoke/unpublish/archive/restore/delete |          لا | لا Permission                 |

`REPEAL` هنا نوع عملية قانونية تطبق على المادة، وليس سحب نشر Amendment. لا يوجد `amendment.revoke` فعلي في catalog أو controller أو service الحالي.

سياسات الفصل تمنع منشئ التعديل من مراجعته، وتمنع المشارك في إنشائه/مراجعته من نشره، مع استثناءات policy-controlled.

## Article

- view الإداري يتم ضمن aggregate التشريع المحمي بـ`legislation.view`؛ لا endpoint admin standalone للعرض.
- text update وmetadata update كلاهما بـ`article.update`.
- `sortKey` و`structureNodeId` يجعلان reorder/move جزءًا من update الفعلي.
- create يتم ضمن تحويل المصدر إلى draft كعملية مركبة؛ لا endpoint article create.
- delete/restore/clone غير موجودة.

لذلك يُبقى `article.update` فقط في النموذج الحالي، ولا تُخترع view/create/delete/reorder مستقلة. يمكن فصل move/reorder مستقبلًا فقط إذا ظهرت واجهة/endpoint مستقل أو خطر مختلف.

## Annex / Source / Attachment

- `source_document` هو ملف مصدر أصلي مع upload، extraction، review، metadata/file view.
- `annex` سجل قانوني مرتبط بتشريع ويشير إلى `sourceDocumentId`; لا يرفع ملفًا بذاته.
- لا يوجد resource مستقل باسم attachment/media/file في المسارات الإدارية.
- إنشاء Annex يربطه بمصدر موجود؛ لا توجد replace-file/delete/reorder endpoints.
- حالات Annex الفعلية DRAFT/PUBLISHED/REPLACED/REPEALED وتحتاج مفاتيح منفصلة بسبب أثرها.

## Relation / Reference / Structure

- Relation علاقة قانونية بين تشريعين وحالة مراجعتها UNREVIEWED/REVIEWED/REJECTED. Proposed create/update/review.
- Reference هو abstraction لأنواع التشريعات والجهات والموضوعات، وليس كل جدول منها resource صلاحيات مستقل. Proposed view/create/update.
- Structure عقد الأبواب/الفصول/الأقسام. parent/sortKey يجعل move/reorder ضمن update. Proposed create/update؛ لا delete.

## Workflow Policy

العمليات الحقيقية: عرض السياسات، تحديث enabled، واستبدال قائمة مستخدمي الاستثناء. لا create/delete/activate منفصلة لأن catalog السياسات ثابت في الكود. المقترح:

- `workflow_policy.update` لقراءة/تحديث policy (أو السماح بالقراءة عبر settings.view بعد تنقيح payload).
- `workflow_policy.overrides.manage` لإضافة/إزالة المستثنين، critical.

يلزم منع تحديث مجموعة WORKFLOW من endpoint settings العام حتى تبقى الاستثناءات والسياسة من تبويب السياسة الوحيد كما تقتضي بنية المشروع.
