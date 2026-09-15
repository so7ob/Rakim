import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AnnexContentView,
  readStructuredTable,
  type AnnexContentFormat,
} from "../AnnexContentView";

export interface AnnexOptions {
  types: Array<{
    code: string;
    labelAr: string;
    allowedContentFormats: AnnexContentFormat[];
    defaultContentFormat: AnnexContentFormat;
  }>;
  contentFormats: Array<{ code: AnnexContentFormat; labelAr: string }>;
}

export interface AnnexDetail {
  id: string;
  legislationId: string;
  annexType: string;
  annexTypeLabel: string;
  titleAr: string;
  status: string;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  workflowRevision: number;
  pendingCorrectionId: string | null;
  actions: Record<
    "review" | "publish" | "return",
    {
      available: boolean;
      allowed: boolean;
      message: string | null;
      policyChecks: Array<{
        code: string;
        message: string;
        applies: boolean;
        allowed: boolean;
        result: string;
      }>;
    }
  >;
  editFingerprint: string;
  version: {
    versionId: string;
    validFrom: string;
    validTo: string | null;
    sourceDocumentId: string;
    contentFormat: AnnexContentFormat;
    textContent: string | null;
    structuredTableJson: string | null;
    source: {
      id: string;
      originalName: string;
      mediaType: string;
      pageCount: number | null;
    };
    contentFile: {
      id: string;
      originalName: string;
      mediaType: string;
      byteSize: number;
      pageCount: number | null;
    } | null;
    attachment: {
      id: string;
      originalName: string;
      mediaType: string;
    } | null;
  };
}

export function AnnexContentFields({
  options,
  sources,
  legislationId,
  initial,
  canReplace = false,
  canRepeal = false,
}: {
  options: AnnexOptions;
  sources: Array<{ id: string; originalName: string; mediaType: string }>;
  legislationId: string;
  initial?: AnnexDetail;
  canPublish?: boolean;
  canReplace?: boolean;
  canRepeal?: boolean;
}) {
  const firstType = initial?.annexType ?? options.types[0]?.code ?? "ANNEX";
  const typeOption = (code: string) =>
    options.types.find((option) => option.code === code) ?? options.types[0]!;
  const [annexType, setAnnexType] = useState(firstType);
  const [contentFormat, setContentFormat] = useState<AnnexContentFormat>(
    initial?.version.contentFormat ??
      typeOption(firstType).defaultContentFormat,
  );
  const [textContent, setTextContent] = useState(
    initial?.version.textContent ?? "",
  );
  const [structuredTableJson, setStructuredTableJson] = useState(
    initial?.version.structuredTableJson ??
      '{\n  "columns": ["الحقل"],\n  "rows": [\n    ["القيمة"]\n  ]\n}',
  );
  const [sourceDocumentId, setSourceDocumentId] = useState(
    initial?.version.sourceDocumentId ?? sources[0]?.id ?? "",
  );
  const allSources = useMemo(() => {
    const current = initial?.version.source;
    return current && !sources.some((source) => source.id === current.id)
      ? [current, ...sources]
      : sources;
  }, [initial, sources]);
  const selectedType = typeOption(annexType);
  const formatLabel = (code: AnnexContentFormat) =>
    options.contentFormats.find((format) => format.code === code)?.labelAr ??
    code;
  const fileSources = useMemo(() => {
    const compatible = allSources.filter((source) =>
      ["application/pdf", "image/png", "image/jpeg"].includes(source.mediaType),
    );
    const legacySource = allSources.find(
      (source) =>
        initial?.version.contentFormat === "FILE" &&
        source.id === initial.version.sourceDocumentId,
    );
    return legacySource &&
      !compatible.some((source) => source.id === legacySource.id)
      ? [legacySource, ...compatible]
      : compatible;
  }, [allSources, initial]);
  const selectableSources = contentFormat === "FILE" ? fileSources : allSources;
  const selectedSource = allSources.find(
    (source) => source.id === sourceDocumentId,
  );
  const tablePreview = useMemo(() => {
    if (contentFormat !== "STRUCTURED_TABLE") return null;
    try {
      return { value: readStructuredTable(structuredTableJson), error: "" };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "JSON الجدول غير صالح.",
      };
    }
  }, [contentFormat, structuredTableJson]);
  const chooseFormat = (next: AnnexContentFormat) => {
    if (
      initial &&
      contentFormat === initial.version.contentFormat &&
      next !== initial.version.contentFormat &&
      !window.confirm(
        "سيُحفظ المحتوى بطريقة مختلفة عند تنفيذ الحفظ. هل تريد المتابعة؟",
      )
    )
      return;
    setContentFormat(next);
    if (
      next === "FILE" &&
      !fileSources.some((source) => source.id === sourceDocumentId)
    )
      setSourceDocumentId(fileSources[0]?.id ?? "");
  };
  const chooseType = (next: string) => {
    const nextType = typeOption(next);
    if (!nextType.allowedContentFormats.includes(contentFormat)) {
      const nextFormat = nextType.defaultContentFormat;
      if (
        initial &&
        contentFormat === initial.version.contentFormat &&
        nextFormat !== initial.version.contentFormat &&
        !window.confirm(
          "النوع الجديد يستخدم طريقة محتوى مختلفة. هل تريد المتابعة؟",
        )
      )
        return;
      setContentFormat(nextFormat);
      if (
        nextFormat === "FILE" &&
        !fileSources.some((source) => source.id === sourceDocumentId)
      )
        setSourceDocumentId(fileSources[0]?.id ?? "");
    }
    setAnnexType(next);
  };
  const administrativeStatuses = initial
    ? [
        initial.status,
        ...(canReplace && initial.status !== "REPLACED" ? ["REPLACED"] : []),
        ...(canRepeal && initial.status !== "REPEALED" ? ["REPEALED"] : []),
      ]
    : [];
  return (
    <>
      <div className="form-columns">
        <label>
          العنوان
          <input name="titleAr" defaultValue={initial?.titleAr} required />
        </label>
        <label>
          النوع
          <select
            name="annexType"
            value={annexType}
            onChange={(event) => chooseType(event.target.value)}
          >
            {options.types.map((option) => (
              <option key={option.code} value={option.code}>
                {option.labelAr}
              </option>
            ))}
          </select>
        </label>
        <label>
          {initial?.status === "PUBLISHED" ? "تاريخ نفاذ التصحيح" : "النفاذ"}
          <input
            name={
              initial?.status === "PUBLISHED" ? "effectiveFrom" : "validFrom"
            }
            type="date"
            defaultValue={
              initial?.status === "PUBLISHED"
                ? new Date().toISOString().slice(0, 10)
                : (initial?.version.validFrom ??
                  new Date().toISOString().slice(0, 10))
            }
            required
          />
        </label>
        {administrativeStatuses.length > 1 && (
          <label>
            الحالة الإدارية
            <select name="status" defaultValue={initial?.status}>
              {administrativeStatuses.map((status) => (
                <option key={status} value={status}>
                  {
                    {
                      DRAFT: "مسودة",
                      REVIEWED: "مراجع وجاهز للنشر",
                      PUBLISHED: "منشور",
                      REPLACED: "مستبدل",
                      REPEALED: "ملغى",
                    }[status]
                  }
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <fieldset className="annex-content-methods">
        <legend>طريقة إدخال المحتوى</legend>
        <div className="choice-row">
          {selectedType.allowedContentFormats.map((format) => (
            <label key={format}>
              <input
                type="radio"
                name="contentFormat"
                value={format}
                checked={contentFormat === format}
                onChange={() => chooseFormat(format)}
              />
              {formatLabel(format)}
            </label>
          ))}
        </div>
      </fieldset>
      {contentFormat === "TEXT" && (
        <label>
          نص المحتوى
          <textarea
            name="textContent"
            value={textContent}
            onChange={(event) => setTextContent(event.target.value)}
            placeholder="اكتب نص الملحق دون تنسيق HTML"
            required
          />
        </label>
      )}
      {contentFormat === "STRUCTURED_TABLE" && (
        <>
          <label>
            جدول منظم JSON
            <textarea
              className="annex-json-editor"
              name="structuredTableJson"
              dir="ltr"
              value={structuredTableJson}
              onChange={(event) => setStructuredTableJson(event.target.value)}
              required
            />
          </label>
          {tablePreview?.error ? (
            <p className="form-error" role="alert">
              {tablePreview.error}
            </p>
          ) : tablePreview?.value ? (
            <div className="annex-live-preview">
              <strong>معاينة الجدول</strong>
              <AnnexContentView
                contentFormat="STRUCTURED_TABLE"
                structuredTable={tablePreview.value}
                title="معاينة"
                compact
              />
            </div>
          ) : null}
        </>
      )}
      <label>
        {contentFormat === "FILE" ? "ملف المحتوى" : "المصدر الساند"}
        <select
          name="sourceDocumentId"
          value={sourceDocumentId}
          onChange={(event) => setSourceDocumentId(event.target.value)}
          required
        >
          {selectableSources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.originalName}
            </option>
          ))}
        </select>
      </label>
      {contentFormat === "FILE" && !fileSources.length && (
        <p className="form-error">
          لا يوجد PDF أو صورة مرتبطة بالتشريع. أضف الملف من{" "}
          <Link to={`/ar/admin/content/${legislationId}/sources`}>
            تبويب المصادر
          </Link>
          .
        </p>
      )}
      {contentFormat === "FILE" && selectedSource && (
        <div className="annex-live-preview">
          <strong>معاينة الملف</strong>
          <AnnexContentView
            contentFormat="FILE"
            fileUrl={`/api/v1/admin/sources/${selectedSource.id}/file`}
            fileName={selectedSource.originalName}
            mediaType={selectedSource.mediaType}
            title={initial?.titleAr ?? "معاينة الملحق"}
            compact
          />
        </div>
      )}
      {initial && (
        <input
          type="hidden"
          name="editFingerprint"
          value={initial.editFingerprint}
        />
      )}
    </>
  );
}
