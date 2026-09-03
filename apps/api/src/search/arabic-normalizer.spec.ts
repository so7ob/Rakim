import { describe, expect, it } from 'vitest';
import { normalizeArabic, normalizeArabicLiteral, parseSearchQuery } from './arabic-normalizer.js';

describe('Arabic normalization', () => {
  it('removes tashkeel and tatweel only in search representation', () => {
    expect(normalizeArabicLiteral('المَــالُ العام')).toBe('المال العام');
  });

  it('expands alef and ya and maps Arabic digit shapes', () => {
    expect(normalizeArabic('إعتماد رقم ١٤ لسنة ۱۹۹۰')).toBe('اعتماد رقم 14 لسنة 1990');
  });

  it('does not merge ta marbuta with ha by default', () => {
    expect(normalizeArabic('لائحة جهة')).toBe('لائحة جهة');
    expect(normalizeArabic('لائحة جهة', { normalizeTaMarbuta: true })).toBe('لائحه جهه');
  });

  it('parses exact and excluded terms', () => {
    expect(parseSearchQuery('"المال العام" الضريبة -الجمارك')).toEqual({
      phrases: ['المال العام'], include: ['الضريبة'], exclude: ['الجمارك'],
    });
  });
});
