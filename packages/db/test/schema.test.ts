// Proves that the Drizzle schema describes the production tables.
//
// One database gets the migration files, as production did. Another gets the SQL that drizzle-kit
// generates for src/schema.ts. SQLite is then asked to describe both, and the answers must be equal.
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, expect, test } from "vitest";

interface Column {
  cid: number;
  dflt_value: string | null;
  name: string;
  notnull: number;
  pk: number;
  type: string;
}

interface IndexEntry {
  name: string;
  origin: string;
  partial: number;
  unique: number;
}

interface ForeignKey {
  from: string;
  id: number;
  match: string;
  on_delete: string;
  on_update: string;
  seq: number;
  table: string;
  to: string;
}

const rows = async <Row>(db: D1Database, query: string) => {
  const { results } = await db.prepare(query).all<Row>();

  return results;
};

/** A CHECK expression without quoting, spacing or the table's own name in front of a column. */
const checksOf = (table: string, sql: string) =>
  [...sql.matchAll(/CHECK\s*\((?<expression>[^)]*)\)/giu)]
    .map((match) =>
      (match.groups?.expression ?? "")
        .replaceAll(/["`\s]/gu, "")
        .replaceAll(`${table}.`, "")
        .toLowerCase()
    )
    .toSorted();

const describeTable = async (db: D1Database, table: string, sql: string) => {
  const columns = await rows<Column>(db, `PRAGMA table_xinfo("${table}")`);
  const keys = columns.filter((column) => column.pk > 0);

  // An INTEGER PRIMARY KEY is the row's own number and can never be null, whether or not the
  // column says NOT NULL. Drizzle always writes NOT NULL after AUTOINCREMENT; production did not.
  const isRowNumber = (column: Column) =>
    keys.length === 1 &&
    column.pk === 1 &&
    column.type.toLowerCase() === "integer";

  const indexes = await rows<IndexEntry>(db, `PRAGMA index_list("${table}")`);

  const described = await Promise.all(
    indexes
      // The index SQLite makes for a primary key follows from the key columns above.
      .filter((index) => index.origin !== "pk")
      .map(async (index) => {
        const parts = await rows<{ name: string }>(
          db,
          `PRAGMA index_info("${index.name}")`
        );

        const on = parts.map((part) => part.name).join(",");

        // `UNIQUE` on a column (production) and a unique index (Drizzle) are the same rule under
        // different names, so a unique index is compared by its columns only.
        return index.unique === 1
          ? `unique(${on})`
          : `${index.name}(${on}) partial=${index.partial}`;
      })
  );

  const foreignKeys = await rows<ForeignKey>(
    db,
    `PRAGMA foreign_key_list("${table}")`
  );

  return {
    autoincrement: /AUTOINCREMENT/iu.test(sql),
    checks: checksOf(table, sql),
    columns: columns.map((column) => ({
      ...column,
      notnull: isRowNumber(column) ? "row number" : column.notnull,
      type: column.type.toLowerCase(),
    })),
    foreignKeys,
    indexes: described.toSorted(),
  };
};

const describeDatabase = async (db: D1Database) => {
  const tables = await rows<{ name: string; sql: string }>(
    db,
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'
     ORDER BY name`
  );

  const described = await Promise.all(
    tables.map(
      async (table) =>
        [table.name, await describeTable(db, table.name, table.sql)] as const
    )
  );

  return Object.fromEntries(described);
};

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);

  await env.DRIZZLE_DB.batch(
    env.DRIZZLE_SQL.map((statement) => env.DRIZZLE_DB.prepare(statement))
  );
});

test("the Drizzle schema creates the same tables as the production migrations", async () => {
  const production = await describeDatabase(env.DB);
  const fromDrizzle = await describeDatabase(env.DRIZZLE_DB);

  expect(Object.keys(production)).toEqual([
    "account",
    "event",
    "log",
    "memory",
    "meta",
    "session",
    "state",
    "user",
    "verification",
  ]);
  expect(fromDrizzle).toEqual(production);
});

test("the comparison notices a difference", async () => {
  await env.DRIZZLE_DB.exec("ALTER TABLE memory ADD COLUMN extra TEXT");

  expect(await describeDatabase(env.DRIZZLE_DB)).not.toEqual(
    await describeDatabase(env.DB)
  );
});
