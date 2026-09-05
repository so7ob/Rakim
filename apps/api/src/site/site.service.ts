import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { DataSource, EntityManager } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { DATABASE } from "../database/database.module.js";

type SettingValue = string | boolean;

@Injectable()
export class SiteService {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async config() {
    const [settings, navigation] = await Promise.all([
      this.db.query(
        `SELECT setting_key settingKey,value_json valueJson FROM platform_settings WHERE is_public=1 ORDER BY setting_key`,
      ),
      this.db.query(
        `SELECT id,location,label_ar labelAr,path,sort_order sortOrder FROM navigation_items WHERE is_visible=1 ORDER BY location,sort_order,id`,
      ),
    ]);
    return {
      settings: Object.fromEntries(
        settings.map((item: { settingKey: string; valueJson: unknown }) => [
          item.settingKey,
          this.parseJson(item.valueJson),
        ]),
      ),
      navigation,
    };
  }

  async page(slug: string) {
    const rows = await this.db.query(
      `SELECT id,slug,eyebrow_ar eyebrowAr,title_ar titleAr,intro_ar introAr,sections_json sections,updated_at updatedAt
       FROM public_pages WHERE slug=? AND status='PUBLISHED'`,
      [slug],
    );
    if (!rows[0])
      throw new NotFoundException("الصفحة غير موجودة أو غير منشورة.");
    return { ...rows[0], sections: this.parseJson(rows[0].sections) };
  }

  async adminState() {
    const [settings, navigation, pages] = await Promise.all([
      this.db.query(
        `SELECT setting_key settingKey,group_code groupCode,label_ar labelAr,input_type inputType,value_json valueJson,is_public isPublic,updated_at updatedAt
         FROM platform_settings WHERE group_code<>'WORKFLOW' ORDER BY group_code,setting_key`,
      ),
      this.db.query(
        `SELECT id,location,label_ar labelAr,path,sort_order sortOrder,is_visible isVisible,updated_at updatedAt FROM navigation_items ORDER BY location,sort_order,id`,
      ),
      this.db.query(
        `SELECT id,slug,eyebrow_ar eyebrowAr,title_ar titleAr,intro_ar introAr,sections_json sections,status,updated_at updatedAt FROM public_pages ORDER BY slug`,
      ),
    ]);
    return {
      settings: settings.map((item: Record<string, unknown>) => ({
        ...item,
        value: this.parseJson(item.valueJson),
        valueJson: undefined,
      })),
      navigation,
      pages: pages.map((item: Record<string, unknown>) => ({
        ...item,
        sections: this.parseJson(item.sections),
      })),
    };
  }

  async updateSettings(
    values: Record<string, SettingValue>,
    actor: AuthUser,
    reason: string,
  ) {
    const keys = Object.keys(values);
    if (!keys.length) throw new BadRequestException("لم ترسل إعدادات للحفظ.");
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT setting_key settingKey,group_code groupCode,input_type inputType,value_json valueJson FROM platform_settings WHERE setting_key IN (${keys.map(() => "?").join(",")}) FOR UPDATE`,
        keys,
      );
      if (rows.length !== keys.length)
        throw new BadRequestException("يتضمن الطلب مفتاح إعداد غير معروف.");
      if (
        rows.some(
          (row: Record<string, unknown>) => row.groupCode === "WORKFLOW",
        )
      )
        throw new BadRequestException(
          "تدار سياسات سير العمل حصريًا من واجهة سياسات سير العمل.",
        );
      const before: Record<string, unknown> = {};
      for (const row of rows) {
        const key = String(row.settingKey);
        const value = values[key]!;
        const permission = this.settingPermission(String(row.groupCode));
        if (!actor.permissions.includes(permission))
          throw new ForbiddenException(
            "لا تملك الصلاحية المطلوبة لتعديل مجموعة الإعدادات هذه.",
          );
        this.validateSetting(String(row.inputType), value);
        before[key] = this.parseJson(row.valueJson);
        await manager.query(
          "UPDATE platform_settings SET value_json=?,updated_by=? WHERE setting_key=?",
          [JSON.stringify(value), actor.id, key],
        );
      }
      await this.audit(
        manager,
        actor.id,
        "UPDATE_PLATFORM_SETTINGS",
        "PLATFORM_SETTINGS",
        "global",
        before,
        values,
        reason,
      );
      return this.config();
    });
  }

  async createNavigation(
    input: {
      location: "HEADER" | "FOOTER";
      labelAr: string;
      path: string;
      sortOrder: number;
      isVisible: boolean;
    },
    actor: AuthUser,
    reason: string,
  ) {
    this.validatePath(input.path);
    const id = randomUUID();
    await this.db.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO navigation_items (id,location,label_ar,path,sort_order,is_visible) VALUES (?,?,?,?,?,?)`,
        [
          id,
          input.location,
          input.labelAr.trim(),
          input.path.trim(),
          input.sortOrder,
          input.isVisible,
        ],
      );
      await this.audit(
        manager,
        actor.id,
        "CREATE_NAVIGATION_ITEM",
        "NAVIGATION_ITEM",
        id,
        null,
        input,
        reason,
      );
    });
    return { id };
  }

  async updateNavigation(
    id: string,
    input: {
      location: "HEADER" | "FOOTER";
      labelAr: string;
      path: string;
      sortOrder: number;
      isVisible: boolean;
    },
    actor: AuthUser,
    reason: string,
  ) {
    this.validatePath(input.path);
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM navigation_items WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("رابط التنقل غير موجود.");
      await manager.query(
        `UPDATE navigation_items SET location=?,label_ar=?,path=?,sort_order=?,is_visible=? WHERE id=?`,
        [
          input.location,
          input.labelAr.trim(),
          input.path.trim(),
          input.sortOrder,
          input.isVisible,
          id,
        ],
      );
      await this.audit(
        manager,
        actor.id,
        "UPDATE_NAVIGATION_ITEM",
        "NAVIGATION_ITEM",
        id,
        rows[0],
        input,
        reason,
      );
      return { id };
    });
  }

  async updatePage(
    id: string,
    input: {
      eyebrowAr: string;
      titleAr: string;
      introAr: string;
      sections: Array<{ title: string; body: string }>;
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    },
    actor: AuthUser,
    reason: string,
  ) {
    if (!actor.permissions.includes("public_page.update"))
      throw new ForbiddenException("تعديل الصفحة العامة يتطلب صلاحية مستقلة.");
    const statePermission =
      input.status === "PUBLISHED"
        ? "public_page.publish"
        : input.status === "ARCHIVED"
          ? "public_page.archive"
          : null;
    if (statePermission && !actor.permissions.includes(statePermission))
      throw new ForbiddenException(
        "لا تملك صلاحية تغيير حالة نشر الصفحة العامة.",
      );
    if (!input.sections.length)
      throw new BadRequestException(
        "يجب أن تحتوي الصفحة على قسم واحد على الأقل.",
      );
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        "SELECT * FROM public_pages WHERE id=? FOR UPDATE",
        [id],
      );
      if (!rows[0]) throw new NotFoundException("صفحة المحتوى غير موجودة.");
      if (rows[0].status !== "DRAFT" && input.status === "DRAFT")
        throw new BadRequestException(
          "لا يدعم نموذج الصلاحيات الحالي سحب نشر صفحة أو استعادة صفحة مؤرشفة إلى مسودة.",
        );
      await manager.query(
        `UPDATE public_pages SET eyebrow_ar=?,title_ar=?,intro_ar=?,sections_json=?,status=?,updated_by=? WHERE id=?`,
        [
          input.eyebrowAr.trim() || null,
          input.titleAr.trim(),
          input.introAr.trim() || null,
          JSON.stringify(input.sections),
          input.status,
          actor.id,
          id,
        ],
      );
      await this.audit(
        manager,
        actor.id,
        "UPDATE_PUBLIC_PAGE",
        "PUBLIC_PAGE",
        id,
        rows[0],
        input,
        reason,
      );
      return { id, status: input.status };
    });
  }

  private validateSetting(type: string, value: SettingValue) {
    if (type === "BOOLEAN" && typeof value !== "boolean")
      throw new BadRequestException("قيمة إعداد التفعيل يجب أن تكون منطقية.");
    if (type !== "BOOLEAN" && typeof value !== "string")
      throw new BadRequestException("قيمة الإعداد النصي غير صالحة.");
    if (type === "COLOR" && !/^#[0-9A-Fa-f]{6}$/.test(String(value)))
      throw new BadRequestException("اللون يجب أن يكون بصيغة #RRGGBB.");
    if (type === "URL" && value && !/^(https:\/\/|\/)/.test(String(value)))
      throw new BadRequestException(
        "رابط الشعار يجب أن يكون HTTPS أو مسارًا محليًا يبدأ بشرطة مائلة.",
      );
  }

  private settingPermission(group: string) {
    if (["COLORS", "BACKGROUND", "TYPOGRAPHY"].includes(group))
      return "settings.appearance.update";
    if (group === "HEADER") return "settings.header.update";
    if (group === "FOOTER") return "settings.footer.update";
    if (group === "TABS") return "settings.legislation_page.update";
    return "settings.general.update";
  }

  private validatePath(path: string) {
    if (!/^\/(ar|en)(\/|$)/.test(path) && !/^https:\/\//.test(path))
      throw new BadRequestException(
        "الرابط يجب أن يكون مسار منصة محليًا أو رابط HTTPS.",
      );
  }

  private parseJson(value: unknown) {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private async audit(
    manager: EntityManager,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: unknown,
    after: unknown,
    reason: string,
  ) {
    await manager.query(
      `INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason) VALUES (?,?,?,?,?,?,?,?)`,
      [
        randomUUID(),
        actorId,
        action,
        entityType,
        entityId,
        before == null ? null : JSON.stringify(before),
        JSON.stringify(after),
        reason.trim(),
      ],
    );
  }
}
