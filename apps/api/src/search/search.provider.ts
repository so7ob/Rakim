export interface SearchInput {
  q: string;
  page: number;
  pageSize: number;
  at?: string;
  historical: boolean;
  mode: "all" | "any" | "exact";
  field?: "all" | "title" | "number";
  type?: string;
  authority?: string;
  subject?: string;
  status?: string;
  yearFrom?: number;
  yearTo?: number;
  verification?: string;
  entityType?: string;
  proximityFirst?: string;
  proximitySecond?: string;
  proximityDistance?: number;
}
export interface SearchProvider {
  search(input: SearchInput): Promise<any>;
  analytics(input: SearchInput): Promise<unknown>;
  exportCsv(input: SearchInput): Promise<string>;
}
export const SEARCH_PROVIDER = Symbol("SEARCH_PROVIDER");
