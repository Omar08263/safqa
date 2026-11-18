import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

export interface Database {
  db: PostgresJsDatabase<typeof schema>;
  sql: Sql;
}

export function createDatabase(url = process.env.DATABASE_URL): Database {
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, {
    max: 10,
    onnotice: () => {
      // CREATE IF NOT EXISTS notices are expected on every boot.
    },
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}
