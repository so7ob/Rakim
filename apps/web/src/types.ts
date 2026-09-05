export interface FilterOption {
  code: string;
  name: string;
  count?: number;
}
export interface LegislationSummary {
  id: string;
  displayCode: string;
  officialNumber: string;
  year: number;
  titleAr: string;
  summaryAr: string;
  legalStatus: string;
  verificationLevel: string;
  issueDate: string;
  effectiveFrom: string;
  typeCode: string;
  typeName: string;
  authorityCode: string;
  authorityName: string;
  articleCount: number;
  amendmentCount: number;
  annexCount: number;
}
export interface ListResponse {
  items: LegislationSummary[];
  meta: { page: number; pageSize: number; total: number; pageCount: number };
  filters: {
    types: FilterOption[];
    authorities: FilterOption[];
    subjects: FilterOption[];
    years: Array<{ year: number; count: number }>;
  };
}
export interface LegislationDetail extends LegislationSummary {
  preambleText: string | null;
  workflowStatus: string;
  publicationDate: string;
  repealDate: string | null;
  lastReviewedAt: string;
  gazetteIssue: string;
  relationCount: number;
}
export interface StructureNode {
  id: string;
  parentId: string | null;
  nodeType: string;
  labelAr: string;
  titleAr: string;
  sortKey: string;
}
export interface ArticleItem {
  id: string;
  structureNodeId: string;
  publishedLabel: string;
  currentLabel: string;
  sortKey: string;
  versionId: string;
  versionNo: number;
  textOriginal: string;
  textStructured: string;
  validFrom: string;
  validTo: string | null;
  status: string;
  versionCount: number;
  previousCount: number;
  futureCount: number;
}
export interface ArticleList {
  at: string;
  items: ArticleItem[];
}
export interface PreviousVersion {
  id: string;
  versionNo: number;
  fullText: string;
  validFrom: string;
  validTo: string;
  endingReason: string;
  sourceName: string;
}
