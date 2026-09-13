export const expectedMigrations: string[];
export function assertSchemaCompatible(
  query: (sql: string) => Promise<Array<Record<string, unknown>>>,
): Promise<void>;
