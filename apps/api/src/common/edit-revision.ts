import { BadRequestException, ConflictException } from "@nestjs/common";

export function assertEditRevision(
  expected: unknown,
  row: { edit_revision: number | string },
  current: Record<string, unknown>,
) {
  if (!Number.isSafeInteger(expected) || Number(expected) < 1)
    throw new BadRequestException("نسخة التحرير مطلوبة؛ حدّث السجل قبل حفظه.");
  if (Number(expected) !== Number(row.edit_revision))
    throw new ConflictException({
      message:
        "عُدّل السجل بواسطة مستخدم آخر. راجع القيم الحالية وتعديلاتك قبل الحفظ.",
      conflict: { current, revision: Number(row.edit_revision) },
    });
}
