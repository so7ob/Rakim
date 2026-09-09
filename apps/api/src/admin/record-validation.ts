import { BadRequestException, ConflictException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
export async function assertActiveReference(
  m: EntityManager,
  table:
    | "legislation_types"
    | "authorities"
    | "subjects"
    | "source_documents"
    | "legislations",
  id: unknown,
  existingId?: unknown,
) {
  if (!id) throw new BadRequestException("العلاقة المطلوبة غير محددة.");
  const [row] = await m.query(
    `SELECT id,is_active,deleted_at FROM ${table} WHERE id=? FOR UPDATE`,
    [id],
  );
  if (!row || row.deleted_at || (!row.is_active && id !== existingId))
    throw new BadRequestException(
      "العنصر المرتبط غير موجود أو معطل؛ لا يمكن استخدامه في علاقة جديدة.",
    );
}
export async function assertParent(
  m: EntityManager,
  table: "subjects" | "structure_nodes",
  id: string,
  parentId?: string,
  lawId?: string,
) {
  const visited = new Set([id]);
  let current = parentId;
  while (current) {
    if (visited.has(current))
      throw new ConflictException(
        "العلاقة تنشئ دورة في الهيكل؛ اختر أباً خارج العناصر التابعة.",
      );
    visited.add(current);
    const [parent] = await m.query(
      `SELECT * FROM ${table} WHERE id=? FOR UPDATE`,
      [current],
    );
    if (
      !parent ||
      parent.deleted_at ||
      !parent.is_active ||
      (lawId && parent.legislation_id !== lawId)
    )
      throw new BadRequestException(
        "العنصر الأب غير فعال أو لا ينتمي إلى الهيكل نفسه.",
      );
    current = parent.parent_id;
  }
}
