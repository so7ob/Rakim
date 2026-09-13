import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { DATABASE } from "../database/database.module.js";
@Injectable()
export class UserToolsService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}
  favorites(userId: string) {
    return this.db.query(
      `SELECT f.is_active isActive,l.is_active legislationActive,l.id,l.title_ar titleAr,l.official_number officialNumber,l.year,lt.name_ar typeName,f.created_at createdAt FROM favorites f JOIN legislations l ON l.id=f.legislation_id JOIN legislation_types lt ON lt.id=l.type_id WHERE l.deleted_at IS NULL AND f.user_id=? ORDER BY f.created_at DESC`,
      [userId],
    );
  }
  async favorite(userId: string, legislationId: string) {
    const rows = await this.db.query(
      "SELECT id FROM legislations WHERE id=? AND deleted_at IS NULL AND is_active=TRUE AND status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')",
      [legislationId],
    );
    if (!rows[0]) throw new NotFoundException("التشريع غير موجود.");
    await this.db.query(
      "INSERT INTO favorites (user_id,legislation_id) VALUES (?,?) ON DUPLICATE KEY UPDATE is_active=TRUE",
      [userId, legislationId],
    );
    return { legislationId, favorite: true };
  }
  async unfavorite(userId: string, legislationId: string) {
    await this.db.query(
      "DELETE FROM favorites WHERE user_id=? AND legislation_id=?",
      [userId, legislationId],
    );
    return { legislationId, favorite: false };
  }
  async savedSearches(userId: string) {
    const rows = await this.db.query(
      "SELECT id,is_active isActive,name_ar nameAr,query_json query,created_at createdAt FROM saved_searches WHERE user_id=? ORDER BY created_at DESC",
      [userId],
    );
    return rows.map((r: { query: unknown }) => ({
      ...r,
      query: typeof r.query === "string" ? JSON.parse(r.query) : r.query,
    }));
  }
  async saveSearch(userId: string, name: string, query: unknown) {
    this.validateSearch(name, query);
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO saved_searches (id,user_id,name_ar,query_json) VALUES (?,?,?,?)",
      [id, userId, name, JSON.stringify(query)],
    );
    return { id };
  }
  async deleteSavedSearch(userId: string, id: string) {
    await this.db.query("DELETE FROM saved_searches WHERE id=? AND user_id=?", [
      id,
      userId,
    ]);
    return { id, deleted: true };
  }
  notes(userId: string) {
    return this.db.query(
      "SELECT id,is_active isActive,entity_type entityType,entity_id entityId,note_text noteText,created_at createdAt FROM user_notes WHERE user_id=? ORDER BY created_at DESC",
      [userId],
    );
  }
  async addNote(
    userId: string,
    entityType: string,
    entityId: string,
    text: string,
  ) {
    await this.assertPublicEntity(entityType, entityId);
    if (!text.trim()) throw new BadRequestException("نص الملاحظة مطلوب.");
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO user_notes (id,user_id,entity_type,entity_id,note_text) VALUES (?,?,?,?,?)",
      [id, userId, entityType, entityId, text],
    );
    return { id };
  }
  async deleteNote(userId: string, id: string) {
    await this.db.query("DELETE FROM user_notes WHERE id=? AND user_id=?", [
      id,
      userId,
    ]);
    return { id, deleted: true };
  }
  private validateSearch(name: string, query: unknown) {
    if (
      !name.trim() ||
      !query ||
      typeof query !== "object" ||
      Array.isArray(query) ||
      Object.values(query).some((v) => typeof v !== "string") ||
      JSON.stringify(query).length > 10000
    )
      throw new BadRequestException("اسم البحث ومعاييره النصية مطلوبة وصحيحة.");
  }
  async updateSearch(userId: string, id: string, name: string, query: unknown) {
    this.validateSearch(name, query);
    const result = await this.db.query(
      "UPDATE saved_searches SET name_ar=?,query_json=? WHERE id=? AND user_id=?",
      [name.trim(), JSON.stringify(query), id, userId],
    );
    if (!result.affectedRows)
      throw new NotFoundException("البحث غير موجود في حسابك.");
    return { id };
  }
  async updateNote(userId: string, id: string, text: string) {
    if (!text.trim()) throw new BadRequestException("نص الملاحظة مطلوب.");
    const result = await this.db.query(
      "UPDATE user_notes SET note_text=? WHERE id=? AND user_id=?",
      [text.trim(), id, userId],
    );
    if (!result.affectedRows)
      throw new NotFoundException("الملاحظة غير موجودة في حسابك.");
    return { id };
  }
  async setActive(userId: string, kind: string, id: string, active: boolean) {
    const table =
      kind === "favorites"
        ? "favorites"
        : kind === "saved-searches"
          ? "saved_searches"
          : kind === "notes"
            ? "user_notes"
            : null;
    if (!table) throw new BadRequestException("نوع السجل الشخصي غير معروف.");
    const result = await this.db.query(
      `UPDATE ${table} SET is_active=? WHERE ${kind === "favorites" ? "legislation_id" : "id"}=? AND user_id=?`,
      [active, id, userId],
    );
    if (!result.affectedRows)
      throw new NotFoundException("السجل غير موجود في حسابك.");
    return { id, isActive: active };
  }
  private async assertPublicEntity(kind: string, id: string) {
    let sql: string;
    if (kind === "LEGISLATION")
      sql = "SELECT l.id FROM legislations l WHERE l.id=?";
    else if (kind === "ARTICLE")
      sql =
        "SELECT a.id FROM articles a JOIN legislations l ON l.id=a.legislation_id WHERE a.id=? AND a.is_active=TRUE AND a.deleted_at IS NULL AND EXISTS (SELECT 1 FROM article_versions av WHERE av.article_id=a.id AND av.status IN ('PUBLISHED','REPEALED') AND av.valid_from<=CURRENT_DATE())";
    else if (kind === "ANNEX")
      sql =
        "SELECT ax.id FROM annexes ax JOIN legislations l ON l.id=ax.legislation_id WHERE ax.id=? AND ax.is_active=TRUE AND ax.deleted_at IS NULL AND ax.status IN ('PUBLISHED','REPLACED','REPEALED')";
    else throw new BadRequestException("نوع المحتوى غير صالح.");
    const rows = await this.db.query(
      sql +
        " AND l.is_active=TRUE AND l.deleted_at IS NULL AND l.status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')",
      [id],
    );
    if (!rows.length) throw new NotFoundException("المحتوى غير متاح للعامة.");
  }
  async report(
    input: {
      entityType: string;
      entityId: string;
      category: string;
      details: string;
    },
    actor?: AuthUser,
  ) {
    await this.assertPublicEntity(input.entityType, input.entityId);
    if (!input.details.trim())
      throw new BadRequestException("تفاصيل البلاغ مطلوبة.");
    return this.db.transaction(async (manager) => {
      const id = randomUUID();
      await manager.query(
        "INSERT INTO reports (id,reporter_id,entity_type,entity_id,category,details) VALUES (?,?,?,?,?,?)",
        [
          id,
          actor?.id ?? null,
          input.entityType,
          input.entityId,
          input.category,
          input.details,
        ],
      );
      if (actor)
        await manager.query(
          "INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,'CREATE_REPORT','REPORT',?,?,'إرسال بلاغ عن محتوى')",
          [
            randomUUID(),
            actor.id,
            id,
            JSON.stringify({
              entityType: input.entityType,
              entityId: input.entityId,
              category: input.category,
            }),
          ],
        );
      return { id, status: "OPEN" };
    });
  }
}
