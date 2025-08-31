import { initPgReactive } from "@reactivly/server-pg";
import { getTableName } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { ReactiveSource } from "@reactivly/server";

export async function initDrizzlePgReactive<
  T extends Record<string, AnyPgTable>,
>(
  tables: T,
  { connectionString }: { connectionString: string }
): Promise<{ [K in keyof T]: ReactiveSource }> {
  const tableNames = Object.fromEntries(
    Object.entries(tables).map(([key, table]) => [key, getTableName(table)])
  );
  return initPgReactive(tableNames, { connectionString });
}
