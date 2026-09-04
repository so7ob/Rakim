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
      `SELECT l.id,l.title_ar titleAr,l.official_number officialNumber,l.year,lt.name_ar typeName,f.created_at createdAt FROM favorites f JOIN legislations l ON l.id=f.legislation_id JOIN legislation_types lt ON lt.id=l.type_id WHERE f.user_id=? ORDER BY f.created_at DESC`,
      [userId],
    );
  }
  async favorite(userId: string, legislationId: string) {
    const rows = await this.db.query(
      "SELECT id FROM legislations WHERE id=? AND status IN ('PUBLISHED','AMENDED','REPEALED','SUSPENDED')",
      [legislationId],
    );
    if (!rows[0]) throw new NotFoundException("التشريع غير موجود.");
    await this.db.query(
      "INSERT IGNORE INTO favorites (user_id,legislation_id) VALUES (?,?)",
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
  savedSearches(userId: string) {
    return this.db.query(
      "SELECT id,name_ar nameAr,query_json query,created_at createdAt FROM saved_searches WHERE user_id=? ORDER BY created_at DESC",
      [userId],
    );
  }
  async saveSearch(userId: string, name: string, query: unknown) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO saved_searches (id,user_id,name_ar,query_json) VALUES (?,?,?,?)",
      [id, userId, name, JSON.stringify(query)],
    );
    return { id };
  }
  async deleteSavedSearch(userId:string,id:string){await this.db.query("DELETE FROM saved_searches WHERE id=? AND user_id=?",[id,userId]);return{id,deleted:true};}
  notes(userId: string) {
    return this.db.query(
      "SELECT id,entity_type entityType,entity_id entityId,note_text noteText,created_at createdAt FROM user_notes WHERE user_id=? ORDER BY created_at DESC",
      [userId],
    );
  }
  async addNote(
    userId: string,
    entityType: string,
    entityId: string,
    text: string,
  ) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO user_notes (id,user_id,entity_type,entity_id,note_text) VALUES (?,?,?,?,?)",
      [id, userId, entityType, entityId, text],
    );
    return { id };
  }
  async deleteNote(userId:string,id:string){await this.db.query("DELETE FROM user_notes WHERE id=? AND user_id=?",[id,userId]);return{id,deleted:true};}
  async report(
    input: {
      entityType: string;
      entityId: string;
      category: string;
      details: string;
    },
    actor?: AuthUser,
  ) {
    if (!input.details.trim())
      throw new BadRequestException("تفاصيل البلاغ مطلوبة.");
    const id = randomUUID();
    await this.db.query(
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
      await this.db.query(
        `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,after_json,reason) VALUES (?,?,'CREATE_REPORT','REPORT',?,?,'إرسال بلاغ عن محتوى')`,
        [randomUUID(), actor.id, id, JSON.stringify(input)],
      );
    return { id, status: "OPEN" };
  }
}
