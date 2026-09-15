import type { MigrationInterface, QueryRunner } from "typeorm";
export class OperationPolicies1700000000021 implements MigrationInterface {
  name = "OperationPolicies1700000000021";
  async up(q: QueryRunner) {
    await q.query(
      `UPDATE platform_settings SET value_json=JSON_QUOTE('منصة رقيم') WHERE setting_key='branding.site_name'`,
    );
    const settings = [
      [
        "workflow.enforce_delete_legislation_history",
        "حماية التشريع خارج المسودة من الحذف",
      ],
      [
        "workflow.enforce_delete_legislation_versions",
        "حماية نسخ التشريع المعتمدة والمنشورة من الحذف",
      ],
      [
        "workflow.enforce_delete_article_history",
        "حماية نسخ المواد المنشورة والتاريخية من الحذف",
      ],
      [
        "workflow.enforce_delete_annex_history",
        "حماية الملاحق المنشورة والتاريخية من الحذف",
      ],
      [
        "workflow.enforce_delete_amendment_history",
        "حماية وثائق التعديل المراجعة والمنشورة من الحذف",
      ],
      [
        "workflow.enforce_delete_reviewed_relation",
        "حماية العلاقات القانونية المعتمدة من الحذف",
      ],
      [
        "workflow.enforce_delete_published_page",
        "حماية الصفحات المنشورة والمؤرشفة من الحذف",
      ],
      [
        "workflow.enforce_delete_synonym_history",
        "حماية قواميس المرادفات المنشورة والمؤرشفة من الحذف",
      ],
      [
        "workflow.enforce_edit_legislation_history",
        "حماية نص التشريع المنشور؛ الاستثناء ينشئ مسودة تصحيح",
      ],
      [
        "workflow.enforce_edit_article_history",
        "حماية نص المادة المنشور؛ الاستثناء ينشئ مسودة تصحيح",
      ],
      [
        "workflow.enforce_edit_annex_history",
        "حماية بيانات الملحق المنشور؛ الاستثناء ينشئ مسودة تصحيح",
      ],
      [
        "workflow.enforce_edit_amendment_reviewed",
        "حماية وثيقة التعديل بعد مراجعتها؛ الاستثناء يعيدها للمراجعة",
      ],
      [
        "workflow.enforce_edit_synonym_history",
        "حماية القاموس المنشور؛ الاستثناء ينشئ نسخة مسودة",
      ],
      [
        "workflow.enforce_edit_legislation_sources",
        "حماية ارتباطات مصادر التشريع بعد مرحلة المسودة",
      ],
      [
        "workflow.enforce_legislation_reviewed_source",
        "اشتراط مراجعة المصدر قبل نشر التشريع",
      ],
      [
        "workflow.enforce_annex_reviewed_source",
        "اشتراط مراجعة المصدر قبل نشر الملحق",
      ],
      [
        "workflow.enforce_amendment_reviewed_source",
        "اشتراط مراجعة المصدر لوثيقة التعديل",
      ],
      [
        "workflow.enforce_legislation_workflow_order",
        "الالتزام بترتيب مراحل اعتماد التشريع ونشره",
      ],
      [
        "workflow.enforce_amendment_workflow_order",
        "اشتراط مراجعة وثيقة التعديل قبل النشر",
      ],
      [
        "workflow.enforce_active_legislation_workflow",
        "اشتراط تفعيل التشريع لمتابعة سير العمل",
      ],
      [
        "workflow.enforce_active_parent",
        "اشتراط تفعيل الأصل قبل تفعيل السجل التابع",
      ],
    ];
    for (const [key, label] of settings)
      await q.query(
        `INSERT INTO platform_settings
 (setting_key,group_code,label_ar,input_type,value_json,is_public)
 VALUES (?,'WORKFLOW',?,'BOOLEAN','true',FALSE)`,
        [key, label],
      );
    await q.query(
      "ALTER TABLE deletion_batches ADD COLUMN policy_checks_json JSON NULL",
    );
    await q.query(
      "DROP TRIGGER IF EXISTS trg_article_versions_no_published_delete",
    );
    await q.query(`CREATE TRIGGER trg_article_versions_no_published_delete BEFORE DELETE ON article_versions FOR EACH ROW
 BEGIN IF OLD.status <> 'DRAFT' AND COALESCE(@ylp_maintenance,0) <> 1 AND NOT EXISTS (
 SELECT 1 FROM deletion_batch_items i JOIN deletion_batches b ON b.id=i.batch_id
 JOIN articles a ON a.id=OLD.article_id
 WHERE i.item_kind='article_versions' AND i.item_id=OLD.id
 AND b.status='PURGING' AND b.policy_checks_json IS NOT NULL AND a.deleted_at IS NOT NULL
 AND JSON_CONTAINS(b.policy_checks_json, JSON_OBJECT('code','DELETE_ARTICLE_HISTORY','applies',true,'allowed',true))
 ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLISHED_ARTICLE_VERSION_DELETE_FORBIDDEN'; END IF; END`);
  }
  async down(q: QueryRunner) {
    await q.query(
      "DROP TRIGGER IF EXISTS trg_article_versions_no_published_delete",
    );
    await q.query(`CREATE TRIGGER trg_article_versions_no_published_delete BEFORE DELETE ON article_versions FOR EACH ROW
 BEGIN IF OLD.status <> 'DRAFT' AND COALESCE(@ylp_maintenance,0) <> 1 THEN SIGNAL SQLSTATE '45000'
 SET MESSAGE_TEXT='PUBLISHED_ARTICLE_VERSION_DELETE_FORBIDDEN'; END IF; END`);
    await q.query(
      "ALTER TABLE deletion_batches DROP COLUMN policy_checks_json",
    );
    const keys = [
      "workflow.enforce_delete_legislation_history",
      "workflow.enforce_delete_legislation_versions",
      "workflow.enforce_delete_article_history",
      "workflow.enforce_delete_annex_history",
      "workflow.enforce_delete_amendment_history",
      "workflow.enforce_delete_reviewed_relation",
      "workflow.enforce_delete_published_page",
      "workflow.enforce_delete_synonym_history",
      "workflow.enforce_edit_legislation_history",
      "workflow.enforce_edit_article_history",
      "workflow.enforce_edit_annex_history",
      "workflow.enforce_edit_amendment_reviewed",
      "workflow.enforce_edit_synonym_history",
      "workflow.enforce_edit_legislation_sources",
      "workflow.enforce_legislation_reviewed_source",
      "workflow.enforce_annex_reviewed_source",
      "workflow.enforce_amendment_reviewed_source",
      "workflow.enforce_legislation_workflow_order",
      "workflow.enforce_amendment_workflow_order",
      "workflow.enforce_active_legislation_workflow",
      "workflow.enforce_active_parent",
    ];
    for (const key of keys)
      await q.query("DELETE FROM platform_settings WHERE setting_key=?", [key]);
  }
}
