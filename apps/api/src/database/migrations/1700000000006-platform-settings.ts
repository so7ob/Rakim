import type { MigrationInterface, QueryRunner } from "typeorm";

export class PlatformSettings1700000000006 implements MigrationInterface {
  name = "PlatformSettings1700000000006";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE platform_settings (
      setting_key VARCHAR(120) PRIMARY KEY,
      group_code VARCHAR(60) NOT NULL,
      label_ar VARCHAR(200) NOT NULL,
      input_type ENUM('TEXT','TEXTAREA','COLOR','URL','BOOLEAN') NOT NULL DEFAULT 'TEXT',
      value_json JSON NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by CHAR(36) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_platform_setting_user FOREIGN KEY (updated_by) REFERENCES users(id),
      KEY idx_platform_settings_group (group_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE navigation_items (
      id CHAR(36) PRIMARY KEY,
      location ENUM('HEADER','FOOTER') NOT NULL,
      label_ar VARCHAR(160) NOT NULL,
      path VARCHAR(500) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_visible BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_navigation_location_path (location,path),
      KEY idx_navigation_order (location,is_visible,sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await q.query(`CREATE TABLE public_pages (
      id CHAR(36) PRIMARY KEY,
      slug VARCHAR(180) NOT NULL UNIQUE,
      eyebrow_ar VARCHAR(200) NULL,
      title_ar VARCHAR(500) NOT NULL,
      intro_ar TEXT NULL,
      sections_json JSON NOT NULL,
      status ENUM('DRAFT','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
      updated_by CHAR(36) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_public_page_user FOREIGN KEY (updated_by) REFERENCES users(id),
      KEY idx_public_pages_status (status,slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const settings = [
      [
        "branding.site_name",
        "BRANDING",
        "اسم المنصة",
        "TEXT",
        "منصة التشريعات اليمنية",
      ],
      [
        "branding.country_name",
        "BRANDING",
        "اسم الدولة",
        "TEXT",
        "الجمهورية اليمنية",
      ],
      [
        "branding.subtitle",
        "BRANDING",
        "وصف الهوية",
        "TEXT",
        "مرجع قانوني غير رسمي",
      ],
      ["branding.logo_url", "BRANDING", "رابط الشعار البديل", "URL", ""],
      [
        "branding.show_default_emblem",
        "BRANDING",
        "إظهار الرمز اليمني الافتراضي",
        "BOOLEAN",
        true,
      ],
      ["theme.navy", "COLORS", "اللون الكحلي", "COLOR", "#314B67"],
      ["theme.burgundy", "COLORS", "اللون الخمري", "COLOR", "#AD405B"],
      ["theme.sand", "COLORS", "اللون الرملي", "COLOR", "#9B7C57"],
      ["theme.surface_rose", "COLORS", "خلفية وردية فاتحة", "COLOR", "#F7F2F4"],
      ["theme.surface_gray", "COLORS", "خلفية رمادية", "COLOR", "#E6E8EB"],
      ["theme.hero_start", "COLORS", "بداية تدرج الرأس", "COLOR", "#AD405B"],
      ["theme.hero_end", "COLORS", "نهاية تدرج الرأس", "COLOR", "#314B67"],
      [
        "header.search_enabled",
        "HEADER",
        "إظهار البحث في الترويسة",
        "BOOLEAN",
        true,
      ],
      [
        "header.language_enabled",
        "HEADER",
        "إظهار مبدل اللغة",
        "BOOLEAN",
        true,
      ],
      [
        "header.accessibility_enabled",
        "HEADER",
        "إظهار أداة حجم النص",
        "BOOLEAN",
        true,
      ],
      [
        "hero.pattern_enabled",
        "BACKGROUND",
        "إظهار زخرفة الخلفية",
        "BOOLEAN",
        true,
      ],
      [
        "footer.disclaimer",
        "FOOTER",
        "تنبيه التذييل",
        "TEXTAREA",
        "بيانات العرض الحالية اصطناعية للتطوير ولا تعد نصوصًا رسمية.",
      ],
    ];
    for (const [key, group, label, type, value] of settings)
      await q.query(
        `INSERT INTO platform_settings (setting_key,group_code,label_ar,input_type,value_json) VALUES (?,?,?,?,?)`,
        [key, group, label, type, JSON.stringify(value)],
      );

    const navigation = [
      ["HEADER", "التشريعات", "/ar/legislations", 10],
      ["HEADER", "البحث المتقدم", "/ar/search", 20],
      ["HEADER", "آخر التعديلات", "/ar/latest-modifications", 30],
      ["HEADER", "عن المنصة", "/ar/about-us", 40],
      ["FOOTER", "التشريعات", "/ar/legislations", 10],
      ["FOOTER", "البحث", "/ar/search", 20],
      ["FOOTER", "عن المنصة", "/ar/about-us", 30],
      ["FOOTER", "تواصل معنا", "/ar/contact-us", 40],
    ];
    for (const [location, label, path, order] of navigation)
      await q.query(
        `INSERT INTO navigation_items (id,location,label_ar,path,sort_order) VALUES (UUID(),?,?,?,?)`,
        [location, label, path, order],
      );

    const pages = [
      [
        "constitution",
        "المرجعية الدستورية",
        "دستور الجمهورية اليمنية",
        "صفحة مخصصة لعرض النص الدستوري المنظم وتاريخه وتعديلاته.",
      ],
      [
        "constitution/modifications",
        "السجل الدستوري",
        "تعديلات الدستور",
        "تسلسل زمني مستقل لأدوات تعديل النص الدستوري ومصادرها.",
      ],
      [
        "legislative-system",
        "دليل معرفي",
        "المنظومة التشريعية",
        "تعريف بالتدرج التشريعي ودورة إعداد التشريع والعلاقات بين الأدوات القانونية.",
      ],
      [
        "policy",
        "محتوى معرفي",
        "السياسات العامة",
        "مساحة مستقلة للسياسات والأدلة المرتبطة بها.",
      ],
      [
        "policy/guide-books",
        "أدلة السياسات",
        "أدلة إعداد السياسات العامة",
        "أدلة ونماذج قابلة للإدارة تساعد على توثيق دورة إعداد السياسات.",
      ],
      [
        "news",
        "المركز الإعلامي",
        "الأخبار",
        "إعلانات تحديث البيانات ومواد التوعية المرتبطة بالمنصة.",
      ],
      [
        "about-us",
        "تعريف المنصة",
        "عن المنصة",
        "منصة محلية لإدارة وعرض التشريعات اليمنية مع حماية النصوص التاريخية ومصادرها.",
      ],
      [
        "contact-us",
        "قنوات التواصل",
        "تواصل معنا",
        "مساحة لاستقبال الملاحظات والبلاغات المتعلقة بجودة البيانات والمصادر.",
      ],
      [
        "legal/terms-and-conditions",
        "الشروط القانونية",
        "الشروط والأحكام",
        "ضوابط استخدام النسخة المحلية وبياناتها التجريبية.",
      ],
      [
        "legal/privacy-policy",
        "حماية البيانات",
        "سياسة الخصوصية",
        "بيان موجز لمعالجة بيانات الحسابات الإدارية وسجلات التدقيق.",
      ],
    ];
    for (const [slug, eyebrow, title, intro] of pages)
      await q.query(
        `INSERT INTO public_pages (id,slug,eyebrow_ar,title_ar,intro_ar,sections_json,status)
         VALUES (UUID(),?,?,?,?,?,'PUBLISHED')`,
        [
          slug,
          eyebrow,
          title,
          intro,
          JSON.stringify([
            {
              title: "محتوى الصفحة",
              body: "يُدار هذا المحتوى من تبويب إعدادات المنصة في لوحة التحكم.",
            },
          ]),
        ],
      );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP TABLE public_pages");
    await q.query("DROP TABLE navigation_items");
    await q.query("DROP TABLE platform_settings");
  }
}
