import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { DATABASE } from "../database/database.module.js";
import { requireExactPermission } from "./lifecycle.service.js";

type ImpactItem = {
  kind: string;
  id: string;
  label: string;
  status?: string | null;
};

type ImpactGroup = {
  key: string;
  label: string;
  required: boolean;
  selectedByDefault: boolean;
  selectable: boolean;
  count: number;
  items: ImpactItem[];
  blockers?: string[];
};

type MarkItem = ImpactItem & {
  relationKey: string;
  table?: string;
  snapshot: Record<string, unknown>;
};

type DeleteGraph = {
  root: { kind: "legislations" | "imports"; id: string; label: string };
  groups: ImpactGroup[];
  blockers: string[];
  optionalKeys: string[];
  markItems: MarkItem[];
  lawIds: string[];
  importIds: string[];
  sourceIds: string[];
  retainedImportLinks: Array<{ id: string; legislationId: string }>;
  token: string;
};

const markableTables = new Map([
  ["legislations", "legislations"],
  ["articles", "articles"],
  ["structure_nodes", "structure_nodes"],
  ["annexes", "annexes"],
  ["amendments", "amendments"],
  ["amendment_operations", "amendment_operations"],
  ["legal_relations", "legal_relations"],
  ["source_documents", "source_documents"],
  ["source_imports", "source_imports"],
]);

const itemTables = new Map([
  ...markableTables,
  ["legislation_versions", "legislation_versions"],
  ["article_versions", "article_versions"],
  ["paragraphs", "paragraphs"],
  ["annex_versions", "annex_versions"],
  ["annex_files", "annex_files"],
]);

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(",");
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value && typeof value === "object" ? (value as T) : fallback;
}

function boolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

@Injectable()
export class DeletionService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  private requireAnyView(actor: AuthUser) {
    if (
      !actor.permissions.includes("legislation.view") &&
      !actor.permissions.includes("source.view")
    )
      throw new ForbiddenException(
        "ليست لديك صلاحية عرض سلة التشريعات أو المصادر.",
      );
  }

  private requireRootPermission(
    actor: AuthUser,
    kind: "legislations" | "imports",
    action: "view" | "delete" | "enable",
  ) {
    requireExactPermission(
      actor,
      `${kind === "legislations" ? "legislation" : "source"}.${action}`,
    );
  }

  private requireItemPermissions(
    actor: AuthUser,
    itemKinds: string[],
    action: "view" | "delete" | "enable",
  ) {
    if (itemKinds.includes("legislations"))
      requireExactPermission(actor, `legislation.${action}`);
    if (
      itemKinds.some((kind) =>
        ["source_imports", "source_documents"].includes(kind),
      )
    )
      requireExactPermission(actor, `source.${action}`);
  }

  async impact(
    kind: string,
    id: string,
    actor: AuthUser,
  ): Promise<Record<string, unknown>> {
    if (kind !== "legislations" && kind !== "imports")
      throw new BadRequestException(
        "معاينة الحذف العلائقي متاحة للتشريعات والاستيرادات.",
      );
    this.requireRootPermission(actor, kind, "view");
    const graph = await this.buildGraph(this.db.manager, kind, id, []);
    this.requireItemPermissions(
      actor,
      graph.markItems.map((item) => item.kind),
      "view",
    );
    const impact = this.publicImpact(graph);
    if (kind === "legislations" && !actor.permissions.includes("source.view"))
      return {
        ...impact,
        groups: graph.groups.map((group) =>
          group.key === "imports-and-sources"
            ? {
                ...group,
                count: 0,
                items: [],
                selectable: false,
                blockers: ["تحتاج صلاحية عرض المصادر لإضافتها إلى دفعة الحذف."],
              }
            : group,
        ),
      };
    if (kind === "legislations" && !actor.permissions.includes("source.delete"))
      return {
        ...impact,
        groups: graph.groups.map((group) =>
          group.key === "imports-and-sources"
            ? {
                ...group,
                selectable: false,
                blockers: ["تحتاج صلاحية حذف المصادر لإضافتها إلى دفعة الحذف."],
              }
            : group,
        ),
      };
    return impact;
  }

  private publicImpact(graph: DeleteGraph) {
    return {
      root: graph.root,
      allowed: graph.blockers.length === 0,
      blockers: graph.blockers,
      groups: graph.groups,
      impactToken: graph.token,
      restoreDays: 30,
    };
  }

  private async buildGraph(
    m: EntityManager,
    kind: "legislations" | "imports",
    id: string,
    selectedOptionalKeys: string[],
  ): Promise<DeleteGraph> {
    const unknown = selectedOptionalKeys.filter(
      (key) => key !== "imports-and-sources",
    );
    if (unknown.length)
      throw new BadRequestException("اختيار تابع غير معروف في أثر الحذف.");

    const lawRows: Record<string, any>[] = [];
    let importRows: Record<string, any>[] = [];
    let rootLabel = "";
    if (kind === "legislations") {
      const [law] = await m.query(
        "SELECT * FROM legislations WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (!law) throw new NotFoundException("التشريع غير موجود أو محذوف.");
      lawRows.push(law);
      rootLabel = String(law.title_ar);
      importRows = await m.query(
        "SELECT * FROM source_imports WHERE legislation_id=? AND deleted_at IS NULL",
        [id],
      );
    } else {
      const [item] = await m.query(
        `SELECT si.*,sd.original_name source_name
         FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id
         WHERE si.id=? AND si.deleted_at IS NULL AND sd.deleted_at IS NULL
         FOR UPDATE`,
        [id],
      );
      if (!item)
        throw new NotFoundException("عملية الاستيراد غير موجودة أو محذوفة.");
      importRows = [item];
      rootLabel = String(item.source_name);
      if (item.legislation_id) {
        const [law] = await m.query(
          "SELECT * FROM legislations WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [item.legislation_id],
        );
        if (law) lawRows.push(law);
      }
    }

    const lawIds = lawRows.map((row) => String(row.id));
    const importIds = importRows.map((row) => String(row.id));
    const includeOptional =
      kind === "imports" ||
      selectedOptionalKeys.includes("imports-and-sources");

    const articles = lawIds.length
      ? await m.query(
          `SELECT * FROM articles WHERE legislation_id IN (${placeholders(lawIds)})`,
          lawIds,
        )
      : [];
    const articleIds = articles.map((row: any) => String(row.id));
    const structures = lawIds.length
      ? await m.query(
          `SELECT * FROM structure_nodes WHERE legislation_id IN (${placeholders(lawIds)})`,
          lawIds,
        )
      : [];
    const legislationVersions = lawIds.length
      ? await m.query(
          `SELECT * FROM legislation_versions WHERE legislation_id IN (${placeholders(lawIds)})`,
          lawIds,
        )
      : [];
    const articleVersions = articleIds.length
      ? await m.query(
          `SELECT * FROM article_versions WHERE article_id IN (${placeholders(articleIds)})`,
          articleIds,
        )
      : [];
    const articleVersionIds = articleVersions.map((row: any) => String(row.id));
    const paragraphs = articleVersionIds.length
      ? await m.query(
          `SELECT * FROM paragraphs WHERE article_version_id IN (${placeholders(articleVersionIds)})`,
          articleVersionIds,
        )
      : [];
    const annexes = lawIds.length
      ? await m.query(
          `SELECT * FROM annexes WHERE legislation_id IN (${placeholders(lawIds)})`,
          lawIds,
        )
      : [];
    const annexIds = annexes.map((row: any) => String(row.id));
    const annexVersions = annexIds.length
      ? await m.query(
          `SELECT * FROM annex_versions WHERE annex_id IN (${placeholders(annexIds)})`,
          annexIds,
        )
      : [];
    const annexVersionIds = annexVersions.map((row: any) => String(row.id));
    const annexFiles = annexVersionIds.length
      ? await m.query(
          `SELECT * FROM annex_files WHERE annex_version_id IN (${placeholders(annexVersionIds)})`,
          annexVersionIds,
        )
      : [];
    const amendments = lawIds.length
      ? await m.query(
          `SELECT DISTINCT am.* FROM amendments am
           LEFT JOIN amendment_operations ao ON ao.amendment_id=am.id
           LEFT JOIN articles target_article ON ao.target_kind='ARTICLE' AND target_article.id=ao.target_id
           WHERE am.amended_legislation_id IN (${placeholders(lawIds)})
              OR am.instrument_legislation_id IN (${placeholders(lawIds)})
              OR (ao.target_kind='LEGISLATION' AND ao.target_id IN (${placeholders(lawIds)}))
              OR target_article.legislation_id IN (${placeholders(lawIds)})`,
          [...lawIds, ...lawIds, ...lawIds, ...lawIds],
        )
      : [];
    const amendmentIds = amendments.map((row: any) => String(row.id));
    const amendmentOperations = amendmentIds.length
      ? await m.query(
          `SELECT * FROM amendment_operations WHERE amendment_id IN (${placeholders(amendmentIds)})`,
          amendmentIds,
        )
      : [];
    const relations = lawIds.length
      ? await m.query(
          `SELECT * FROM legal_relations WHERE source_legislation_id IN (${placeholders(lawIds)}) OR target_legislation_id IN (${placeholders(lawIds)})`,
          [...lawIds, ...lawIds],
        )
      : [];

    const sourceRows = importIds.length
      ? await m.query(
          `SELECT DISTINCT sd.* FROM source_documents sd
           WHERE sd.id IN (
             SELECT source_document_id FROM source_imports WHERE id IN (${placeholders(importIds)})
             UNION SELECT source_document_id FROM source_import_attachments WHERE source_import_id IN (${placeholders(importIds)})
             ${lawIds.length ? `UNION SELECT source_document_id FROM legislation_source_documents WHERE legislation_id IN (${placeholders(lawIds)})` : ""}
           )`,
          [...importIds, ...importIds, ...lawIds],
        )
      : lawIds.length
        ? await m.query(
            `SELECT DISTINCT sd.* FROM source_documents sd JOIN legislation_source_documents lsd ON lsd.source_document_id=sd.id
             WHERE lsd.legislation_id IN (${placeholders(lawIds)})`,
            lawIds,
          )
        : [];
    const sourceIds = sourceRows.map((row: any) => String(row.id));

    const blockers: string[] = [];
    const publishedLaw = lawRows.find((row) =>
      ["PUBLISHED", "AMENDED", "REPEALED", "SUSPENDED"].includes(row.status),
    );
    if (publishedLaw)
      blockers.push(
        `التشريع «${publishedLaw.title_ar}» منشور أو ذو أثر قانوني محفوظ.`,
      );
    if (
      legislationVersions.some(
        (row: any) => row.published_at || row.workflow_status === "PUBLISHED",
      )
    )
      blockers.push("توجد نسخة تشريع منشورة أو مؤرخة لا يجوز حذفها.");
    if (articleVersions.some((row: any) => row.status !== "DRAFT"))
      blockers.push("توجد نسخة مادة منشورة أو تاريخية لا يجوز حذفها.");
    if (annexes.some((row: any) => row.status !== "DRAFT"))
      blockers.push("يوجد ملحق منشور أو تاريخي مرتبط بالتشريع.");
    if (amendments.some((row: any) => row.status === "PUBLISHED"))
      blockers.push("توجد وثيقة تعديل منشورة مرتبطة بالتشريع.");

    const sourceBlockers: string[] = [];
    if (sourceIds.length) {
      const outsideImports = importIds.length
        ? await m.query(
            `SELECT si.id FROM source_imports si
             WHERE si.source_document_id IN (${placeholders(sourceIds)})
               AND si.id NOT IN (${placeholders(importIds)}) AND si.deleted_at IS NULL LIMIT 1`,
            [...sourceIds, ...importIds],
          )
        : await m.query(
            `SELECT id FROM source_imports WHERE source_document_id IN (${placeholders(sourceIds)}) AND deleted_at IS NULL LIMIT 1`,
            sourceIds,
          );
      const outsideAttachments = importIds.length
        ? await m.query(
            `SELECT sia.source_import_id FROM source_import_attachments sia
             WHERE sia.source_document_id IN (${placeholders(sourceIds)})
               AND sia.source_import_id NOT IN (${placeholders(importIds)}) LIMIT 1`,
            [...sourceIds, ...importIds],
          )
        : await m.query(
            `SELECT source_import_id FROM source_import_attachments WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideLawSources = lawIds.length
        ? await m.query(
            `SELECT lsd.legislation_id FROM legislation_source_documents lsd
             WHERE lsd.source_document_id IN (${placeholders(sourceIds)})
               AND lsd.legislation_id NOT IN (${placeholders(lawIds)}) LIMIT 1`,
            [...sourceIds, ...lawIds],
          )
        : await m.query(
            `SELECT legislation_id FROM legislation_source_documents WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      if (
        outsideImports.length ||
        outsideAttachments.length ||
        outsideLawSources.length
      )
        sourceBlockers.push(
          "أحد ملفات المصدر مشترك مع استيراد أو تشريع آخر؛ يجب إبقاء المصدر أو معالجة الارتباط الآخر.",
        );
      const outsideVersions = lawIds.length
        ? await m.query(
            `SELECT lv.id FROM legislation_versions lv
             WHERE lv.source_document_id IN (${placeholders(sourceIds)})
               AND lv.legislation_id NOT IN (${placeholders(lawIds)}) LIMIT 1`,
            [...sourceIds, ...lawIds],
          )
        : await m.query(
            `SELECT id FROM legislation_versions WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideArticleVersions = lawIds.length
        ? await m.query(
            `SELECT av.id FROM article_versions av JOIN articles a ON a.id=av.article_id
             WHERE av.source_document_id IN (${placeholders(sourceIds)})
               AND a.legislation_id NOT IN (${placeholders(lawIds)}) LIMIT 1`,
            [...sourceIds, ...lawIds],
          )
        : await m.query(
            `SELECT av.id FROM article_versions av WHERE av.source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideAnnexVersions = lawIds.length
        ? await m.query(
            `SELECT av.id FROM annex_versions av JOIN annexes ax ON ax.id=av.annex_id
             WHERE av.source_document_id IN (${placeholders(sourceIds)})
               AND ax.legislation_id NOT IN (${placeholders(lawIds)}) LIMIT 1`,
            [...sourceIds, ...lawIds],
          )
        : await m.query(
            `SELECT id FROM annex_versions WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideAmendments = amendmentIds.length
        ? await m.query(
            `SELECT id FROM amendments WHERE source_document_id IN (${placeholders(sourceIds)})
             AND id NOT IN (${placeholders(amendmentIds)}) LIMIT 1`,
            [...sourceIds, ...amendmentIds],
          )
        : await m.query(
            `SELECT id FROM amendments WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideOperations = amendmentIds.length
        ? await m.query(
            `SELECT id FROM amendment_operations WHERE source_document_id IN (${placeholders(sourceIds)})
             AND amendment_id NOT IN (${placeholders(amendmentIds)}) LIMIT 1`,
            [...sourceIds, ...amendmentIds],
          )
        : await m.query(
            `SELECT id FROM amendment_operations WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideRelations = relations.length
        ? await m.query(
            `SELECT id FROM legal_relations WHERE source_document_id IN (${placeholders(sourceIds)})
             AND id NOT IN (${placeholders(relations)}) LIMIT 1`,
            [...sourceIds, ...relations.map((row: any) => String(row.id))],
          )
        : await m.query(
            `SELECT id FROM legal_relations WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      const outsideSnapshots = articleIds.length
        ? await m.query(
            `SELECT pts.id FROM previous_text_snapshots pts
             JOIN article_versions av ON av.id=pts.article_version_id
             WHERE pts.source_document_id IN (${placeholders(sourceIds)})
               AND av.article_id NOT IN (${placeholders(articleIds)}) LIMIT 1`,
            [...sourceIds, ...articleIds],
          )
        : await m.query(
            `SELECT id FROM previous_text_snapshots
             WHERE source_document_id IN (${placeholders(sourceIds)}) LIMIT 1`,
            sourceIds,
          );
      if (
        outsideVersions.length ||
        outsideArticleVersions.length ||
        outsideAnnexVersions.length ||
        outsideAmendments.length ||
        outsideOperations.length ||
        outsideRelations.length ||
        outsideSnapshots.length
      )
        sourceBlockers.push(
          "أحد ملفات المصدر مثبت في نسخة أو ملحق أو تعديل خارج مجموعة الحذف.",
        );
    }
    if (includeOptional) blockers.push(...sourceBlockers);

    const rootItems: ImpactItem[] = [
      {
        kind,
        id,
        label: rootLabel,
        status:
          kind === "legislations" ? lawRows[0]?.status : importRows[0]?.status,
      },
    ];
    const linkedLegislationItems: ImpactItem[] =
      kind === "imports"
        ? lawRows.map((row) => ({
            kind: "legislations",
            id: String(row.id),
            label: String(row.title_ar),
            status: String(row.status),
          }))
        : [];
    const contentItems: ImpactItem[] = [
      ...structures.map((row: any) => ({
        kind: "structure_nodes",
        id: String(row.id),
        label: String(row.title_ar),
      })),
      ...articles.map((row: any) => ({
        kind: "articles",
        id: String(row.id),
        label: `المادة ${row.current_label}`,
      })),
    ];
    const versionItems: ImpactItem[] = [
      ...legislationVersions.map((row: any) => ({
        kind: "legislation_versions",
        id: String(row.id),
        label: `نسخة التشريع ${row.version_no}`,
        status: String(row.workflow_status),
      })),
      ...articleVersions.map((row: any) => ({
        kind: "article_versions",
        id: String(row.id),
        label: `نسخة مادة ${row.version_no}`,
        status: String(row.status),
      })),
      ...paragraphs.map((row: any) => ({
        kind: "paragraphs",
        id: String(row.id),
        label: `فقرة ${row.published_label || row.stable_locator}`,
      })),
      ...annexVersions.map((row: any) => ({
        kind: "annex_versions",
        id: String(row.id),
        label: `نسخة ملحق ${row.version_no}`,
      })),
      ...annexFiles.map((row: any) => ({
        kind: "annex_files",
        id: String(row.id),
        label: String(row.original_name),
        status: String(row.ocr_status),
      })),
    ];
    const relationItems: ImpactItem[] = [
      ...annexes.map((row: any) => ({
        kind: "annexes",
        id: String(row.id),
        label: String(row.title_ar),
        status: String(row.status),
      })),
      ...amendments.map((row: any) => ({
        kind: "amendments",
        id: String(row.id),
        label: String(row.title_ar),
        status: String(row.status),
      })),
      ...amendmentOperations.map((row: any) => ({
        kind: "amendment_operations",
        id: String(row.id),
        label: String(row.citation_text || row.operation_type),
        status: String(row.operation_type),
      })),
      ...relations.map((row: any) => ({
        kind: "legal_relations",
        id: String(row.id),
        label: `علاقة ${row.relation_type}`,
        status: String(row.review_status),
      })),
    ];
    const sourceItems: ImpactItem[] = [
      ...importRows.map((row) => ({
        kind: "source_imports",
        id: String(row.id),
        label: `عملية استيراد ${row.detected_format}`,
        status: String(row.status),
      })),
      ...sourceRows.map((row: any) => ({
        kind: "source_documents",
        id: String(row.id),
        label: String(row.original_name),
        status: String(row.extraction_status),
      })),
    ];

    const optionalSource = kind === "legislations";
    const groups: ImpactGroup[] = [
      {
        key: "root",
        label: kind === "legislations" ? "التشريع" : "عملية الاستيراد",
        required: true,
        selectedByDefault: true,
        selectable: false,
        count: 1,
        items: rootItems,
      },
      {
        key: "linked-legislation",
        label: "التشريع الناتج من الاستيراد",
        required: true,
        selectedByDefault: true,
        selectable: false,
        count: linkedLegislationItems.length,
        items: linkedLegislationItems,
      },
      {
        key: "legislation-content",
        label: "المواد والتقسيمات",
        required: true,
        selectedByDefault: true,
        selectable: false,
        count: contentItems.length,
        items: contentItems,
      },
      {
        key: "versions",
        label: "النسخ والنصوص المستخرجة",
        required: true,
        selectedByDefault: true,
        selectable: false,
        count: versionItems.length,
        items: versionItems,
      },
      {
        key: "dependent-records",
        label: "الملحقات والتعديلات والعلاقات",
        required: true,
        selectedByDefault: true,
        selectable: false,
        count: relationItems.length,
        items: relationItems,
      },
      {
        key: "imports-and-sources",
        label: "عمليات الاستيراد وملفات المصدر",
        required: !optionalSource,
        selectedByDefault: !optionalSource,
        selectable: optionalSource && sourceBlockers.length === 0,
        count: sourceItems.length,
        items: sourceItems,
        blockers: sourceBlockers.length ? sourceBlockers : undefined,
      },
    ].filter((group) => group.count > 0 || group.key === "root");

    const markItems: MarkItem[] = [];
    const addMark = (
      rows: Record<string, any>[],
      itemKind: string,
      table: string,
      relationKey: string,
      label: (row: Record<string, any>) => string,
    ) => {
      for (const row of rows)
        markItems.push({
          kind: itemKind,
          id: String(row.id),
          label: label(row),
          status: row.status ?? row.workflow_status ?? row.review_status,
          relationKey,
          table,
          snapshot: {
            isActive: boolean(row.is_active),
            deletedAt: row.deleted_at ?? null,
            status: row.status ?? null,
          },
        });
    };
    addMark(
      lawRows,
      "legislations",
      "legislations",
      kind === "imports" ? "linked-legislation" : "root",
      (row) => String(row.title_ar),
    );
    addMark(
      articles,
      "articles",
      "articles",
      "legislation-content",
      (row) => `المادة ${row.current_label}`,
    );
    addMark(
      structures,
      "structure_nodes",
      "structure_nodes",
      "legislation-content",
      (row) => String(row.title_ar),
    );
    addMark(
      legislationVersions,
      "legislation_versions",
      "legislation_versions",
      "versions",
      (row) => `نسخة التشريع ${row.version_no}`,
    );
    addMark(
      articleVersions,
      "article_versions",
      "article_versions",
      "versions",
      (row) => `نسخة مادة ${row.version_no}`,
    );
    addMark(
      paragraphs,
      "paragraphs",
      "paragraphs",
      "versions",
      (row) => `فقرة ${row.published_label || row.stable_locator}`,
    );
    addMark(
      annexVersions,
      "annex_versions",
      "annex_versions",
      "versions",
      (row) => `نسخة ملحق ${row.version_no}`,
    );
    addMark(annexFiles, "annex_files", "annex_files", "versions", (row) =>
      String(row.original_name),
    );
    addMark(annexes, "annexes", "annexes", "dependent-records", (row) =>
      String(row.title_ar),
    );
    addMark(
      amendments,
      "amendments",
      "amendments",
      "dependent-records",
      (row) => String(row.title_ar),
    );
    addMark(
      amendmentOperations,
      "amendment_operations",
      "amendment_operations",
      "dependent-records",
      (row) => String(row.citation_text || row.operation_type),
    );
    addMark(
      relations,
      "legal_relations",
      "legal_relations",
      "dependent-records",
      (row) => `علاقة ${row.relation_type}`,
    );
    const retainedImportLinks: Array<{ id: string; legislationId: string }> =
      [];
    if (includeOptional) {
      addMark(
        importRows,
        "source_imports",
        "source_imports",
        "imports-and-sources",
        (row) => `عملية استيراد ${row.detected_format}`,
      );
      addMark(
        sourceRows,
        "source_documents",
        "source_documents",
        "imports-and-sources",
        (row) => String(row.original_name),
      );
    } else {
      for (const row of importRows)
        retainedImportLinks.push({
          id: String(row.id),
          legislationId: String(row.legislation_id),
        });
    }

    const token = createHash("sha256")
      .update(
        JSON.stringify({
          root: { kind, id },
          groups: groups.map((group) => ({
            key: group.key,
            items: group.items.map((item) => [item.kind, item.id, item.status]),
            blockers: group.blockers,
          })),
          blockers,
        }),
      )
      .digest("hex");
    return {
      root: { kind, id, label: rootLabel },
      groups,
      blockers,
      optionalKeys: ["imports-and-sources"],
      markItems,
      lawIds,
      importIds: includeOptional ? importIds : [],
      sourceIds: includeOptional ? sourceIds : [],
      retainedImportLinks,
      token,
    };
  }

  async remove(
    kind: string,
    id: string,
    actor: AuthUser,
    reason: string,
    impactToken?: string,
    selectedOptionalKeys: string[] = [],
  ) {
    if (kind !== "legislations" && kind !== "imports")
      throw new BadRequestException("نوع الحذف العلائقي غير معروف.");
    this.requireRootPermission(actor, kind, "view");
    this.requireRootPermission(actor, kind, "delete");
    if (reason.trim().length < 3)
      throw new BadRequestException("سبب الإجراء مطلوب.");
    if (!impactToken)
      throw new ConflictException({
        code: "DELETE_IMPACT_CONFIRMATION_REQUIRED",
        message: "اعرض أثر الحذف وحدد التوابع قبل التأكيد.",
        impact: await this.impact(kind, id, actor),
      });
    if (
      kind === "legislations" &&
      selectedOptionalKeys.includes("imports-and-sources")
    )
      requireExactPermission(actor, "source.delete");

    return this.db.transaction(async (m) => {
      const graph = await this.buildGraph(m, kind, id, selectedOptionalKeys);
      const itemKinds = graph.markItems.map((item) => item.kind);
      this.requireItemPermissions(actor, itemKinds, "view");
      this.requireItemPermissions(actor, itemKinds, "delete");
      if (graph.token !== impactToken)
        throw new ConflictException({
          code: "DELETE_IMPACT_CHANGED",
          message: "تغيرت العلاقات منذ فتح نافذة الحذف؛ راجع الأثر المحدث.",
          impact: this.publicImpact(graph),
        });
      if (graph.blockers.length)
        throw new ConflictException({
          code: "DELETE_BLOCKED_BY_PUBLISHED_HISTORY",
          message: "لا يمكن حذف المجموعة لوجود محتوى منشور أو علاقة محفوظة.",
          blockers: graph.blockers,
        });
      if (kind === "imports" && graph.lawIds.length)
        requireExactPermission(actor, "legislation.delete");

      const batchId = randomUUID();
      const restoreUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const activeJobs = graph.importIds.length
        ? await m.query(
            `SELECT id,status FROM job_queue
             WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.importId')) IN (${placeholders(graph.importIds)})
               AND status IN ('READY','RUNNING') FOR UPDATE`,
            graph.importIds,
          )
        : [];
      const cancelling = activeJobs.some(
        (job: any) => job.status === "RUNNING",
      );
      await m.query(
        `INSERT INTO deletion_batches
         (id,root_kind,root_id,root_label,status,actor_id,reason,impact_token,selected_optional_json,summary_json,restore_until)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          batchId,
          kind,
          id,
          graph.root.label,
          cancelling ? "CANCELLING" : "TRASHED",
          actor.id,
          reason.trim(),
          graph.token,
          JSON.stringify(selectedOptionalKeys),
          JSON.stringify({
            groups: graph.groups.map(({ key, label, count, required }) => ({
              key,
              label,
              count,
              required,
            })),
            blockers: [],
          }),
          restoreUntil,
        ],
      );
      for (const item of graph.markItems)
        await m.query(
          `INSERT INTO deletion_batch_items
           (batch_id,item_kind,item_id,relation_key,label_ar,is_required,snapshot_json)
           VALUES (?,?,?,?,?,TRUE,?)`,
          [
            batchId,
            item.kind,
            item.id,
            item.relationKey,
            item.label.slice(0, 1000),
            JSON.stringify(item.snapshot),
          ],
        );
      for (const link of graph.retainedImportLinks)
        await m.query(
          `INSERT INTO deletion_batch_items
           (batch_id,item_kind,item_id,relation_key,label_ar,is_required,snapshot_json)
           VALUES (?,'source_import_link',?,'retained-import-links','ارتباط الاستيراد بالتشريع',TRUE,?)`,
          [batchId, link.id, JSON.stringify(link)],
        );

      for (const item of graph.markItems) {
        if (!item.table || !markableTables.has(item.kind)) continue;
        await m.query(
          `UPDATE ${item.table} SET is_active=FALSE,deleted_at=COALESCE(deleted_at,NOW(3)) WHERE id=?`,
          [item.id],
        );
      }
      for (const job of activeJobs) {
        if (job.status === "READY")
          await m.query(
            "UPDATE job_queue SET status='CANCELLED',cancel_requested_at=NOW(3),cancelled_at=NOW(3),completed_at=NOW(3) WHERE id=?",
            [job.id],
          );
        else
          await m.query(
            "UPDATE job_queue SET cancel_requested_at=NOW(3) WHERE id=?",
            [job.id],
          );
      }
      await m.query(
        `INSERT INTO job_queue (id,job_type,payload_json,priority,available_at)
         VALUES (?,'PURGE_DELETION_BATCH',?,90,?)`,
        [
          randomUUID(),
          JSON.stringify({ deletionBatchId: batchId }),
          restoreUntil,
        ],
      );
      await m.query(
        `INSERT INTO audit_logs
         (id,actor_id,action,entity_type,entity_id,after_json,reason)
         VALUES (?,?,'MOVE_TO_TRASH','DELETION_BATCH',?,?,?)`,
        [
          randomUUID(),
          actor.id,
          batchId,
          JSON.stringify({
            root: graph.root,
            status: cancelling ? "CANCELLING" : "TRASHED",
            restoreUntil,
            selectedOptionalKeys,
            groups: graph.groups.map((group) => ({
              key: group.key,
              count: group.count,
            })),
          }),
          reason.trim(),
        ],
      );
      return {
        id,
        batchId,
        status: cancelling ? "CANCELLING" : "TRASHED",
        restoreUntil,
      };
    });
  }

  async list(actor: AuthUser) {
    this.requireAnyView(actor);
    const rows = await this.db.query(
      `SELECT db.*,u.display_name actor_name,restorer.display_name restored_by_name,
       (SELECT COUNT(*) FROM deletion_batch_items dbi WHERE dbi.batch_id=db.id) item_count,
       EXISTS(SELECT 1 FROM deletion_batch_items dbi WHERE dbi.batch_id=db.id AND dbi.item_kind='legislations') has_law,
       EXISTS(SELECT 1 FROM deletion_batch_items dbi WHERE dbi.batch_id=db.id AND dbi.item_kind IN ('source_imports','source_documents')) has_source
       FROM deletion_batches db
       LEFT JOIN users u ON u.id=db.actor_id
       LEFT JOIN users restorer ON restorer.id=db.restored_by
       ORDER BY db.created_at DESC`,
    );
    return rows
      .filter(
        (row: any) =>
          (!boolean(row.has_law) ||
            actor.permissions.includes("legislation.view")) &&
          (!boolean(row.has_source) ||
            actor.permissions.includes("source.view")),
      )
      .map((row: any) => this.mapBatch(row));
  }

  async detail(id: string, actor: AuthUser) {
    this.requireAnyView(actor);
    const [row] = await this.db.query(
      `SELECT db.*,u.display_name actor_name,restorer.display_name restored_by_name,
       (SELECT COUNT(*) FROM deletion_batch_items dbi WHERE dbi.batch_id=db.id) item_count,
       EXISTS(SELECT 1 FROM deletion_batch_items dbi WHERE dbi.batch_id=db.id AND dbi.item_kind='legislations') has_law,
       EXISTS(SELECT 1 FROM deletion_batch_items dbi WHERE dbi.batch_id=db.id AND dbi.item_kind IN ('source_imports','source_documents')) has_source
       FROM deletion_batches db LEFT JOIN users u ON u.id=db.actor_id
       LEFT JOIN users restorer ON restorer.id=db.restored_by WHERE db.id=?`,
      [id],
    );
    if (!row) throw new NotFoundException("دفعة الحذف غير موجودة.");
    this.requireRootPermission(actor, row.root_kind, "view");
    const items = await this.db.query(
      `SELECT item_kind kind,item_id id,relation_key relationKey,label_ar label,is_required required,snapshot_json snapshot
       FROM deletion_batch_items WHERE batch_id=? ORDER BY relation_key,item_kind,label_ar`,
      [id],
    );
    this.requireItemPermissions(
      actor,
      items.map((item: any) => String(item.kind)),
      "view",
    );
    return {
      ...this.mapBatch(row),
      items: items.map((item: any) => ({
        ...item,
        required: boolean(item.required),
        snapshot: parseJson(item.snapshot, {}),
      })),
    };
  }

  private mapBatch(row: Record<string, any>) {
    return {
      id: row.id,
      rootKind: row.root_kind,
      rootId: row.root_id,
      rootLabel: row.root_label,
      status: row.status,
      actorName: row.actor_name,
      restoredByName: row.restored_by_name,
      reason: row.reason,
      summary: parseJson(row.summary_json, {}),
      restoreUntil: row.restore_until,
      createdAt: row.created_at,
      restoredAt: row.restored_at,
      purgedAt: row.purged_at,
      lastError: row.last_error,
      itemCount: Number(row.item_count ?? 0),
      hasLaw: boolean(row.has_law),
      hasSource: boolean(row.has_source),
    };
  }

  async restore(id: string, actor: AuthUser, reason: string) {
    if (reason.trim().length < 3)
      throw new BadRequestException("سبب الاستعادة مطلوب.");
    return this.db.transaction(async (m) => {
      const [batch] = await m.query(
        "SELECT * FROM deletion_batches WHERE id=? FOR UPDATE",
        [id],
      );
      if (!batch) throw new NotFoundException("دفعة الحذف غير موجودة.");
      this.requireRootPermission(actor, batch.root_kind, "enable");
      const items = await m.query(
        "SELECT * FROM deletion_batch_items WHERE batch_id=? FOR UPDATE",
        [id],
      );
      this.requireItemPermissions(
        actor,
        items.map((item: any) => String(item.item_kind)),
        "view",
      );
      this.requireItemPermissions(
        actor,
        items.map((item: any) => String(item.item_kind)),
        "enable",
      );
      if (batch.status === "RESTORED")
        return { id, status: "RESTORED", idempotentReplay: true };
      if (batch.status !== "TRASHED")
        throw new ConflictException(
          batch.status === "CANCELLING"
            ? "انتظر اكتمال إلغاء مهمة الاستخراج قبل الاستعادة."
            : "دفعة الحذف لم تعد قابلة للاستعادة.",
        );
      if (new Date(batch.restore_until).getTime() <= Date.now())
        throw new ConflictException("انتهت مهلة الاستعادة لهذه الدفعة.");
      for (const item of items) {
        const snapshot = parseJson<Record<string, any>>(item.snapshot_json, {});
        const table = itemTables.get(String(item.item_kind));
        if (table) {
          const markable = markableTables.has(String(item.item_kind));
          const [current] = await m.query(
            `SELECT id${markable ? ",is_active,deleted_at" : ""} FROM ${table} WHERE id=? FOR UPDATE`,
            [item.item_id],
          );
          if (!current && !snapshot.deletedAt)
            throw new ConflictException({
              code: "RESTORE_CONFLICT",
              message: `لا يمكن الاستعادة لأن العنصر «${item.label_ar}» لم يعد موجودًا.`,
            });
          if (
            current &&
            markable &&
            !snapshot.deletedAt &&
            (!current.deleted_at || boolean(current.is_active))
          )
            throw new ConflictException({
              code: "RESTORE_CONFLICT",
              message: `لا يمكن الاستعادة لأن حالة العنصر «${item.label_ar}» تغيرت بعد الحذف.`,
            });
        }
        if (item.item_kind === "source_documents" && !snapshot.deletedAt) {
          const [source] = await m.query(
            "SELECT sha256 FROM source_documents WHERE id=?",
            [item.item_id],
          );
          const duplicate = source
            ? await m.query(
                "SELECT id FROM source_documents WHERE active_sha256=? AND id<>? LIMIT 1",
                [source.sha256, item.item_id],
              )
            : [];
          if (duplicate.length)
            throw new ConflictException({
              code: "RESTORE_CONFLICT",
              message: "لا يمكن الاستعادة لأن ملفًا بالبصمة نفسها أصبح فعالًا.",
            });
        }
        if (item.item_kind === "source_import_link") {
          const [current] = await m.query(
            "SELECT legislation_id FROM source_imports WHERE id=? FOR UPDATE",
            [item.item_id],
          );
          if (!current || current.legislation_id !== snapshot.legislationId)
            throw new ConflictException({
              code: "RESTORE_CONFLICT",
              message: "تغير ارتباط عملية الاستيراد بعد الحذف.",
            });
        }
      }
      for (const item of items) {
        const snapshot = parseJson<Record<string, any>>(item.snapshot_json, {});
        if (item.item_kind === "source_import_link") {
          await m.query(
            "UPDATE source_imports SET legislation_id=? WHERE id=? AND legislation_id IS NULL",
            [snapshot.legislationId, item.item_id],
          );
          continue;
        }
        const table = markableTables.get(item.item_kind);
        if (!table || snapshot.deletedAt) continue;
        await m.query(
          `UPDATE ${table} SET is_active=?,deleted_at=NULL WHERE id=?`,
          [snapshot.isActive ? 1 : 0, item.item_id],
        );
        if (item.item_kind === "source_imports") {
          const resumable = ["QUEUED", "EXTRACTING", "OCR_RUNNING"].includes(
            String(snapshot.status),
          );
          await m.query("UPDATE source_imports SET status=? WHERE id=?", [
            resumable ? "QUEUED" : snapshot.status,
            item.item_id,
          ]);
          if (resumable) {
            const [source] = await m.query(
              `SELECT sd.id sourceDocumentId,sd.storage_key storageKey,sd.media_type mediaType
               FROM source_imports si JOIN source_documents sd ON sd.id=si.source_document_id WHERE si.id=?`,
              [item.item_id],
            );
            if (source)
              await m.query(
                `INSERT INTO job_queue (id,job_type,payload_json,priority)
                 VALUES (?,'IMPORT_SOURCE',?,10)`,
                [
                  randomUUID(),
                  JSON.stringify({
                    importId: item.item_id,
                    sourceDocumentId: source.sourceDocumentId,
                    storageKey: source.storageKey,
                    mediaType: source.mediaType,
                  }),
                ],
              );
          }
        }
      }
      await m.query(
        `UPDATE job_queue SET status='CANCELLED',cancel_requested_at=NOW(3),cancelled_at=NOW(3),completed_at=NOW(3)
         WHERE job_type='PURGE_DELETION_BATCH' AND status='READY'
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.deletionBatchId'))=?`,
        [id],
      );
      await m.query(
        "UPDATE deletion_batches SET status='RESTORED',restored_by=?,restored_at=NOW(3),last_error=NULL WHERE id=?",
        [actor.id, id],
      );
      await m.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason)
         VALUES (?,?,'RESTORE_FROM_TRASH','DELETION_BATCH',?,JSON_OBJECT('status','RESTORED'),?)`,
        [randomUUID(), actor.id, id, reason.trim()],
      );
      return { id, status: "RESTORED" };
    });
  }

  async purge(id: string, actor: AuthUser, reason: string) {
    if (reason.trim().length < 3)
      throw new BadRequestException("سبب الإتلاف مطلوب.");
    return this.db.transaction(async (m) => {
      const [batch] = await m.query(
        "SELECT * FROM deletion_batches WHERE id=? FOR UPDATE",
        [id],
      );
      if (!batch) throw new NotFoundException("دفعة الحذف غير موجودة.");
      this.requireRootPermission(actor, batch.root_kind, "delete");
      const items = await m.query(
        "SELECT item_kind FROM deletion_batch_items WHERE batch_id=?",
        [id],
      );
      this.requireItemPermissions(
        actor,
        items.map((item: any) => String(item.item_kind)),
        "view",
      );
      this.requireItemPermissions(
        actor,
        items.map((item: any) => String(item.item_kind)),
        "delete",
      );
      if (batch.status === "PURGED")
        return { id, status: "PURGED", idempotentReplay: true };
      if (!["TRASHED", "PURGE_FAILED"].includes(batch.status))
        throw new ConflictException(
          batch.status === "CANCELLING"
            ? "انتظر اكتمال إلغاء مهمة الاستخراج قبل الإتلاف."
            : "دفعة الحذف ليست قابلة للإتلاف.",
        );
      await m.query(
        "UPDATE deletion_batches SET status='PURGING',restore_until=NOW(3),last_error=NULL WHERE id=?",
        [id],
      );
      const queued = await m.query(
        `UPDATE job_queue SET available_at=NOW(3),status='READY',priority=1,last_error=NULL
         WHERE job_type='PURGE_DELETION_BATCH' AND status IN ('READY','FAILED')
           AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.deletionBatchId'))=?`,
        [id],
      );
      if (!queued.affectedRows)
        await m.query(
          `INSERT INTO job_queue (id,job_type,payload_json,priority)
           VALUES (?,'PURGE_DELETION_BATCH',?,1)`,
          [randomUUID(), JSON.stringify({ deletionBatchId: id })],
        );
      await m.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason)
         VALUES (?,?,'REQUEST_PURGE','DELETION_BATCH',?,JSON_OBJECT('status','PURGING'),?)`,
        [randomUUID(), actor.id, id, reason.trim()],
      );
      return { id, status: "PURGING" };
    });
  }
}
