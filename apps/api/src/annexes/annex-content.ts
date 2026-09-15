import { BadRequestException } from "@nestjs/common";

export type AnnexContentFormat = "TEXT" | "STRUCTURED_TABLE" | "FILE";
export type AnnexTypeCode =
  | "EXECUTIVE_REGULATION"
  | "TABLE"
  | "FORM"
  | "ANNEX"
  | "MAP"
  | "TARIFF"
  | "LIST"
  | "CORRECTION";

export const ANNEX_TYPE_OPTIONS: ReadonlyArray<{
  code: AnnexTypeCode;
  labelAr: string;
  allowedContentFormats: AnnexContentFormat[];
  defaultContentFormat: AnnexContentFormat;
}> = [
  {
    code: "EXECUTIVE_REGULATION",
    labelAr: "لائحة تنفيذية",
    allowedContentFormats: ["TEXT", "FILE"],
    defaultContentFormat: "TEXT",
  },
  {
    code: "TABLE",
    labelAr: "جدول",
    allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
    defaultContentFormat: "STRUCTURED_TABLE",
  },
  {
    code: "FORM",
    labelAr: "نموذج",
    allowedContentFormats: ["FILE"],
    defaultContentFormat: "FILE",
  },
  {
    code: "ANNEX",
    labelAr: "ملحق",
    allowedContentFormats: ["TEXT", "FILE"],
    defaultContentFormat: "TEXT",
  },
  {
    code: "MAP",
    labelAr: "خريطة",
    allowedContentFormats: ["FILE"],
    defaultContentFormat: "FILE",
  },
  {
    code: "TARIFF",
    labelAr: "تعرفة",
    allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
    defaultContentFormat: "STRUCTURED_TABLE",
  },
  {
    code: "LIST",
    labelAr: "قائمة",
    allowedContentFormats: ["STRUCTURED_TABLE", "FILE"],
    defaultContentFormat: "STRUCTURED_TABLE",
  },
  {
    code: "CORRECTION",
    labelAr: "تصحيح",
    allowedContentFormats: ["TEXT", "FILE"],
    defaultContentFormat: "TEXT",
  },
];

export const ANNEX_CONTENT_FORMATS = [
  { code: "TEXT" as const, labelAr: "نص" },
  { code: "STRUCTURED_TABLE" as const, labelAr: "جدول منظم" },
  { code: "FILE" as const, labelAr: "ملف" },
];

export function annexTypeOption(code: string) {
  const option = ANNEX_TYPE_OPTIONS.find((item) => item.code === code);
  if (!option) throw new BadRequestException("نوع الملحق غير صالح.");
  return option;
}

export function assertAnnexContentFormat(type: string, format: string) {
  const option = annexTypeOption(type);
  if (!option.allowedContentFormats.includes(format as AnnexContentFormat))
    throw new BadRequestException("طريقة المحتوى لا تتوافق مع نوع الملحق.");
  return format as AnnexContentFormat;
}

export type StructuredTableValue = {
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

export function parseStructuredTable(value: unknown): StructuredTableValue {
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (value.length > 1_000_000)
      throw new BadRequestException("JSON الجدول يتجاوز الحجم المسموح.");
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new BadRequestException("JSON الجدول المنظم غير صالح.");
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new BadRequestException("يجب أن يحتوي الجدول على columns وrows.");
  const { columns, rows } = parsed as Record<string, unknown>;
  if (!Array.isArray(columns) || !columns.length || columns.length > 100)
    throw new BadRequestException("أعمدة الجدول مطلوبة وبحد أقصى 100 عمود.");
  if (
    columns.some(
      (column) =>
        typeof column !== "string" || !column.trim() || column.length > 500,
    )
  )
    throw new BadRequestException(
      "عناوين الأعمدة يجب أن تكون نصوصًا غير فارغة.",
    );
  if (!Array.isArray(rows) || rows.length > 10_000)
    throw new BadRequestException("صفوف الجدول غير صالحة أو تتجاوز 10000 صف.");
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== columns.length)
      throw new BadRequestException(
        "يجب أن يطابق عدد خلايا كل صف عدد الأعمدة.",
      );
    if (
      row.some(
        (cell) => !["string", "number"].includes(typeof cell) && cell !== null,
      ) ||
      row.some((cell) => typeof cell === "string" && cell.length > 10_000)
    )
      throw new BadRequestException(
        "خلايا الجدول تقبل النص أو الرقم أو القيمة الفارغة فقط.",
      );
  }
  return {
    columns: columns.map((column) => column.trim()),
    rows: rows as StructuredTableValue["rows"],
  };
}

export function annexOptionsResponse() {
  return { types: ANNEX_TYPE_OPTIONS, contentFormats: ANNEX_CONTENT_FORMATS };
}
