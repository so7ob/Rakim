const labels: Record<string, string> = {
  INBOX: "وارد",
  QUEUED: "في الطابور",
  EXTRACTING: "جار الاستخراج",
  OCR_REQUIRED: "يحتاج OCR",
  OCR_RUNNING: "OCR جارٍ",
  READY_FOR_REVIEW: "جاهز للمراجعة",
  REVIEWED: "مراجع",
  FAILED: "فشل",
  DRAFT: "مسودة",
  IN_REVIEW: "قيد المراجعة",
  APPROVED_FOR_PUBLISHING: "معتمد للنشر",
  PUBLISHED: "منشور",
  ARCHIVED: "مؤرشف",
  SUCCEEDED: "ناجح",
  RUNNING: "جارٍ",
  ERROR: "خطأ",
  WARNING: "تحذير",
  INFO: "معلومة",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      {labels[status] ?? status}
    </span>
  );
}
