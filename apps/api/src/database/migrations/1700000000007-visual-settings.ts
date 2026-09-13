import type { MigrationInterface, QueryRunner } from "typeorm";

export class VisualSettings1700000000007 implements MigrationInterface {
  name = "VisualSettings1700000000007";
  async up(q: QueryRunner): Promise<void> {
    const settings = [
      [
        "theme.page_background",
        "COLORS",
        "خلفية صفحات المنصة",
        "COLOR",
        "#FBFBFC",
      ],
      [
        "theme.hero_background_url",
        "BACKGROUND",
        "صورة خلفية الرؤوس",
        "URL",
        "",
      ],
      [
        "typography.legal_size",
        "TYPOGRAPHY",
        "حجم النص القانوني بالبكسل",
        "TEXT",
        "22",
      ],
      [
        "tabs.overview_label",
        "TABS",
        "اسم تبويب نص التشريع",
        "TEXT",
        "نص التشريع",
      ],
      [
        "tabs.modifications_label",
        "TABS",
        "اسم تبويب التعديلات",
        "TEXT",
        "التعديلات",
      ],
      [
        "tabs.regulations_label",
        "TABS",
        "اسم تبويب اللوائح",
        "TEXT",
        "اللوائح والجداول",
      ],
      ["tabs.related_label", "TABS", "اسم تبويب العلاقات", "TEXT", "ذات الصلة"],
    ];
    for (const [key, group, label, type, value] of settings)
      await q.query(
        `INSERT INTO platform_settings (setting_key,group_code,label_ar,input_type,value_json) VALUES (?,?,?,?,?)`,
        [key, group, label, type, JSON.stringify(value)],
      );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `DELETE FROM platform_settings WHERE setting_key IN ('theme.page_background','theme.hero_background_url','typography.legal_size','tabs.overview_label','tabs.modifications_label','tabs.regulations_label','tabs.related_label')`,
    );
  }
}
