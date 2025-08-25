// defineEndpoints.ts
import { WebSocketServer, WebSocket } from "ws";
import pg from "pg";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import type z from "zod";


// Endpoint WITH input
export type EndpointWithInput<
  Sources extends readonly AnyPgTable[],
  Input extends z.ZodTypeAny,
  Result
> = {
  sources: Sources;
  input: Input;
  fetch: (params: z.infer<Input>) => Promise<Result>;
};

// Endpoint WITHOUT input
export type EndpointWithoutInput<
  Sources extends readonly AnyPgTable[],
  Result
> = {
  sources: Sources;
  fetch: () => Promise<Result>;
  input?: undefined;
};

// Union type for generic handling
export type AnyEndpoint<Sources extends readonly any[] = any[], Result = any> =
  | EndpointWithInput<Sources, z.ZodTypeAny, Result>
  | EndpointWithoutInput<Sources, Result>;

// Generic Endpoint type for inference
export type Endpoint = AnyEndpoint;

export function defineEndpoint<Sources extends readonly AnyPgTable[], Result>(
  endpoint: EndpointWithoutInput<Sources, Result>
): EndpointWithoutInput<Sources, Result>;

export function defineEndpoint<
  Sources extends readonly AnyPgTable[],
  Input extends z.ZodTypeAny,
  Result
>(
  endpoint: EndpointWithInput<Sources, Input, Result>
): EndpointWithInput<Sources, Input, Result>;

export function defineEndpoint(endpoint: any) {
  return endpoint;
}

export async function defineEndpoints<
  Endpoints extends Record<string, AnyEndpoint>
>(endpoints: Endpoints, options: { connectionString?: string }) {
  type EndpointName = keyof Endpoints;

  // --- Postgres client ---
  const pgClient = new pg.Client({
    connectionString: options.connectionString,
  });
  await pgClient.connect();

  // --- Build channel -> endpoints mapping ---
  const channelToEndpoints = new Map<string, EndpointName[]>();
  for (const key in endpoints) {
    const ep = endpoints[key]!;
    for (const table of ep.sources) {
      const ch = `${getTableName(table)}_channel`;
      const arr = channelToEndpoints.get(ch);
      if (arr) {
        if (!arr.includes(key)) arr.push(key);
      } else {
        channelToEndpoints.set(ch, [key]);
      }
    }
  }

  // Subscribe to LISTEN for all channels
  for (const ch of channelToEndpoints.keys()) {
    await pgClient.query(`LISTEN "${ch}"`);
  }

  // --- WebSocket server ---
  const wss = new WebSocketServer({ port: 3001 });
  const subscriptions = new Map<WebSocket, Map<EndpointName, any>>();

  // Validate params using Zod schema
  function validateParams<K extends EndpointName>(key: K, params: any) {
    const endpoint = endpoints[key]!;
    if (endpoint.input) {
      return endpoint.input.parse(params);
    }
    return params ?? null;
  }

  // --- On DB NOTIFY, re-fetch and broadcast ---
  pgClient.on("notification", async (msg) => {
    const affectedEndpoints = channelToEndpoints.get(msg.channel);
    if (!affectedEndpoints) return;

    for (const endpointKey of affectedEndpoints) {
      const ep = endpoints[endpointKey]!;
      for (const [ws, endpointMap] of subscriptions.entries()) {
        if (endpointMap.has(endpointKey) && ws.readyState === WebSocket.OPEN) {
          const params = endpointMap.get(endpointKey);
          const data = await ep.fetch(params);
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: endpointKey, params, data }));
        }
      }
    }
  });

  // --- Handle WebSocket messages ---
  wss.on("connection", (ws) => {
    subscriptions.set(ws, new Map());

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: "subscribe"; endpoint: EndpointName; params?: any }
          | { type: "unsubscribe"; endpoint: EndpointName }
          | { type: "fetch"; endpoint: EndpointName; params?: any };

        const endpointMap = subscriptions.get(ws)!;
        const ep = endpoints[msg.endpoint];

        if (!ep) throw new Error(`Unknown endpoint: ${String(msg.endpoint)}`);

        if (msg.type === "subscribe") {
          const params = validateParams(msg.endpoint, msg.params);
          endpointMap.set(msg.endpoint, params);
          const data = await ep!.fetch(params);
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: msg.endpoint, params, data }));

        } else if (msg.type === "unsubscribe") {
          endpointMap.delete(msg.endpoint);

        } else if (msg.type === "fetch") {
          const data = await ep.fetch(msg.params ?? null);
          ws.send(JSON.stringify({ type: "fetchResult", endpoint: msg.endpoint, params: msg.params ?? null, data }));
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    });

    ws.on("close", () => subscriptions.delete(ws));
  });

  console.log("✅ Reactive WS server running at ws://localhost:3001");

  return { wss, pgClient, subscriptions, endpoints, channelToEndpoints } as const;
}
