export type StructureKind = "BAB" | "FASL" | "QISM";
export type StructureNodeType = "TITLE" | "CHAPTER" | "SECTION" | "SUBSECTION";
export type ExtractionStatus = "CONFIRMED" | "REVIEW_REQUIRED";

export interface ParsedStructureNode {
  key: string;
  kind: StructureKind;
  nodeType: StructureNodeType;
  label: string;
  number: string;
  title: string;
  parentKey: string | null;
  sortKey: string;
  documentOrder: number;
  sourceLine: number;
  status: ExtractionStatus;
  confidence: number;
}

export interface ParsedArticle {
  key: string;
  label: string;
  number: string;
  headingLabel: string;
  title: string | null;
  text: string;
  structureNodeKey: string | null;
  sortKey: string;
  documentOrder: number;
  sourceLine: number;
  status: ExtractionStatus;
  confidence: number;
}

export interface ParseIssue {
  code:
    | "STRUCTURE_NOT_DETECTED"
    | "UNRECOGNIZED_STRUCTURE_HEADING"
    | "STRUCTURE_TITLE_MISSING"
    | "ARTICLE_MARKERS_NOT_FOUND"
    | "UNASSIGNED_TEXT";
  message: string;
  sourceLine?: number;
  excerpt?: string;
}

export interface ParsedLegalStructure {
  schemaVersion: 2;
  parser: "arabic-legal-structure-v2";
  preamble: string;
  nodes: ParsedStructureNode[];
  articles: ParsedArticle[];
  issues: ParseIssue[];
  summary: {
    babs: number;
    fasls: number;
    qisms: number;
    articles: number;
    rootArticles: number;
    reviewRequired: number;
  };
}

const ordinalValues = new Map<string, number>([
  ["الاول", 1],
  ["الاولي", 1],
  ["الثاني", 2],
  ["الثانيه", 2],
  ["الثالث", 3],
  ["الثالثه", 3],
  ["الرابع", 4],
  ["الرابعه", 4],
  ["الخامس", 5],
  ["الخامسه", 5],
  ["السادس", 6],
  ["السادسه", 6],
  ["السابع", 7],
  ["السابعه", 7],
  ["الثامن", 8],
  ["الثامنه", 8],
  ["التاسع", 9],
  ["التاسعه", 9],
  ["العاشر", 10],
  ["العاشره", 10],
  ["الحادي عشر", 11],
  ["الحاديه عشره", 11],
  ["الثاني عشر", 12],
  ["الثانيه عشره", 12],
  ["الثالث عشر", 13],
  ["الثالثه عشره", 13],
  ["الرابع عشر", 14],
  ["الرابعه عشره", 14],
  ["الخامس عشر", 15],
  ["الخامسه عشره", 15],
  ["السادس عشر", 16],
  ["السادسه عشره", 16],
  ["السابع عشر", 17],
  ["السابعه عشره", 17],
  ["الثامن عشر", 18],
  ["الثامنه عشره", 18],
  ["التاسع عشر", 19],
  ["التاسعه عشره", 19],
  ["العشرون", 20],
  ["العشرين", 20],
]);

const kindByHeading = {
  الباب: { kind: "BAB", nodeType: "TITLE" },
  الفصل: { kind: "FASL", nodeType: "CHAPTER" },
  القسم: { kind: "QISM", nodeType: "SECTION" },
  الفرع: { kind: "QISM", nodeType: "SUBSECTION" },
} as const;

const structureRank = {
  الباب: 1,
  الفصل: 2,
  القسم: 3,
  الفرع: 4,
} as const;

const arabicIndicDigits = "٠١٢٣٤٥٦٧٨٩";
const pageMarker = /^\[صفحة\s+[0-9٠-٩]+\]$/u;

function normalizeArabicWord(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة/gu, "ه")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeDigits(value: string): string {
  return value.replace(/[٠-٩]/gu, (digit) =>
    String(arabicIndicDigits.indexOf(digit)),
  );
}

function numberValue(value: string): string | null {
  const normalized = normalizeDigits(value).replace(/\s+/gu, " ").trim();
  const numeric = normalized.match(/^([0-9]+)(\s+مكرر(?:\s+[\p{L}])?)?$/u);
  if (numeric)
    return `${Number(numeric[1])}${numeric[2] ? ` ${numeric[2].trim()}` : ""}`;
  const ordinal = ordinalValues.get(normalizeArabicWord(normalized));
  return ordinal ? String(ordinal) : null;
}

function compact(value: string): string {
  return value.replace(/[\t ]+/gu, " ").trim();
}

function isEscaped(value: string, index: number): boolean {
  let backslashes = 0;
  while (index > 0 && value[index - 1] === "\\") {
    backslashes += 1;
    index -= 1;
  }
  return backslashes % 2 === 1;
}

/**
 * Unwrap only balanced, word-delimited asterisk emphasis on one source line.
 * Matching whole runs of 1–3 stars keeps unmatched markers, list bullets and
 * arithmetic (including 2*3*4 and (2+3)*(4+5)*(6+7)) literal. No general
 * Markdown rendering occurs.
 */
function cleanMarkdownLine(line: string, hasFollowingLine: boolean): string {
  if (
    hasFollowingLine &&
    line.endsWith("\\") &&
    !isEscaped(line, line.length - 1)
  )
    line = line.slice(0, -1);

  const openers: Array<{ index: number; width: number }> = [];
  const removed = new Set<number>();
  const wordCharacter = /[\p{L}\p{M}\p{N}]/u;
  for (const match of line.matchAll(/\*+/gu)) {
    const index = match.index;
    const width = match[0].length;
    if (width > 3 || isEscaped(line, index)) continue;
    const before = line[index - 1] ?? "";
    const after = line[index + width] ?? "";
    const canOpen =
      !!after &&
      !/\s/u.test(after) &&
      !wordCharacter.test(before) &&
      !/\p{Pe}/u.test(before);
    const canClose =
      !!before && !/\s/u.test(before) && !wordCharacter.test(after);
    const opener = openers.at(-1);
    if (canClose && opener?.width === width) {
      removed.add(opener.index);
      removed.add(index);
      openers.pop();
    } else if (canOpen) {
      openers.push({ index, width });
    }
  }
  return line.replace(/\*+/gu, (marker, index: number) =>
    removed.has(index) ? "" : marker,
  );
}

function parseStructureHeading(line: string) {
  const match = compact(line).match(
    /^(الباب|الفصل|القسم|الفرع)\s+(?:رقم\s*)?([0-9٠-٩]+|[\p{L}]+(?:\s+[\p{L}]+)?)(?:\s*[:：\-–—ـ]+\s*|\s+)?(.*)$/u,
  );
  if (!match) return null;
  const number = numberValue(match[2]!);
  if (!number) return null;
  return {
    heading: match[1]! as keyof typeof kindByHeading,
    rawNumber: compact(match[2]!)
      .replace(/[:：\-–—ـ]+$/gu, "")
      .trim(),
    number,
    title: compact(match[3] ?? ""),
  };
}

function parseArticleHeading(line: string) {
  const match = compact(line).match(
    /^(المادة|مادة)\s*(?:رقم\s*)?[\(（]?\s*([0-9٠-٩]+(?:\s+مكرر(?:\s+[\p{L}])?)?|[\p{L}]+(?:\s+[\p{L}]+)?)\s*[\)）]?\s*(?:[:：\-–—ـ]+\s*)?(.*)$/u,
  );
  if (!match) return null;
  const number = numberValue(match[2]!);
  if (!number) return null;
  return {
    heading: match[1]!,
    rawNumber: compact(match[2]!)
      .replace(/[:：\-–—ـ]+$/gu, "")
      .trim(),
    number,
    body: compact(match[3] ?? ""),
  };
}

function isLikelyFollowingTitle(line: string): boolean {
  const value = compact(line);
  if (!value || value.length > 160 || value.split(/\s+/u).length > 14)
    return false;
  if (/[.!؟؛]$/u.test(value) || pageMarker.test(value)) return false;
  if (/^(?:الباب|الفصل|القسم|الفرع|المادة|مادة)(?:\s|$)/u.test(value))
    return false;
  return true;
}

function sortKey(order: number): string {
  return String(order).padStart(6, "0");
}

function excerpt(lines: string[]): string {
  return compact(lines.join(" ")).slice(0, 180);
}

/**
 * Parses explicit Arabic legal headings only. It never derives hierarchy from
 * article numbering; parentage comes exclusively from the active heading
 * context in document order.
 */
export function parseLegalStructure(text: string): ParsedLegalStructure {
  // Keep one cleaned line per source line so diagnostics retain their offsets.
  // The worker stores the original extracted text separately from this result.
  const lines = text
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line, index, sourceLines) =>
      cleanMarkdownLine(line, index < sourceLines.length - 1),
    );
  const nodes: ParsedStructureNode[] = [];
  const articles: ParsedArticle[] = [];
  const issues: ParseIssue[] = [];
  const preambleLines: string[] = [];
  let unassignedLines: string[] = [];
  let unassignedStartLine = 0;
  let currentArticle:
    (Omit<ParsedArticle, "text"> & { bodyLines: string[] }) | null = null;
  let currentBab: string | null = null;
  let currentFasl: string | null = null;
  let currentQism: string | null = null;
  let currentFar: string | null = null;
  let documentOrder = 0;
  let sawLegalToken = false;

  const flushUnassigned = () => {
    const value = excerpt(unassignedLines);
    if (value)
      issues.push({
        code: "UNASSIGNED_TEXT",
        message: "يوجد نص بين العناوين والمواد لم يُنسب تلقائيًا.",
        sourceLine: unassignedStartLine,
        excerpt: value,
      });
    unassignedLines = [];
    unassignedStartLine = 0;
  };
  const flushArticle = () => {
    if (!currentArticle) return;
    articles.push({
      ...currentArticle,
      text: currentArticle.bodyLines.join("\n").trim(),
    });
    currentArticle = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const contentLine = lines[index]!;
    const line = compact(contentLine);
    if (pageMarker.test(line)) continue;
    const structureHeading = parseStructureHeading(line);
    if (structureHeading) {
      const headingSourceLine = index + 1;
      flushArticle();
      flushUnassigned();
      sawLegalToken = true;
      documentOrder += 1;
      const metadata = kindByHeading[structureHeading.heading];
      const key = `node-${String(nodes.length + 1).padStart(4, "0")}`;
      const rank = structureRank[structureHeading.heading];
      const activeParents = [currentBab, currentFasl, currentQism, currentFar];
      const parentKey =
        [...activeParents.slice(0, rank - 1)].reverse().find(Boolean) ?? null;
      if (structureHeading.heading === "الباب") {
        currentBab = key;
        currentFasl = null;
        currentQism = null;
        currentFar = null;
      } else if (structureHeading.heading === "الفصل") {
        currentFasl = key;
        currentQism = null;
        currentFar = null;
      } else if (structureHeading.heading === "القسم") {
        currentQism = key;
        currentFar = null;
      } else {
        currentFar = key;
      }
      let title = structureHeading.title;
      if (!title) {
        let nextIndex = index + 1;
        while (nextIndex < lines.length && !compact(lines[nextIndex]!))
          nextIndex += 1;
        if (
          nextIndex < lines.length &&
          isLikelyFollowingTitle(lines[nextIndex]!)
        ) {
          title = compact(lines[nextIndex]!);
          index = nextIndex;
        }
      }
      const status: ExtractionStatus = title ? "CONFIRMED" : "REVIEW_REQUIRED";
      const label = `${structureHeading.heading} ${structureHeading.rawNumber}`;
      if (!title)
        issues.push({
          code: "STRUCTURE_TITLE_MISSING",
          message: `تعرّف المحلل على ${label} دون عنوان واضح.`,
          sourceLine: headingSourceLine,
          excerpt: line,
        });
      nodes.push({
        key,
        kind: metadata.kind,
        nodeType: metadata.nodeType,
        label,
        number: structureHeading.number,
        title: title || label,
        parentKey,
        sortKey: sortKey(documentOrder),
        documentOrder,
        sourceLine: headingSourceLine,
        status,
        confidence: title ? 0.99 : 0.82,
      });
      continue;
    }

    const articleHeading = parseArticleHeading(line);
    if (articleHeading) {
      flushArticle();
      flushUnassigned();
      sawLegalToken = true;
      documentOrder += 1;
      const key = `article-${String(articles.length + 1).padStart(4, "0")}`;
      currentArticle = {
        key,
        label: articleHeading.rawNumber,
        number: articleHeading.number,
        headingLabel: `${articleHeading.heading} ${articleHeading.rawNumber}`,
        title: null,
        structureNodeKey:
          currentFar ?? currentQism ?? currentFasl ?? currentBab,
        sortKey: sortKey(articles.length + 1),
        documentOrder,
        sourceLine: index + 1,
        status: "CONFIRMED",
        confidence: 0.98,
        bodyLines: articleHeading.body ? [articleHeading.body] : [],
      };
      continue;
    }

    if (/^(?:الباب|الفصل|القسم|الفرع)(?:\s|$)/u.test(line)) {
      const heading = line.match(/^(الباب|الفصل|القسم|الفرع)(?:\s|$)/u)?.[1];
      flushArticle();
      flushUnassigned();
      sawLegalToken = true;
      if (heading === "الباب") {
        currentBab = null;
        currentFasl = null;
        currentQism = null;
        currentFar = null;
      } else if (heading === "الفصل") {
        currentFasl = null;
        currentQism = null;
        currentFar = null;
      } else if (heading === "القسم") {
        currentQism = null;
        currentFar = null;
      } else currentFar = null;
      issues.push({
        code: "UNRECOGNIZED_STRUCTURE_HEADING",
        message: "عنوان بنية محتمل لم يُفسر، ولذلك لم يُخترع له أب.",
        sourceLine: index + 1,
        excerpt: line.slice(0, 180),
      });
      continue;
    }

    if (currentArticle) {
      currentArticle.bodyLines.push(contentLine.trimEnd());
    } else if (!sawLegalToken) {
      preambleLines.push(contentLine.trimEnd());
    } else if (line) {
      if (!unassignedLines.length) unassignedStartLine = index + 1;
      unassignedLines.push(contentLine.trimEnd());
    }
  }
  flushArticle();
  flushUnassigned();

  if (!articles.length) {
    documentOrder += 1;
    const fallbackText = lines.join("\n").trim();
    articles.push({
      key: "article-0001",
      label: "1",
      number: "1",
      headingLabel: "المادة 1",
      title: null,
      text: fallbackText,
      structureNodeKey: currentFar ?? currentQism ?? currentFasl ?? currentBab,
      sortKey: sortKey(1),
      documentOrder,
      sourceLine: 1,
      status: "REVIEW_REQUIRED",
      confidence: 0.35,
    });
    issues.push({
      code: "ARTICLE_MARKERS_NOT_FOUND",
      message:
        "لم تُكتشف عناوين مواد صريحة؛ حُفظ النص مادة واحدة تتطلب المراجعة.",
      sourceLine: 1,
    });
  }
  if (!nodes.length)
    issues.push({
      code: "STRUCTURE_NOT_DETECTED",
      message:
        "تم استخراج المواد، لكن لم يتم التعرف على بنية الأبواب والفصول والأقسام.",
    });

  return {
    schemaVersion: 2,
    parser: "arabic-legal-structure-v2",
    preamble: preambleLines.join("\n").trim(),
    nodes,
    articles,
    issues,
    summary: {
      babs: nodes.filter((node) => node.kind === "BAB").length,
      fasls: nodes.filter((node) => node.kind === "FASL").length,
      qisms: nodes.filter((node) => node.kind === "QISM").length,
      articles: articles.length,
      rootArticles: articles.filter((article) => !article.structureNodeKey)
        .length,
      reviewRequired: issues.length,
    },
  };
}
