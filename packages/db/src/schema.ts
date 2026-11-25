// The tables as they are in production (apps/api/migrations). schema.test.ts proves the two agree.
import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/** Counters: `rev` numbers each change to memory, `epoch` numbers the data generation. */
export const state = sqliteTable(
  "state",
  {
    key: text("key"),
    value: integer("value").notNull(),
  },
  // A table-level key: the production column is `TEXT PRIMARY KEY` without NOT NULL.
  (table) => [primaryKey({ columns: [table.key] })]
);

/** One row per learned item. `stamp` is the time of its last review; `rev` is when it last changed here. */
export const memory = sqliteTable(
  "memory",
  {
    id: text("id"),
    data: text("data").notNull(),
    stamp: integer("stamp").notNull(),
    rev: integer("rev").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("memory_rev").on(table.rev),
  ]
);

/** Every review ever made. Rows are only added. */
export const log = sqliteTable("log", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  uid: text("uid").notNull().unique(),
  data: text("data").notNull(),
});

/**
 * The journal: what happened in the app, kept to find out later why it behaved as it did.
 * Rows are only added, and "Start over" leaves them. `at`, `kind` and `session` are copies of
 * fields in `data`, as columns, so that a query can filter on them.
 */
export const event = sqliteTable(
  "event",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    uid: text("uid").notNull().unique(),
    at: integer("at").notNull(),
    kind: text("kind").notNull(),
    session: text("session"),
    data: text("data").notNull(),
  },
  (table) => [
    index("event_at").on(table.at),
    index("event_session").on(table.session),
  ]
);

/** Settings and counters, as one document in one row. */
export const meta = sqliteTable(
  "meta",
  {
    id: integer("id"),
    data: text("data").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    check("meta_one_row", sql`${table.id} = 1`),
  ]
);

// Better Auth's tables. It made them with the column type `date`, and writes ISO text into them.
const date = customType<{ data: string; driverData: string }>({
  dataType: () => "date",
});

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified").notNull(),
  image: text("image"),
  createdAt: date("createdAt").notNull(),
  updatedAt: date("updatedAt").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: date("expiresAt").notNull(),
    token: text("token").notNull().unique(),
    createdAt: date("createdAt").notNull(),
    updatedAt: date("updatedAt").notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: date("accessTokenExpiresAt"),
    refreshTokenExpiresAt: date("refreshTokenExpiresAt"),
    scope: text("scope"),
    password: text("password"),
    createdAt: date("createdAt").notNull(),
    updatedAt: date("updatedAt").notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expiresAt").notNull(),
    createdAt: date("createdAt").notNull(),
    updatedAt: date("updatedAt").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
