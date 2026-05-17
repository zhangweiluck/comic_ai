export interface SqlQueryResult<T> {
  rows: T[];
}

export interface SqlDatabase {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>>;
}

export async function queryOne<T>(
  db: SqlDatabase,
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}
