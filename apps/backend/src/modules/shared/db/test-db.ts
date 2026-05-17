import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import type { SqlDatabase } from "./sql.ts";

export type TestDatabase = PGlite & SqlDatabase;

export async function createMigratedTestDb(): Promise<TestDatabase> {
  const db = new PGlite(`memory://${randomUUID()}`) as TestDatabase;
  const migration = await readFile(
    join(process.cwd(), "packages", "db", "migrations", "0001_foundation.sql"),
    "utf8",
  );

  await db.exec(migration);
  return db;
}

export async function listTableNames(db: SqlDatabase): Promise<string[]> {
  const result = await db.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `,
  );

  return result.rows.map((row) => row.table_name);
}

export async function listColumnNames(
  db: SqlDatabase,
  tableName: string,
): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `,
    [tableName],
  );

  return result.rows.map((row) => row.column_name);
}
