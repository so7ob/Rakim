import type { MigrationInterface, QueryRunner } from "typeorm";
export class AdministrativeLifecycle1700000000015 implements MigrationInterface {
  name = "AdministrativeLifecycle1700000000015";
  async up(q: QueryRunner) {
    await q.query(
      "ALTER TABLE amendments ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1",
    );
    await q.query(
      "ALTER TABLE legislations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE articles ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE structure_nodes ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE annexes ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE legal_relations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE source_documents ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE amendments ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE amendment_operations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE legislation_types ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE authorities ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE subjects ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE navigation_items ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE public_pages ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query("ALTER TABLE users ADD COLUMN deleted_at DATETIME(3) NULL");
    await q.query(
      "ALTER TABLE search_synonyms ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE, ADD COLUMN deleted_at DATETIME(3) NULL",
    );
    await q.query(
      "ALTER TABLE favorites ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
    );
    await q.query(
      "ALTER TABLE saved_searches ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
    );
    await q.query(
      "ALTER TABLE user_notes ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE",
    );
    await q.query(
      "ALTER TABLE amendment_operations ADD COLUMN replacement_from TEXT NULL, ADD COLUMN proposed_sort_key VARCHAR(120) NULL",
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "legislation.delete",
        "CONTENT",
        "legislation",
        "delete",
        "حذف التشريع",
        "حذف التشريع مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "legislation.disable",
        "CONTENT",
        "legislation",
        "disable",
        "تعطيل التشريع",
        "تعطيل التشريع مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "legislation.enable",
        "CONTENT",
        "legislation",
        "enable",
        "إعادة تفعيل التشريع",
        "إعادة تفعيل التشريع مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "article.delete",
        "CONTENT",
        "article",
        "delete",
        "حذف المادة",
        "حذف المادة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "article.disable",
        "CONTENT",
        "article",
        "disable",
        "تعطيل المادة",
        "تعطيل المادة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "article.enable",
        "CONTENT",
        "article",
        "enable",
        "إعادة تفعيل المادة",
        "إعادة تفعيل المادة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "structure.delete",
        "CONTENT",
        "structure",
        "delete",
        "حذف العقدة البنيوية",
        "حذف العقدة البنيوية مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "structure.disable",
        "CONTENT",
        "structure",
        "disable",
        "تعطيل العقدة البنيوية",
        "تعطيل العقدة البنيوية مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "structure.enable",
        "CONTENT",
        "structure",
        "enable",
        "إعادة تفعيل العقدة البنيوية",
        "إعادة تفعيل العقدة البنيوية مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "annex.delete",
        "CONTENT",
        "annex",
        "delete",
        "حذف الملحق",
        "حذف الملحق مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "annex.disable",
        "CONTENT",
        "annex",
        "disable",
        "تعطيل الملحق",
        "تعطيل الملحق مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "annex.enable",
        "CONTENT",
        "annex",
        "enable",
        "إعادة تفعيل الملحق",
        "إعادة تفعيل الملحق مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "relation.delete",
        "CONTENT",
        "relation",
        "delete",
        "حذف العلاقة",
        "حذف العلاقة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "relation.disable",
        "CONTENT",
        "relation",
        "disable",
        "تعطيل العلاقة",
        "تعطيل العلاقة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "relation.enable",
        "CONTENT",
        "relation",
        "enable",
        "إعادة تفعيل العلاقة",
        "إعادة تفعيل العلاقة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "source.delete",
        "SOURCES",
        "source",
        "delete",
        "حذف المصدر",
        "حذف المصدر مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "source.disable",
        "SOURCES",
        "source",
        "disable",
        "تعطيل المصدر",
        "تعطيل المصدر مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "source.enable",
        "SOURCES",
        "source",
        "enable",
        "إعادة تفعيل المصدر",
        "إعادة تفعيل المصدر مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "amendment.delete",
        "AMENDMENTS",
        "amendment",
        "delete",
        "حذف وثيقة التعديل أو عنصرها",
        "حذف وثيقة التعديل أو عنصرها مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "amendment.disable",
        "AMENDMENTS",
        "amendment",
        "disable",
        "تعطيل وثيقة التعديل أو عنصرها",
        "تعطيل وثيقة التعديل أو عنصرها مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "amendment.enable",
        "AMENDMENTS",
        "amendment",
        "enable",
        "إعادة تفعيل وثيقة التعديل أو عنصرها",
        "إعادة تفعيل وثيقة التعديل أو عنصرها مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "reference.delete",
        "CONTENT",
        "reference",
        "delete",
        "حذف سجل مرجعي",
        "حذف سجل مرجعي مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "reference.disable",
        "CONTENT",
        "reference",
        "disable",
        "تعطيل سجل مرجعي",
        "تعطيل سجل مرجعي مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "reference.enable",
        "CONTENT",
        "reference",
        "enable",
        "إعادة تفعيل سجل مرجعي",
        "إعادة تفعيل سجل مرجعي مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "navigation.delete",
        "SETTINGS",
        "navigation",
        "delete",
        "حذف رابط التنقل",
        "حذف رابط التنقل مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "navigation.disable",
        "SETTINGS",
        "navigation",
        "disable",
        "تعطيل رابط التنقل",
        "تعطيل رابط التنقل مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "navigation.enable",
        "SETTINGS",
        "navigation",
        "enable",
        "إعادة تفعيل رابط التنقل",
        "إعادة تفعيل رابط التنقل مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "public_page.delete",
        "SETTINGS",
        "public_page",
        "delete",
        "حذف الصفحة العامة",
        "حذف الصفحة العامة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "public_page.disable",
        "SETTINGS",
        "public_page",
        "disable",
        "تعطيل الصفحة العامة",
        "تعطيل الصفحة العامة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "public_page.enable",
        "SETTINGS",
        "public_page",
        "enable",
        "إعادة تفعيل الصفحة العامة",
        "إعادة تفعيل الصفحة العامة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "user.delete",
        "ACCESS",
        "user",
        "delete",
        "حذف المستخدم",
        "حذف المستخدم مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "search.synonym.disable",
        "SEARCH",
        "search.synonym",
        "disable",
        "تعطيل المرادف",
        "تعطيل المرادف مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "search.synonym.enable",
        "SEARCH",
        "search.synonym",
        "enable",
        "إعادة تفعيل المرادف",
        "إعادة تفعيل المرادف مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "article.create",
        "CONTENT",
        "article",
        "create",
        "إضافة مادة مسودة",
        "إضافة مادة مسودة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "amendment.update",
        "AMENDMENTS",
        "amendment",
        "update",
        "تحرير وثيقة التعديل وعناصرها",
        "تحرير وثيقة التعديل وعناصرها مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "public_page.create",
        "SETTINGS",
        "public_page",
        "create",
        "إضافة صفحة عامة",
        "إضافة صفحة عامة مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
    await q.query(
      "INSERT INTO permission_definitions (code,domain_code,resource_code,action_code,label_ar,description_ar,sensitivity,supported_scopes_json,is_active,is_system,is_legacy) VALUES (?,?,?,?,?,?,'ELEVATED',JSON_ARRAY('ALL'),TRUE,TRUE,FALSE)",
      [
        "search.synonym.update",
        "SEARCH",
        "search.synonym",
        "update",
        "تعديل مرادف",
        "تعديل مرادف مع التحقق من الحالة والارتباطات وتسجيل التدقيق.",
      ],
    );
  }
  async down(q: QueryRunner) {
    // Refuse rollback once it would revive deleted records or discard administrative state.
    for (const table of [
      "legislations",
      "articles",
      "structure_nodes",
      "annexes",
      "legal_relations",
      "source_documents",
      "amendments",
      "amendment_operations",
      "legislation_types",
      "authorities",
      "subjects",
      "navigation_items",
      "public_pages",
      "users",
      "search_synonyms",
    ]) {
      if (
        (
          await q.query(
            `SELECT 1 FROM ${table} WHERE deleted_at IS NOT NULL LIMIT 1`,
          )
        ).length
      )
        throw new Error(
          "LIFECYCLE_ROLLBACK_REQUIRES_SNAPSHOT: soft deletions exist",
        );
    }
    for (const table of [
      "legislations",
      "articles",
      "structure_nodes",
      "annexes",
      "legal_relations",
      "source_documents",
      "amendments",
      "amendment_operations",
      "public_pages",
      "search_synonyms",
      "favorites",
      "saved_searches",
      "user_notes",
    ]) {
      if (
        (await q.query(`SELECT 1 FROM ${table} WHERE is_active=FALSE LIMIT 1`))
          .length
      )
        throw new Error(
          "LIFECYCLE_ROLLBACK_REQUIRES_SNAPSHOT: disabled records exist",
        );
    }
    if (
      (
        await q.query(
          "SELECT 1 FROM amendment_operations WHERE replacement_from IS NOT NULL OR proposed_sort_key IS NOT NULL LIMIT 1",
        )
      ).length
    )
      throw new Error(
        "LIFECYCLE_ROLLBACK_REQUIRES_SNAPSHOT: new amendment elements exist",
      );

    await q.query("ALTER TABLE amendments DROP COLUMN revision");
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["legislation.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "legislation.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "legislation.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["legislation.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "legislation.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "legislation.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["legislation.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "legislation.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "legislation.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["article.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "article.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "article.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["article.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "article.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "article.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["article.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "article.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "article.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["structure.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "structure.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "structure.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["structure.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "structure.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "structure.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["structure.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "structure.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "structure.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["annex.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "annex.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "annex.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["annex.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "annex.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "annex.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["annex.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "annex.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "annex.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["relation.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "relation.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "relation.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["relation.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "relation.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "relation.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["relation.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "relation.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "relation.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["source.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "source.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "source.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["source.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "source.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "source.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["source.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "source.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "source.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["amendment.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "amendment.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "amendment.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["amendment.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "amendment.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "amendment.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["amendment.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "amendment.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "amendment.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["reference.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "reference.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "reference.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["reference.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "reference.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "reference.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["reference.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "reference.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "reference.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["navigation.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "navigation.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "navigation.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["navigation.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "navigation.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "navigation.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["navigation.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "navigation.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "navigation.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["public_page.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "public_page.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "public_page.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["public_page.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "public_page.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "public_page.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["public_page.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "public_page.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "public_page.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["user.delete"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "user.delete",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "user.delete",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["search.synonym.disable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "search.synonym.disable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "search.synonym.disable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["search.synonym.enable"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "search.synonym.enable",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "search.synonym.enable",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["article.create"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "article.create",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "article.create",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["amendment.update"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "amendment.update",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "amendment.update",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["public_page.create"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "public_page.create",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "public_page.create",
    ]);
    await q.query(
      "DELETE FROM user_permission_overrides WHERE permission_code=?",
      ["search.synonym.update"],
    );
    await q.query("DELETE FROM role_permissions WHERE permission_code=?", [
      "search.synonym.update",
    ]);
    await q.query("DELETE FROM permission_definitions WHERE code=?", [
      "search.synonym.update",
    ]);
    await q.query(
      "ALTER TABLE amendment_operations DROP COLUMN replacement_from, DROP COLUMN proposed_sort_key",
    );
    await q.query("ALTER TABLE favorites DROP COLUMN is_active");
    await q.query("ALTER TABLE saved_searches DROP COLUMN is_active");
    await q.query("ALTER TABLE user_notes DROP COLUMN is_active");
    await q.query(
      "ALTER TABLE search_synonyms DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query("ALTER TABLE users DROP COLUMN deleted_at");
    await q.query(
      "ALTER TABLE public_pages DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query("ALTER TABLE navigation_items DROP COLUMN deleted_at");
    await q.query("ALTER TABLE subjects DROP COLUMN deleted_at");
    await q.query("ALTER TABLE authorities DROP COLUMN deleted_at");
    await q.query("ALTER TABLE legislation_types DROP COLUMN deleted_at");
    await q.query(
      "ALTER TABLE amendment_operations DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE amendments DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE source_documents DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE legal_relations DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE annexes DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE structure_nodes DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE articles DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
    await q.query(
      "ALTER TABLE legislations DROP COLUMN deleted_at, DROP COLUMN is_active",
    );
  }
}
