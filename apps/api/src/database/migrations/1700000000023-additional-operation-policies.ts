import type { MigrationInterface, QueryRunner } from "typeorm";
export class AdditionalOperationPolicies1700000000023 implements MigrationInterface {
  name = "AdditionalOperationPolicies1700000000023";
  async up(q: QueryRunner) {
    const entries = [
      [
        "workflow.enforce_active_synonym_history",
        "حماية تفعيل وتعطيل مرادفات القاموس المنشور",
      ],
      [
        "workflow.enforce_active_amendment_operations",
        "حماية تفعيل وتعطيل عناصر التعديل المنشور",
      ],
      [
        "workflow.enforce_create_article_reviewed",
        "اشتراط المسودة لإضافة مادة قبل النشر",
      ],
    ];
    for (const [key, label] of entries)
      await q.query(
        "INSERT INTO platform_settings (setting_key,group_code,label_ar,input_type,value_json,is_public) VALUES (?,'WORKFLOW',?,'BOOLEAN','true',FALSE)",
        [key, label],
      );
  }
  async down(q: QueryRunner) {
    const keys = [
      "workflow.enforce_active_synonym_history",
      "workflow.enforce_active_amendment_operations",
      "workflow.enforce_create_article_reviewed",
    ];
    for (const key of keys)
      await q.query("DELETE FROM platform_settings WHERE setting_key=?", [key]);
  }
}
