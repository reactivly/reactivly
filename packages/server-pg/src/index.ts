import pg from "pg";
import type { ReactiveSource } from "@reactivly/server";

type TableMap = Record<string, string>;
type ReactiveSources<T extends TableMap> = {
  [K in keyof T]: ReactiveSource;
};

let sharedClient: pg.Client | null = null;
const channelListeners = new Map<string, Set<() => void>>();

export async function initPgReactive<T extends TableMap>(
  tables: T,
  { connectionString }: { connectionString: string }
): Promise<ReactiveSources<T>> {
  if (!sharedClient) {
    sharedClient = new pg.Client({ connectionString });
    await sharedClient.connect();

    sharedClient.on("notification", (msg) => {
      const callbacks = channelListeners.get(msg.channel);
      if (callbacks) callbacks.forEach((cb) => cb());
    });
  }

  const sources = Object.fromEntries(
    Object.entries(tables).map(([key, tableName]) => {
      const channel = `${tableName}_channel`;
      return [
        key,
        {
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
        },
      ];
    })
  ) as ReactiveSources<T>;

  return sources;
}
