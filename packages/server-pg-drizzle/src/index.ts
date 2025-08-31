import { pgReactiveSource } from "@reactivly/server-pg";
import { getTableName } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { ReactiveSource } from "@reactivly/server";

export function pgDrizzleReactiveSource(table: AnyPgTable): ReactiveSource {
  return pgReactiveSource(getTableName(table));
}
