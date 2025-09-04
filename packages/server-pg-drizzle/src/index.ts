import { collectDependency, type NotifierReactiveSource } from "@reactivly/server";
import pg from "pg";
import type { AnyPgTable, PgTableWithColumns } from "drizzle-orm/pg-core";
import { getTableName, Table } from "drizzle-orm";

export function createPgNotifierProxy({ connectionString }: { connectionString: string }) {
  const client = new pg.Client({ connectionString });
  const sources = new Map<PgTableWithColumns<any>, NotifierReactiveSource>();
  const channels = new Map<PgTableWithColumns<any>, string>();

  let connected = false;
  async function ensureClient() {
    if (!connected) {
      await client.connect();
      client.on("notification", (msg) => {
        for (const [table, src] of sources) {
          const channel = channels.get(table)!;
          if (msg.channel === channel) {
            src.notifyChanges(); // use the public API
          }
        }
      });
      connected = true;
    }
  }

  return {
    proxy: <T extends PgTableWithColumns<any>>(table: T) => {
      if (!sources.has(table)) {
        const channel = `${getTableName(table)}_channel`;
        channels.set(table, channel);

        const subscribers = new Set<() => void>();

        const src: NotifierReactiveSource = {
          scope: "global",
          kind: "stateless",
          subscribe(fn) {
            fn(); // initial trigger
            if (!connected) ensureClient();
            client.query(`LISTEN "${channel}"`);
            subscribers.add(fn);
            return {
              unsubscribe: () => subscribers.delete(fn),
            };
          },
          notifyChanges() {
            for (const fn of subscribers) fn();
          },
        };

        sources.set(table, src);
      }

      const src = sources.get(table)!;
      collectDependency(src); // implicit dependency tracking
      return table; // return the Drizzle table for queries
    },
  };
};
