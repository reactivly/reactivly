import pg from "pg";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import type { NotifierReactiveSource } from "@reactivly/server";

export function createPgNotifier({ connectionString }: { connectionString: string }) {
  const client = new pg.Client({ connectionString });

  const sources = new Map<PgTableWithColumns<any>, NotifierReactiveSource>();
  const subscribers = new Map<PgTableWithColumns<any>, Set<() => void>>();
  const connectedTables = new Set<PgTableWithColumns<any>>();

  let connectPromise: Promise<void> | null = null;

  async function ensureClient() {
    if (!connectPromise) {
      connectPromise = client.connect().then(() => {
        client.on("notification", (msg) => {
          for (const [table, src] of sources) {
            const channel = getTableName(table) + "_channel";
            if (msg.channel === channel) {
              subscribers.get(table)?.forEach((fn) =>
                Promise.resolve(fn()).catch(console.error)
              );
              src.notifyChanges();
            }
          }
        });
      });
    }
    await connectPromise;
  }

  function notifierFor<T extends PgTableWithColumns<any>>(table: T): NotifierReactiveSource {
    if (!sources.has(table)) {
      const subs = new Set<() => void>();
      subscribers.set(table, subs);

      const src: NotifierReactiveSource = {
        scope: "global",
        kind: "stateless",
        subscribe(fn) {
          subs.add(fn);
          if (!connectedTables.has(table)) {
            ensureClient().then(() =>
              client.query(`LISTEN "${getTableName(table)}_channel"`)
            );
            connectedTables.add(table);
          }
          return { unsubscribe: () => subs.delete(fn) };
        },
        notifyChanges() {
          subs.forEach((fn) => Promise.resolve(fn()).catch(console.error));
        },
      };

      sources.set(table, src);
    }
    return sources.get(table)!;
  }

  return { notifierFor };
}
