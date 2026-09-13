import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { createDataSource } from "../database/config.js";
import { AdminService } from "./admin.service.js";
import type { AuthorizationPolicyService } from "./authorization-policy.service.js";

describe("bulk article structure assignment", () => {
  let db: DataSource;
  let service: AdminService;
  let actor: AuthUser;
  const sourceId = randomUUID();
  const legislationId = randomUUID();
  const otherLegislationId = randomUUID();
  const targetNodeId = randomUUID();
  const sourceNodeId = randomUUID();
  const otherNodeId = randomUUID();
  const articleIds = Array.from({ length: 505 }, () => randomUUID());
  const otherArticleId = randomUUID();

  beforeAll(async () => {
    db = await createDataSource().initialize();
    service = new AdminService(db, {} as AuthorizationPolicyService);
    const refs = await db.query(
      `SELECT
       (SELECT id FROM legislation_types LIMIT 1) typeId,
       (SELECT id FROM authorities LIMIT 1) authorityId,
       (SELECT id FROM users WHERE username='data_entry' LIMIT 1) userId`,
    );
    actor = {
      id: refs[0].userId,
      username: "data_entry",
      displayName: "مدخل البيانات",
      roles: ["DATA_ENTRY"],
      permissions: ["legislation.view", "article.update"],
    };
    const marker = randomUUID();
    await db.query(
      `INSERT INTO source_documents
       (id,original_name,storage_key,media_type,byte_size,sha256,received_at,
        obtained_from,extraction_status,created_by)
       VALUES (?,?,?,'text/plain',1,?,NOW(3),'اختبار الربط الجماعي','REVIEWED',?)`,
      [
        sourceId,
        `${marker}.txt`,
        `tests/${marker}.txt`,
        createHash("sha256").update(marker).digest("hex"),
        actor.id,
      ],
    );
    for (const [id, title] of [
      [legislationId, "تشريع اختبار الربط الجماعي"],
      [otherLegislationId, "تشريع آخر لاختبار العزل"],
    ])
      await db.query(
        `INSERT INTO legislations
         (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
         VALUES (?,?,?,2026,?,'DRAFT','UNKNOWN','D')`,
        [id, refs[0].typeId, refs[0].authorityId, title],
      );
    await db.query(
      `INSERT INTO structure_nodes
       (id,legislation_id,node_type,label_ar,title_ar,sort_key) VALUES
       (?,?,'CHAPTER','الفصل الأول','الهدف','000001'),
       (?,?,'CHAPTER','الفصل الثاني','المصدر','000002'),
       (?,?,'SECTION','القسم الآخر','عقدة تشريع آخر','000001')`,
      [
        targetNodeId,
        legislationId,
        sourceNodeId,
        legislationId,
        otherNodeId,
        otherLegislationId,
      ],
    );
    for (const [index, articleId] of articleIds.entries()) {
      const label = index === 9 ? "10 مكرر" : String(index + 1);
      await db.query(
        `INSERT INTO articles
         (id,legislation_id,structure_node_id,published_label,current_label,sort_key)
         VALUES (?,?,NULL,?,?,?)`,
        [
          articleId,
          legislationId,
          label,
          label,
          String(index + 1).padStart(6, "0"),
        ],
      );
      const text =
        index === 9
          ? "عنوان المادة المركبة\nنص موجز لاختبار البحث"
          : `عنوان المادة ${label}\nنص اصطناعي للاختبار`;
      await db.query(
        `INSERT INTO article_versions
         (id,article_id,version_no,text_original,text_structured,text_normalized,
          valid_from,status,source_document_id)
         VALUES (?,?,1,?,?,?,'2026-01-01','DRAFT',?)`,
        [randomUUID(), articleId, text, text, text, sourceId],
      );
    }
    await db.query(
      `INSERT INTO articles
       (id,legislation_id,structure_node_id,published_label,current_label,sort_key)
       VALUES (?, ?, ?, '1', '1', '000001')`,
      [otherArticleId, otherLegislationId, otherNodeId],
    );
    await db.query(
      `INSERT INTO article_versions
       (id,article_id,version_no,text_original,text_structured,text_normalized,
        valid_from,status,source_document_id)
       VALUES (?, ?, 1, 'مادة من تشريع آخر', 'مادة من تشريع آخر',
        'مادة من تشريع آخر', '2026-01-01', 'DRAFT', ?)`,
      [randomUUID(), otherArticleId, sourceId],
    );
  });

  beforeEach(async () => {
    await db.query(
      "UPDATE articles SET structure_node_id=NULL WHERE legislation_id=?",
      [legislationId],
    );
    await db.query("UPDATE legislations SET status='DRAFT' WHERE id=?", [
      legislationId,
    ]);
    await db.query(
      `UPDATE article_versions SET status='DRAFT'
       WHERE article_id IN (${articleIds.map(() => "?").join(",")})`,
      articleIds,
    );
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    const runner = db.createQueryRunner();
    await runner.connect();
    try {
      await runner.query("SET @ylp_maintenance=1");
      await runner.query("DELETE FROM audit_logs WHERE entity_id IN (?,?,?)", [
        targetNodeId,
        sourceNodeId,
        otherNodeId,
      ]);
      await runner.query(
        "DELETE FROM content_responsibilities WHERE legislation_id IN (?,?)",
        [legislationId, otherLegislationId],
      );
      await runner.query(
        `DELETE FROM article_versions WHERE article_id IN (${[
          ...articleIds,
          otherArticleId,
        ]
          .map(() => "?")
          .join(",")})`,
        [...articleIds, otherArticleId],
      );
      await runner.query(
        `DELETE FROM articles WHERE id IN (${[...articleIds, otherArticleId]
          .map(() => "?")
          .join(",")})`,
        [...articleIds, otherArticleId],
      );
      await runner.query("DELETE FROM structure_nodes WHERE id IN (?,?,?)", [
        targetNodeId,
        sourceNodeId,
        otherNodeId,
      ]);
      await runner.query("DELETE FROM legislations WHERE id IN (?,?)", [
        legislationId,
        otherLegislationId,
      ]);
      await runner.query("DELETE FROM source_documents WHERE id=?", [sourceId]);
      await runner.query("SET @ylp_maintenance=0");
    } finally {
      await runner.release();
      await db.destroy();
    }
  });

  const update = (assign: string[], unassign: string[] = [], user = actor) =>
    service.updateArticleAssignments(
      targetNodeId,
      { legislationId, assign, unassign },
      user,
      "تصحيح موضع المواد للاختبار",
    );

  it("assigns one article and returns the canonical assignment state", async () => {
    const result = await update([articleIds[0]!]);
    expect(result.summary).toMatchObject({
      requestedCount: 1,
      assignedCount: 1,
      movedCount: 0,
      changedCount: 1,
    });
    expect(result.assignments).toEqual([
      { id: articleIds[0], structureNodeId: targetNodeId },
    ]);
  });

  it("assigns several articles in one operation", async () => {
    const result = await update(articleIds.slice(0, 10));
    expect(result.summary.assignedCount).toBe(10);
    expect(result.summary.directArticleCount).toBe(10);
  });

  it("assigns five hundred articles transactionally", async () => {
    const result = await update(articleIds.slice(0, 500));
    expect(result.summary.assignedCount).toBe(500);
    expect(result.assignments).toHaveLength(500);
  });

  it("rejects an empty selection", async () => {
    await expect(update([])).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects duplicate and overlapping identifiers", async () => {
    await expect(update([articleIds[0]!, articleIds[0]!])).rejects.toThrow(
      "مكررة",
    );
    await expect(update([articleIds[0]!], [articleIds[0]!])).rejects.toThrow(
      "العملية نفسها",
    );
  });

  it("rejects a missing article and a missing target node", async () => {
    await expect(update([randomUUID()])).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.updateArticleAssignments(
        randomUUID(),
        { legislationId, assign: [articleIds[0]!], unassign: [] },
        actor,
        "عقدة غير موجودة",
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects cross-legislation articles and target nodes", async () => {
    await expect(update([otherArticleId])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.updateArticleAssignments(
        otherNodeId,
        { legislationId, assign: [articleIds[0]!], unassign: [] },
        actor,
        "عقدة من تشريع آخر",
      ),
    ).rejects.toThrow("العقدة الهدف");
  });

  it("moves existing assignments and records a compact move audit", async () => {
    await db.query(
      "UPDATE articles SET structure_node_id=? WHERE id IN (?,?)",
      [sourceNodeId, articleIds[0], articleIds[1]],
    );
    const result = await update(articleIds.slice(0, 2));
    expect(result.summary).toMatchObject({ movedCount: 2, assignedCount: 0 });
    const audit = await db.query(
      `SELECT action,after_json afterJson FROM audit_logs
       WHERE entity_id=? ORDER BY occurred_at DESC LIMIT 1`,
      [targetNodeId],
    );
    expect(audit[0].action).toBe("BULK_MOVE_ARTICLES");
    const after =
      typeof audit[0].afterJson === "string"
        ? JSON.parse(audit[0].afterJson)
        : audit[0].afterJson;
    expect(after.movedCount).toBe(2);
    expect(after.targetNodeId).toBe(targetNodeId);
  });

  it("supports unassignment only from the selected node", async () => {
    await db.query(
      "UPDATE articles SET structure_node_id=? WHERE id IN (?,?)",
      [targetNodeId, articleIds[0], articleIds[1]],
    );
    const result = await update([], articleIds.slice(0, 2));
    expect(result.summary.unassignedCount).toBe(2);
    expect(
      result.assignments.every(
        (item: { structureNodeId: string | null }) =>
          item.structureNodeId === null,
      ),
    ).toBe(true);
  });

  it("is idempotent when the same request is replayed", async () => {
    await update(articleIds.slice(0, 3));
    const replay = await update(articleIds.slice(0, 3));
    expect(replay.summary).toMatchObject({
      changedCount: 0,
      unchangedCount: 3,
    });
  });

  it("rolls back assignments when a later transactional write fails", async () => {
    await expect(
      update([articleIds[0]!], [], { ...actor, id: randomUUID() }),
    ).rejects.toBeTruthy();
    const rows = await db.query(
      "SELECT structure_node_id structureNodeId FROM articles WHERE id=?",
      [articleIds[0]],
    );
    expect(rows[0].structureNodeId).toBeNull();
  });

  it("enforces legislation and article lifecycle restrictions", async () => {
    await db.query("UPDATE legislations SET status='PUBLISHED' WHERE id=?", [
      legislationId,
    ]);
    await expect(update([articleIds[0]!])).rejects.toBeInstanceOf(
      ConflictException,
    );
    await db.query("UPDATE legislations SET status='DRAFT' WHERE id=?", [
      legislationId,
    ]);
    await db.query(
      "UPDATE article_versions SET status='PUBLISHED' WHERE article_id=?",
      [articleIds[0]],
    );
    await expect(update([articleIds[0]!])).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("lists lightweight assignment data with filters, search and document order", async () => {
    await db.query("UPDATE articles SET structure_node_id=? WHERE id=?", [
      targetNodeId,
      articleIds[9],
    ]);
    const result = await service.structureArticles(targetNodeId, {
      q: "المركبة",
      state: "current",
      page: 1,
      pageSize: 500,
    });
    expect(result.meta.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: articleIds[9],
      currentLabel: "10 مكرر",
      structureNodeId: targetNodeId,
    });
    expect(result.items[0]).not.toHaveProperty("textOriginal");
  });
});
