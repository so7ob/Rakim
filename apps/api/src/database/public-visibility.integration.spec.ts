import { NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import { AnnexesController } from "../annexes/annexes.controller.js";
import { ArticlesController } from "../articles/articles.controller.js";
import { LegislationsService } from "../legislations/legislations.service.js";
import { MariaDbSearchProvider } from "../search/mariadb-search.provider.js";
import { rebuildSearchIndex } from "./reindex.js";
import { createDataSource } from "./config.js";

describe("public visibility security boundaries", () => {
  let db: DataSource;
  const publicLawId = randomUUID();
  const otherPublicLawId = randomUUID();
  const draftLawId = randomUUID();
  const publicDraftArticleId = randomUUID();
  const draftParentArticleId = randomUUID();
  const publicDraftVersionId = randomUUID();
  const draftParentVersionId = randomUUID();
  const draftAnnexId = randomUUID();
  const draftAnnexVersionId = randomUUID();
  const draftAnnexFileId = randomUUID();
  const unreviewedRelationId = randomUUID();
  const draftTargetRelationId = randomUUID();
  const secretToken = `rbacdraft${randomUUID().replaceAll("-", "")}`;

  beforeAll(async () => {
    db = await createDataSource().initialize();
    const refs = await db.query(
      `SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,
       (SELECT id FROM authorities LIMIT 1) authorityId,
       (SELECT id FROM source_documents LIMIT 1) sourceId`,
    );
    for (const [id, title, status] of [
      [publicLawId, "تشريع عام لاختبار حدود العرض", "PUBLISHED"],
      [otherPublicLawId, "تشريع عام مقابل لاختبار العلاقات", "PUBLISHED"],
      [draftLawId, "مسودة سرية لاختبار حدود العرض", "DRAFT"],
    ])
      await db.query(
        `INSERT INTO legislations
         (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
         VALUES (?,?,?,2026,?,?, 'UNKNOWN','D')`,
        [id, refs[0].typeId, refs[0].authorityId, title, status],
      );
    await db.query(
      `INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key)
       VALUES (?,?,'1','1','00001'),(?,?,'1','1','00001')`,
      [publicDraftArticleId, publicLawId, draftParentArticleId, draftLawId],
    );
    await db.query(
      `INSERT INTO article_versions
       (id,article_id,version_no,text_original,text_structured,text_normalized,
        valid_from,status,source_document_id)
       VALUES (?,?,1,?,?,?,'2026-01-01','DRAFT',?),
              (?,?,1,?,?,?,'2026-01-01','PUBLISHED',?)`,
      [
        publicDraftVersionId,
        publicDraftArticleId,
        secretToken,
        secretToken,
        secretToken,
        refs[0].sourceId,
        draftParentVersionId,
        draftParentArticleId,
        `${secretToken}parent`,
        `${secretToken}parent`,
        `${secretToken}parent`,
        refs[0].sourceId,
      ],
    );
    await db.query(
      `INSERT INTO annexes (id,legislation_id,annex_type,title_ar,status)
       VALUES (?,?,'ANNEX','ملحق مسودة سري','DRAFT')`,
      [draftAnnexId, publicLawId],
    );
    await db.query(
      `INSERT INTO annex_versions
       (id,annex_id,version_no,valid_from,source_document_id)
       VALUES (?,?,1,'2026-01-01',?)`,
      [draftAnnexVersionId, draftAnnexId, refs[0].sourceId],
    );
    await db.query(
      `INSERT INTO annex_files
       (id,annex_version_id,storage_key,original_name,media_type,byte_size,sha256,ocr_status)
       VALUES (?,?,?,'secret.pdf','application/pdf',1,?,'REVIEWED')`,
      [
        draftAnnexFileId,
        draftAnnexVersionId,
        `tests/${draftAnnexFileId}.pdf`,
        draftAnnexFileId.replaceAll("-", "").padEnd(64, "0"),
      ],
    );
    await db.query(
      `INSERT INTO legal_relations
       (id,source_legislation_id,target_legislation_id,relation_type,review_status)
       VALUES (?,?,?,'REFERS_TO','UNREVIEWED'),
              (?,?,?,'BASED_ON','PUBLISHED')`,
      [
        unreviewedRelationId,
        publicLawId,
        otherPublicLawId,
        draftTargetRelationId,
        publicLawId,
        draftLawId,
      ],
    );
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query("SET @ylp_maintenance=1");
      await runner.query(
        "DELETE FROM search_documents WHERE legislation_id IN (?,?,?)",
        [publicLawId, otherPublicLawId, draftLawId],
      );
      await runner.query("DELETE FROM legal_relations WHERE id IN (?,?)", [
        unreviewedRelationId,
        draftTargetRelationId,
      ]);
      await runner.query("DELETE FROM annex_files WHERE id=?", [
        draftAnnexFileId,
      ]);
      await runner.query("DELETE FROM annex_versions WHERE id=?", [
        draftAnnexVersionId,
      ]);
      await runner.query("DELETE FROM annexes WHERE id=?", [draftAnnexId]);
      await runner.query("DELETE FROM article_versions WHERE id IN (?,?)", [
        publicDraftVersionId,
        draftParentVersionId,
      ]);
      await runner.query("DELETE FROM articles WHERE id IN (?,?)", [
        publicDraftArticleId,
        draftParentArticleId,
      ]);
      await runner.query("DELETE FROM legislations WHERE id IN (?,?,?)", [
        publicLawId,
        otherPublicLawId,
        draftLawId,
      ]);
    } finally {
      await runner.release();
      await db.destroy();
    }
    await rebuildSearchIndex();
  });

  it("does not expose draft article versions by known IDs", async () => {
    const articles = new ArticlesController(db);
    await expect(articles.at(publicDraftArticleId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(articles.versions(publicDraftArticleId)).resolves.toEqual([]);
    await expect(articles.previous(publicDraftArticleId)).resolves.toEqual([]);
    await expect(articles.versions(draftParentArticleId)).resolves.toEqual([]);
    const listing = await new LegislationsService(db).articles(publicLawId);
    expect(listing.items).toEqual([]);
  });

  it("does not expose draft annex metadata or file by known ID", async () => {
    const annexes = new AnnexesController(db);
    await expect(annexes.detail(draftAnnexId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      annexes.file(draftAnnexId, draftAnnexVersionId, undefined, {
        setHeader() {},
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      new LegislationsService(db).annexes(publicLawId),
    ).resolves.toEqual([]);
  });

  it("hides unreviewed relations and relations with a draft target", async () => {
    const service = new LegislationsService(db);
    await expect(service.relations(publicLawId)).resolves.toEqual([]);
    const detail = await service.detail(publicLawId);
    expect(detail).toEqual(
      expect.objectContaining({
        articleCount: "0",
        annexCount: "0",
        relationCount: "0",
      }),
    );
  });

  it("keeps draft versions out of search, analytics, and CSV export", async () => {
    await rebuildSearchIndex();
    const indexed = await db.query(
      "SELECT id FROM search_documents WHERE text_normalized LIKE ?",
      [`%${secretToken}%`],
    );
    expect(indexed).toEqual([]);
    const provider = new MariaDbSearchProvider(db);
    const input = {
      q: secretToken,
      page: 1,
      pageSize: 20,
      historical: true,
      mode: "all" as const,
      field: "all" as const,
    };
    const search = await provider.search(input);
    expect(search.meta.total).toBe(0);
    const analytics = (await provider.analytics(input)) as {
      totalResults: number;
    };
    expect(analytics.totalResults).toBe(0);
    expect(await provider.exportCsv(input)).not.toContain(secretToken);
  });
});
