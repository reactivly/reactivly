// defineEndpoints.ts
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";

type EndpointConfig<T> = {
  sources: AnyPgTable[];
  fetch: () => Promise<T>;
};

type EndpointsMap = Record<string, EndpointConfig<any>>;

export async function defineEndpoints<TEndpoints extends EndpointsMap>(
  endpoints: TEndpoints
) {
  const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();

  // Map channel -> endpoint names
  const channelToEndpoints = new Map<string, string[]>();
  for (const [name, def] of Object.entries(endpoints)) {
    def.sources.forEach((src) => {
      const ch = `${getTableName(src)}_channel`;
      const arr = channelToEndpoints.get(ch);
      if (arr) arr.push(name);
      else channelToEndpoints.set(ch, [name]);
    });
  }

  // Listen to all channels
  for (const ch of channelToEndpoints.keys()) {
    await pgClient.query(`LISTEN "${ch}"`);
  }

  const wss = new WebSocketServer({ port: 3001 });
  const subscriptions = new Map<WebSocket, Set<string>>();

  // PostgreSQL NOTIFY handler
  pgClient.on("notification", async (msg) => {
    const endpointsAffected = channelToEndpoints.get(msg.channel);
    if (!endpointsAffected) return;

    for (const endpointName of endpointsAffected) {
      try {
        const data = await endpoints[endpointName]!.fetch();

        for (const [ws, subs] of subscriptions.entries()) {
          if (subs.has(endpointName) && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "dataUpdate", endpoint: endpointName, data }));
          }
        }
      } catch (err) {
        console.error(`Fetch failed for endpoint "${endpointName}":`, err);
      }
    }
  });

  // WebSocket connection
  wss.on("connection", (ws) => {
    subscriptions.set(ws, new Set());

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "subscribe" && Array.isArray(msg.endpoints)) {
          const subs = subscriptions.get(ws)!;
          msg.endpoints.forEach((ep: string) => subs.add(ep));

          // send initial snapshot
          for (const ep of msg.endpoints) {
            if (endpoints[ep]) {
              const data = await endpoints[ep].fetch();
              ws.send(JSON.stringify({ type: "dataUpdate", endpoint: ep, data }));
            }
          }
        }

        if (msg.type === "unsubscribe" && Array.isArray(msg.endpoints)) {
          const subs = subscriptions.get(ws)!;
          msg.endpoints.forEach((ep: string) => subs.delete(ep));
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    });

    ws.on("close", () => subscriptions.delete(ws));
  });

  console.log("✅ Reactive WebSocket server running on ws://localhost:3001");

  return { wss, pgClient, subscriptions, endpoints, channelToEndpoints } as const;
}
