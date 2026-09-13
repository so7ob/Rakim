export const legalStatusLabels: Record<string, string> = {
  IN_FORCE: "ساري",
  AMENDED: "معدّل",
  REPEALED: "ملغى",
  PARTIALLY_REPEALED: "ملغى جزئيًا",
  SUSPENDED: "موقوف",
  UNKNOWN: "غير محدد",
};

export function formatLegalDate(value: string | null | undefined) {
  if (!value) return "غير محدد";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-YE", {
    calendar: "gregory",
    numberingSystem: "latn",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
