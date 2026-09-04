import { createHash, randomUUID, scryptSync } from "node:crypto";
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createDataSource } from "./config.js";
import { normalizeArabic } from "../search/arabic-normalizer.js";
import { rebuildSearchIndex } from "./reindex.js";

const types = [
  ["LAW", "قانون"],
  ["DECREE", "قرار جمهوري"],
  ["REGULATION", "لائحة"],
  ["AGREEMENT", "اتفاقية"],
  ["MINISTERIAL_DECISION", "قرار وزاري"],
] as const;
const authorities = [
  ["PARLIAMENT", "السلطة التشريعية"],
  ["PRESIDENCY", "رئاسة الجمهورية"],
  ["COUNCIL", "مجلس الوزراء"],
  ["FINANCE", "وزارة المالية"],
  ["JUSTICE", "وزارة العدل"],
] as const;
const titles = [
  "قانون حماية المال العام النموذجي",
  "قانون تنظيم السجل المدني النموذجي",
  "قانون الإدارة المحلية النموذجي",
  "قانون تنظيم الزكاة وصرفها للفقراء النموذجي",
  "قرار تنظيم المشتريات العامة النموذجي",
  "قانون الضرائب العامة النموذجي",
  "قانون الجمارك والمنافذ النموذجي",
  "لائحة إجراءات الخدمة المدنية النموذجية",
  "قانون حماية البيئة النموذجي",
  "اتفاقية التعاون القضائي النموذجية",
  "قرار تنظيم الأرشيف الوطني النموذجي",
  "قانون الشركات النموذجي",
  "قانون التجارة الداخلية النموذجي",
  "قانون المياه النموذجي",
  "قانون السلامة المهنية النموذجي",
  "قرار تنظيم البيانات المفتوحة النموذجي",
  "قانون التعليم النموذجي",
  "قانون الصحة العامة النموذجي",
  "لائحة تنظيم الجهات الرقابية النموذجية",
  "قانون الموازنة العامة النموذجي",
] as const;

function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function demoPdf(): Buffer {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length 87 >>\nstream\nBT /F1 18 Tf 72 720 Td (Yemen Legislation Platform - Demo Annex) Tj 0 -32 Td /F1 12 Tf (Synthetic non-official source) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}
function passwordHash(password: string): string {
  const salt = "ylp-development-seed-only";
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

async function seed() {
  const pdf = demoPdf();
  const dataRoot =
    process.env.DATA_ROOT ?? resolve(process.cwd(), "../../data");
  mkdirSync(resolve(dataRoot, "sources/demo"), { recursive: true });
  writeFileSync(resolve(dataRoot, "sources/demo/sample-annex.pdf"), pdf, {
    mode: 0o640,
  });
  writeFileSync(
    resolve(dataRoot, "sources/demo/artificial-source.txt"),
    "مصدر تشريعي اصطناعي للاختبار فقط.\nالمادة 1: نص غير رسمي.",
    { mode: 0o640 },
  );
  const ocrFixture = resolve(process.cwd(), "../../tests/fixtures/ocr-ar.png");
  const ocrTarget = resolve(dataRoot, "sources/demo/ocr-unreviewed.png");
  copyFileSync(ocrFixture, ocrTarget);
  const ocrBytes = readFileSync(ocrTarget);
  const db = await createDataSource().initialize();
  const ids: {
    laws: string[];
    articles: string[];
    source: string;
    article20Versions: string[];
    article20Texts: string[];
  } = {
    laws: [],
    articles: [],
    source: "",
    article20Versions: [],
    article20Texts: [],
  };
  try {
    await db.transaction(async (m) => {
      await m.query("SET @ylp_maintenance=1");
      await m.query("SET FOREIGN_KEY_CHECKS=0");
      const tables = [
        "service_heartbeats",
        "search_tokens",
        "quality_issues",
        "content_responsibilities",
        "workflow_events",
        "source_imports",
        "user_sessions",
        "search_documents",
        "search_synonyms",
        "search_synonym_sets",
        "job_queue",
        "audit_logs",
        "reports",
        "user_notes",
        "saved_searches",
        "favorites",
        "user_roles",
        "verification_records",
        "legal_relations",
        "viewer_metadata",
        "annex_files",
        "annex_versions",
        "annexes",
        "previous_text_snapshots",
        "article_modifications",
        "amendment_operations",
        "amendments",
        "paragraphs",
        "article_versions",
        "articles",
        "structure_nodes",
        "legislation_versions",
        "legislation_subjects",
        "legislations",
        "source_documents",
        "gazette_issues",
        "subjects",
        "authorities",
        "legislation_types",
        "users",
        "roles",
      ];
      for (const table of tables) await m.query(`DELETE FROM ${table}`);
      await m.query("SET FOREIGN_KEY_CHECKS=1");
      await m.query("SET @ylp_maintenance=0");

      const typeIds = new Map<string, string>();
      for (const [code, name] of types) {
        const id = randomUUID();
        typeIds.set(code, id);
        await m.query(
          "INSERT INTO legislation_types (id, code, name_ar) VALUES (?, ?, ?)",
          [id, code, name],
        );
      }
      const authorityIds = new Map<string, string>();
      for (const [code, name] of authorities) {
        const id = randomUUID();
        authorityIds.set(code, id);
        await m.query(
          "INSERT INTO authorities (id, code, name_ar) VALUES (?, ?, ?)",
          [id, code, name],
        );
      }
      for (const [index, name] of [
        "الأموال العامة",
        "الإدارة",
        "العدالة",
        "الاقتصاد",
        "الخدمات العامة",
      ].entries()) {
        await m.query(
          "INSERT INTO subjects (id, code, name_ar) VALUES (?, ?, ?)",
          [randomUUID(), `SUBJECT_${index + 1}`, name],
        );
      }
      const gazetteId = randomUUID();
      await m.query(
        "INSERT INTO gazette_issues (id, issue_number, publication_date, publisher) VALUES (?, ?, ?, ?)",
        [gazetteId, "تجريبي-١", "1990-05-22", "مصدر اصطناعي للاختبار"],
      );

      const sourceId = randomUUID();
      ids.source = sourceId;
      await m.query(
        `INSERT INTO source_documents
        (id, original_name, storage_key, media_type, byte_size, sha256, received_at, obtained_from, page_count, extraction_status, reviewed_at)
        VALUES (?, ?, ?, 'text/plain', 1024, ?, NOW(3), ?, 1, 'REVIEWED', NOW(3))`,
        [
          sourceId,
          "مصدر-اصطناعي.txt",
          "sources/demo/artificial-source.txt",
          hash("ylp-artificial-source-v1"),
          "بيانات اصطناعية مولدة للاختبار",
        ],
      );

      for (let index = 0; index < titles.length; index += 1) {
        const lawId = randomUUID();
        ids.laws.push(lawId);
        const year = 1990 + index;
        const type = types[index % types.length]![0];
        const authority = authorities[index % authorities.length]![0];
        const status =
          index === 5 ? "AMENDED" : index === 6 ? "REPEALED" : "PUBLISHED";
        const legal =
          index === 5 ? "AMENDED" : index === 6 ? "REPEALED" : "IN_FORCE";
        await m.query(
          `INSERT INTO legislations
          (id, display_code, type_id, authority_id, gazette_issue_id, official_number, year, title_ar, summary_ar,
           status, legal_status, verification_level, issue_date, publication_date, effective_from, last_reviewed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            lawId,
            `YE-${type}-${year}-${index === 0 ? 14 : index + 1}`,
            typeIds.get(type),
            authorityIds.get(authority),
            gazetteId,
            String(index === 0 ? 14 : index + 1),
            year,
            titles[index],
            index === 3
              ? "نص اصطناعي يشرح تحصيل الزكاة وتوجيهها إلى الفقراء وفق ضوابط معلنة."
              : index === 5
                ? "نص اصطناعي يشرح الضريبة على الدخل وأحكام الربط والتحصيل المالي."
                : `نص وبيانات اصطناعية لأغراض اختبار منصة التشريعات اليمنية. يتناول ${titles[index]}.`,
            status,
            legal,
            index % 3 === 0 ? "A" : "B",
            `${year}-01-01`,
            `${year}-01-15`,
            `${year}-02-01`,
          ],
        );
        await m.query(
          `INSERT INTO legislation_versions
          (id, legislation_id, version_no, workflow_status, content_kind, preamble_text, source_document_id, valid_from, published_at)
          VALUES (?, ?, 1, 'PUBLISHED', 'OFFICIAL', ?, ?, ?, NOW(3))`,
          [
            randomUUID(),
            lawId,
            `ديباجة اصطناعية للاختبار تعرض أسباب إصدار ${titles[index]} وسنده، ولا تمثل نصًا رسميًا.`,
            sourceId,
            `${year}-02-01`,
          ],
        );
        const chapterId = randomUUID();
        await m.query(
          `INSERT INTO structure_nodes
          (id, legislation_id, node_type, label_ar, title_ar, sort_key) VALUES (?, ?, 'CHAPTER', 'الفصل الأول', ?, '001')`,
          [
            chapterId,
            lawId,
            index === 0 ? "الأحكام العامة وحماية الأموال" : "الأحكام العامة",
          ],
        );
        const articleCount = index === 0 ? 30 : 3;
        for (let articleNo = 1; articleNo <= articleCount; articleNo += 1) {
          const articleId = randomUUID();
          if (index === 0) ids.articles.push(articleId);
          await m.query(
            `INSERT INTO articles
            (id, legislation_id, structure_node_id, published_label, current_label, sort_key) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              articleId,
              lawId,
              chapterId,
              String(articleNo),
              String(articleNo),
              String(articleNo).padStart(5, "0"),
            ],
          );
          const baseText =
            articleNo === 20 && index === 0
              ? "تخصص الاعتمادات اللازمة لصيانة المال العام، ويجري صرف كل اعتماد وفق ضوابط الرقابة والمساءلة."
              : `المادة ${articleNo}: هذا نص قانوني اصطناعي للاختبار يبين أحكام ${titles[index]}، ولا يمثل نصًا رسميًا أو فتوى قانونية.`;
          if (index === 0 && articleNo === 20) {
            const v1 = randomUUID();
            const v2 = randomUUID();
            const v3 = randomUUID();
            const v4 = randomUUID();
            await m.query(
              `INSERT INTO article_versions
              (id, article_id, version_no, text_original, text_structured, text_normalized, valid_from, valid_to, status, ending_reason, source_document_id)
              VALUES (?, ?, 1, ?, ?, ?, '1990-02-01', '2010-01-01', 'PUBLISHED', 'استبدال تجريبي', ?)`,
              [
                v1,
                articleId,
                baseText,
                baseText,
                normalizeArabic(baseText),
                sourceId,
              ],
            );
            const text2 =
              "تخصص الاعتمادات الكافية لحماية المال العام، ويخضع صرف الاعتماد للرقابة السابقة واللاحقة.";
            await m.query(
              `INSERT INTO article_versions
              (id, article_id, version_no, text_original, text_structured, text_normalized, valid_from, valid_to, status, ending_reason, source_document_id, previous_version_id)
              VALUES (?, ?, 2, ?, ?, ?, '2010-01-01', '2020-07-01', 'PUBLISHED', 'تصحيح واستبدال تجريبي', ?, ?)`,
              [
                v2,
                articleId,
                text2,
                text2,
                normalizeArabic(text2),
                sourceId,
                v1,
              ],
            );
            const text3 =
              "تحمى الأموال العامة، ولا يجوز صرف أي اعتماد إلا للغرض المخصص له وبعد استيفاء إجراءات الرقابة.";
            await m.query(
              `INSERT INTO article_versions
              (id, article_id, version_no, text_original, text_structured, text_normalized, valid_from, valid_to, status, ending_reason, source_document_id, previous_version_id, verified_at)
              VALUES (?, ?, 3, ?, ?, ?, '2020-07-01', '2027-01-01', 'PUBLISHED', 'تعديل مستقبلي مجدول', ?, ?, NOW(3))`,
              [
                v3,
                articleId,
                text3,
                text3,
                normalizeArabic(text3),
                sourceId,
                v2,
              ],
            );
            const text4 =
              "تحمى الأموال العامة، وتحدد اللائحة إجراءات صرف كل اعتماد ومراجعته، ويعمل بهذا النص من بداية سنة 2027.";
            await m.query(
              `INSERT INTO article_versions
              (id, article_id, version_no, text_original, text_structured, text_normalized, valid_from, status, source_document_id, previous_version_id)
              VALUES (?, ?, 4, ?, ?, ?, '2027-01-01', 'FUTURE', ?, ?)`,
              [
                v4,
                articleId,
                text4,
                text4,
                normalizeArabic(text4),
                sourceId,
                v3,
              ],
            );
            ids.article20Versions = [v1, v2, v3, v4];
            ids.article20Texts = [baseText, text2, text3, text4];
          } else {
            await m.query(
              `INSERT INTO article_versions
              (id, article_id, version_no, text_original, text_structured, text_normalized, valid_from, status, source_document_id, verified_at)
              VALUES (?, ?, 1, ?, ?, ?, ?, 'PUBLISHED', ?, NOW(3))`,
              [
                randomUUID(),
                articleId,
                baseText,
                baseText,
                normalizeArabic(baseText),
                `${year}-02-01`,
                sourceId,
              ],
            );
          }
        }
      }

      const amendmentDefinitions = [
        {
          title: "قانون تعديل نموذجي لسنة 2010",
          date: "2010-01-01",
          operations: ["REPLACE", "RENUMBER"],
        },
        {
          title: "قانون تعديل وتصحيح نموذجي لسنة 2020",
          date: "2020-07-01",
          operations: ["CORRECT", "DELETE"],
        },
        {
          title: "قانون تعديل مستقبلي نموذجي لسنة 2027",
          date: "2027-01-01",
          operations: ["ADD", "REPEAL"],
        },
      ] as const;
      for (const [
        amendmentIndex,
        definition,
      ] of amendmentDefinitions.entries()) {
        const amendmentId = randomUUID();
        await m.query(
          `INSERT INTO amendments (id,amended_legislation_id,instrument_legislation_id,title_ar,issue_date,effective_from,source_document_id,status)
          VALUES (?,?,?,?,?,?,?,'PUBLISHED')`,
          [
            amendmentId,
            ids.laws[0],
            ids.laws[amendmentIndex + 1],
            definition.title,
            definition.date,
            definition.date,
            sourceId,
          ],
        );
        for (const [
          operationIndex,
          operationType,
        ] of definition.operations.entries()) {
          const operationId = randomUUID();
          const modificationId = randomUUID();
          const beforeIndex = Math.min(amendmentIndex, 2);
          const afterIndex = Math.min(amendmentIndex + 1, 3);
          await m.query(
            `INSERT INTO amendment_operations
            (id,amendment_id,operation_type,target_kind,target_id,effective_from,application_order,citation_text,source_document_id)
            VALUES (?,?,?,'ARTICLE',?,?,?,'عملية اصطناعية توضح نوع التعديل',?)`,
            [
              operationId,
              amendmentId,
              operationType,
              ids.articles[19],
              definition.date,
              operationIndex + 1,
              sourceId,
            ],
          );
          await m.query(
            `INSERT INTO article_modifications
            (id,operation_id,article_id,before_version_id,after_version_id,previous_text,new_text,effective_from)
            VALUES (?,?,?,?,?,?,?,?)`,
            [
              modificationId,
              operationId,
              ids.articles[19],
              ids.article20Versions[beforeIndex],
              ids.article20Versions[afterIndex],
              ids.article20Texts[beforeIndex],
              ids.article20Texts[afterIndex],
              definition.date,
            ],
          );
          if (operationIndex === 0 && amendmentIndex < 2) {
            await m.query(
              `INSERT INTO previous_text_snapshots
              (id,article_version_id,modification_id,article_label,full_text,valid_from,valid_to,ending_reason,source_document_id)
              VALUES (?,?,?,'20',?,?,?,?,?)`,
              [
                randomUUID(),
                ids.article20Versions[beforeIndex],
                modificationId,
                ids.article20Texts[beforeIndex],
                amendmentIndex === 0 ? "1990-02-01" : "2010-01-01",
                definition.date,
                `انتهت بتعديل ${definition.title}`,
                sourceId,
              ],
            );
          }
        }
      }

      const pdfSourceId = randomUUID();
      await m.query(
        `INSERT INTO source_documents
        (id,original_name,storage_key,media_type,byte_size,sha256,received_at,obtained_from,page_count,extraction_status,reviewed_at)
        VALUES (?,'ملحق-نموذجي.pdf','sources/demo/sample-annex.pdf','application/pdf',?,?,NOW(3),'مولد محليًا للاختبار',1,'REVIEWED',NOW(3))`,
        [pdfSourceId, pdf.length, hash(pdf)],
      );
      const annexKinds = [
        ["EXECUTIVE_REGULATION", "لائحة تنفيذية نموذجية"],
        ["TABLE", "جدول رسوم نموذجي"],
        ["ANNEX", "ملحق إجراءات نموذجي"],
      ] as const;
      for (const [annexIndex, [annexType, title]] of annexKinds.entries()) {
        const annexId = randomUUID();
        const annexVersionId = randomUUID();
        await m.query(
          `INSERT INTO annexes (id,legislation_id,annex_type,title_ar,status) VALUES (?,?,?,?,'PUBLISHED')`,
          [annexId, ids.laws[0], annexType, title],
        );
        await m.query(
          `INSERT INTO annex_versions (id,annex_id,version_no,valid_from,source_document_id,structured_table_json)
          VALUES (?,?,1,'2020-01-01',?,?)`,
          [
            annexVersionId,
            annexId,
            pdfSourceId,
            annexType === "TABLE"
              ? JSON.stringify({
                  columns: ["البند", "القيمة"],
                  rows: [
                    ["أ", "100"],
                    ["ب", "200"],
                  ],
                })
              : null,
          ],
        );
        if (annexIndex === 0) {
          const annexFileId = randomUUID();
          await m.query(
            `INSERT INTO annex_files
          (id,annex_version_id,storage_key,original_name,media_type,byte_size,sha256,page_count,extracted_text,ocr_status)
          VALUES (?,?,'sources/demo/sample-annex.pdf','ملحق-نموذجي.pdf','application/pdf',?,?,1,'ملحق تنفيذي اصطناعي قابل للبحث','NOT_REQUIRED')`,
            [annexFileId, annexVersionId, pdf.length, hash(pdf)],
          );
          await m.query(
            `INSERT INTO viewer_metadata (id,annex_file_id,bookmarks_json,page_text_json,search_positions_json) VALUES (?,?,JSON_ARRAY(),JSON_ARRAY('ملحق تنفيذي اصطناعي'),JSON_ARRAY())`,
            [randomUUID(), annexFileId],
          );
        }
      }

      const relationPairs = [
        [0, 1, "REFERS_TO"],
        [1, 0, "BASED_ON"],
        [4, 0, "IMPLEMENTS"],
        [0, 5, "TOPICALLY_RELATED"],
      ] as const;
      for (const [source, target, relation] of relationPairs) {
        await m.query(
          `INSERT INTO legal_relations
          (id, source_legislation_id, target_legislation_id, relation_type, scope_text, effective_from, source_document_id, review_status)
          VALUES (?, ?, ?, ?, 'علاقة اصطناعية لاختبار الاتجاه والنطاق', '2020-01-01', ?, 'REVIEWED')`,
          [
            randomUUID(),
            ids.laws[source],
            ids.laws[target],
            relation,
            sourceId,
          ],
        );
      }

      const roleDefinitions = [
        ["READER", "قارئ/باحث", ["read"]],
        ["DATA_ENTRY", "مدخل بيانات", ["read", "draft:create", "draft:edit"]],
        ["LEGAL_REVIEWER", "مراجع قانوني", ["read", "review"]],
        [
          "CONTENT_MANAGER",
          "مدير محتوى",
          ["read", "publish", "dictionary:manage"],
        ],
        [
          "SYSTEM_ADMIN",
          "مدير نظام",
          ["read", "users:manage", "backup:manage"],
        ],
      ] as const;
      const devPassword = "DevOnly!ChangeMe2026";
      const userIds = new Map<string, string>();
      for (const [roleCode, roleName, permissions] of roleDefinitions) {
        const roleId = randomUUID();
        const userId = randomUUID();
        userIds.set(roleCode, userId);
        await m.query(
          "INSERT INTO roles (id, code, name_ar, permissions_json) VALUES (?, ?, ?, ?)",
          [roleId, roleCode, roleName, JSON.stringify(permissions)],
        );
        await m.query(
          "INSERT INTO users (id, username, display_name, password_hash) VALUES (?, ?, ?, ?)",
          [
            userId,
            roleCode.toLowerCase(),
            `مستخدم ${roleName} التجريبي`,
            passwordHash(devPassword),
          ],
        );
        await m.query(
          "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
          [userId, roleId],
        );
      }

      const ocrSource = randomUUID();
      await m.query(
        `INSERT INTO source_documents
        (id, original_name, storage_key, media_type, byte_size, sha256, received_at, obtained_from, page_count, extraction_status, ocr_confidence,created_by)
        VALUES (?, 'مسح-غير-مراجع.png', 'sources/demo/ocr-unreviewed.png', 'image/png', ?, ?, NOW(3), 'عينة اختبار اصطناعية', 1, 'OCR_UNREVIEWED', 71.50,?)`,
        [
          ocrSource,
          ocrBytes.byteLength,
          hash(ocrBytes),
          userIds.get("DATA_ENTRY"),
        ],
      );
      await m.query(
        `INSERT INTO source_imports (id,source_document_id,uploaded_by,status,detected_format,extracted_text,extraction_json)
        VALUES (?,?,?,'READY_FOR_REVIEW','IMAGE','نص OCR اصطناعي غير مراجع لا يظهر للعامة',JSON_OBJECT('preamble','', 'articles',JSON_ARRAY(JSON_OBJECT('label','1','sortKey','00001','text','نص OCR اصطناعي غير مراجع لا يظهر للعامة'))))`,
        [randomUUID(), ocrSource, userIds.get("DATA_ENTRY")],
      );
      await m.query(
        `INSERT INTO quality_issues (id,source_document_id,issue_code,severity,message_ar)
        VALUES (?,?,'OCR_UNREVIEWED','ERROR','يوجد نص OCR لم تكتمل مراجعته البشرية')`,
        [randomUUID(), ocrSource],
      );
      const synonymSet = randomUUID();
      await m.query(
        `INSERT INTO search_synonym_sets (id,version_no,status,published_at) VALUES (?,1,'ACTIVE',NOW(3))`,
        [synonymSet],
      );
      for (const [term, synonym] of [
        ["تشريع", "قانون"],
        ["إلغاء", "نسخ"],
        ["أجر", "راتب"],
      ])
        await m.query(
          `INSERT INTO search_synonyms (id,set_id,term_ar,synonym_ar) VALUES (?,?,?,?)`,
          [randomUUID(), synonymSet, term, synonym],
        );
    });
  } finally {
    await db.destroy();
  }
  const indexed = await rebuildSearchIndex();
  console.log(
    JSON.stringify({
      event: "seed.complete",
      publicLegislations: titles.length,
      indexed,
      developmentUsers: 5,
    }),
  );
  console.log(
    "بيانات الاعتماد التطويرية موحدة محليًا: DevOnly!ChangeMe2026 — غيّرها قبل أي نشر.",
  );
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
