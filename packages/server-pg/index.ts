import pg from "pg";
import { getTableName } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { ReactiveSource } from "@reactivly/server";

let sharedClient: pg.Client | null = null;
const channelListeners = new Map<string, Set<() => void>>();

export async function initPgReactive(connectionString: string) {
  if (sharedClient) return sharedClient;

  sharedClient = new pg.Client({ connectionString });
  await sharedClient.connect();

  sharedClient.on("notification", (msg) => {
    console.log(msg)
    const callbacks = channelListeners.get(msg.channel);
    if (callbacks) callbacks.forEach((cb) => cb());
  });

  return sharedClient;
}

export function pgReactiveSource(table: AnyPgTable): ReactiveSource {
  if (!sharedClient) {
    throw new Error("pgReactiveSource: call initPgReactive() first");
  }

  const tableName = getTableName(table);
  const channel = `${tableName}_channel`;

  return {
    id: `pg:${tableName}`,
    onChange(cb) {
      let callbacks = channelListeners.get(channel);
      if (!callbacks) {
        callbacks = new Set();
        channelListeners.set(channel, callbacks);
        sharedClient!.query(`LISTEN "${channel}"`);
      }
      callbacks.add(cb);
    },
  };
}
