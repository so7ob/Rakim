export interface SearchInput { q: string; page: number; pageSize: number; at?: string; historical: boolean; }
export interface SearchProvider { search(input: SearchInput): Promise<unknown>; }
export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');

