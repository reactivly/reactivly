// defineEndpoints.ts
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import type z from "zod";

// One endpoint = source tables + fetcher + optional Zod input
export type Endpoint<
  Sources extends readonly AnyPgTable[],
  Params = undefined,
  R = any
> = {
  sources: Sources;
  input?: z.ZodType; // optional Zod schema
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

  // Validate params using Zod schema
  function validateParams<K extends EndpointName>(key: K, params: any) {
    const endpoint = endpoints[key]!;
    if (endpoint.input) {
      return endpoint.input.parse(params);
    }
    return params ?? null;
  }

  // On DB NOTIFY, fetch and broadcast
  pgClient.on("notification", async (msg) => {
    const affectedEndpoints = channelToEndpoints.get(msg.channel);
    if (!affectedEndpoints) return;

    for (const endpointKey of affectedEndpoints) {
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
    subscriptions.set(ws, new Map());

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: "subscribe"; endpoint: EndpointName; params?: any }
          | { type: "unsubscribe"; endpoint: EndpointName; params?: any };

        const endpointMap = subscriptions.get(ws)!;

        if (msg.type === "subscribe") {
          const params = validateParams(msg.endpoint, msg.params);
          endpointMap.set(msg.endpoint, params);
          const data = await endpoints[msg.endpoint]!.fetch(params);
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: msg.endpoint, params, data }));
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
