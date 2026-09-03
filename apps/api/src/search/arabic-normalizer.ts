export interface ArabicNormalizationOptions {
  normalizeYa?: boolean;
  normalizeTaMarbuta?: boolean;
}

const arabicDiacritics = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const digitMap: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function normalizeArabicLiteral(input: string): string {
  return input
    .normalize('NFKC')
    .replace(arabicDiacritics, '')
    .replace(/\u0640/g, '')
    .replace(/[٠-٩۰-۹]/g, (digit) => digitMap[digit] ?? digit)
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArabic(input: string, options: ArabicNormalizationOptions = {}): string {
  let output = normalizeArabicLiteral(input).replace(/[أإآٱ]/g, 'ا');
  if (options.normalizeYa !== false) output = output.replace(/ى/g, 'ي');
  if (options.normalizeTaMarbuta === true) output = output.replace(/ة/g, 'ه');
  return output;
}

export interface ParsedSearchQuery {
  phrases: string[];
  include: string[];
  exclude: string[];
}

export function parseSearchQuery(input: string): ParsedSearchQuery {
  const phrases: string[] = [];
  const withoutPhrases = input.replace(/"([^"]+)"/g, (_, phrase: string) => {
    const normalized = normalizeArabic(phrase);
    if (normalized) phrases.push(normalized);
    return ' ';
  });
  const include: string[] = [];
  const exclude: string[] = [];
  for (const token of withoutPhrases.split(/\s+/).filter(Boolean)) {
    const negative = token.startsWith('-');
    const normalized = normalizeArabic(negative ? token.slice(1) : token);
    if (!normalized) continue;
    (negative ? exclude : include).push(normalized);
  }
  return { phrases, include, exclude };
}

