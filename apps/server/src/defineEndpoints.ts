// defineEndpoints.ts
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";

// One endpoint = source tables + fetcher that can take params
export type Endpoint<Sources extends readonly AnyPgTable[], Params, R> = {
  sources: Sources;
  fetch: (params?: Params) => Promise<R>;
};

export default async function defineEndpoints<
  E extends Record<string, Endpoint<readonly AnyPgTable[], any, any>>
>(endpoints: E) {
  type EndpointName = keyof E;

  // Postgres client
  const pgClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await pgClient.connect();

  // Build channel -> endpoints mapping
  const endpointKeys = Object.keys(endpoints) as EndpointName[];
  const channelToEndpoints = new Map<string, EndpointName[]>();

  for (const key of endpointKeys) {
    for (const table of endpoints[key]!.sources) {
      const ch = `${getTableName(table)}_channel`;
      const arr = channelToEndpoints.get(ch);
      if (arr) {
        if (!arr.includes(key)) arr.push(key);
      } else {
        channelToEndpoints.set(ch, [key]);
      }
    }
  }

  // Subscribe Postgres LISTEN to all channels
  for (const ch of channelToEndpoints.keys()) {
    await pgClient.query(`LISTEN "${ch}"`);
  }

  // WebSocket server
  const wss = new WebSocketServer({ port: 3001 });
  const subscriptions = new Map<WebSocket, Map<EndpointName, any>>(); // track params

  // On DB NOTIFY, fetch and broadcast
  pgClient.on("notification", async (msg) => {
    console.log("DB NOTIFY:", msg.channel);
    const affectedEndpoints = channelToEndpoints.get(msg.channel);
    if (!affectedEndpoints) return;

    for (const endpointKey of affectedEndpoints) {
      // Re-fetch for all params currently subscribed
      for (const [ws, endpointMap] of subscriptions.entries()) {
        if (endpointMap.has(endpointKey) && ws.readyState === WebSocket.OPEN) {
          const params = endpointMap.get(endpointKey);
          const data = await endpoints[endpointKey]!.fetch(params);
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: endpointKey, params, data }));
        }
      }
    }
  });

  // WS subscribe/unsubscribe
  wss.on("connection", (ws) => {
    console.log("New WebSocket connection");
    subscriptions.set(ws, new Map());

    ws.on("message", async (raw) => {
      console.log("WS message:", raw.toString());
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: "subscribe"; endpoint: EndpointName; params?: any }
          | { type: "unsubscribe"; endpoint: EndpointName; params?: any };

        const endpointMap = subscriptions.get(ws)!;

        if (msg.type === "subscribe") {
          endpointMap.set(msg.endpoint, msg.params ?? null);
          const data = await endpoints[msg.endpoint]!.fetch(msg.params);
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: msg.endpoint, params: msg.params, data }));
        } else if (msg.type === "unsubscribe") {
          endpointMap.delete(msg.endpoint);
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    });

    ws.on("close", () => subscriptions.delete(ws));
  });

  console.log("✅ Reactive WebSocket server running on ws://localhost:3001");

  return {
    wss,
    pgClient,
    subscriptions,
    endpoints,
    channelToEndpoints,
  } as const;
}
