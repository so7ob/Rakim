import type { MigrationInterface, QueryRunner } from "typeorm";

export class WorkflowPolicyCatalog1700000000009 implements MigrationInterface {
  name = "WorkflowPolicyCatalog1700000000009";

  async up(q: QueryRunner): Promise<void> {
    const settings = [
      [
        "workflow.enforce_import_review_separation",
        "لا يجوز للمستورد مراجعة المصدر الذي رفعه",
      ],
      [
        "workflow.enforce_publication_separation",
        "لا يجوز لمن شارك في إعداد التشريع أو مراجعته أن ينشره",
      ],
      [
        "workflow.enforce_amendment_review_separation",
        "لا يجوز لمن أنشأ التعديل أن يراجعه",
      ],
      [
        "workflow.enforce_amendment_publication_separation",
        "لا يجوز لمن أنشأ أو راجع التعديل أن ينشره",
      ],
    ];
    for (const [key, label] of settings)
      await q.query(
        `INSERT INTO platform_settings
        (setting_key,group_code,label_ar,input_type,value_json,is_public)
        VALUES (?,'WORKFLOW',?,'BOOLEAN','true',FALSE)`,
        [key, label],
      );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM platform_settings WHERE setting_key IN (
      'workflow.enforce_import_review_separation',
      'workflow.enforce_publication_separation',
      'workflow.enforce_amendment_review_separation',
      'workflow.enforce_amendment_publication_separation')`,
    );
  }
}
