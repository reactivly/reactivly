import { WebSocketServer, WebSocket } from "ws";
import type { AnyEndpoint } from "./queries.js";
import type { AnyMutation } from "./mutations.js";
export { defineEndpoint } from "./queries.js";
export { defineMutation } from "./mutations.js";
export { type ReactiveSource } from "./reactivity.js";

export type EndpointOrMutation = AnyEndpoint | AnyMutation;

export type EndpointContext = {
  sessionRS?: any; // reactive source per client
  ws: WebSocket;
};

// Session-RS factory (per WS)
let _nextSessionRSId = 1;
export function createSessionRS<T>(initial: T) {
  const id = `sessionRS-${_nextSessionRSId++}`;
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    id,
    get value() {
      return value;
    },
    set value(v: T) {
      value = v;
      listeners.forEach(cb => cb(value));
    },
    onChange(cb: (v: T) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}

// defineEndpoints takes a factory that returns endpoints per WS
export function defineEndpoints<Endpoints extends Record<string, EndpointOrMutation>>(factory: () => Endpoints) {
  const endpointsTemplate = factory();

  const wss = new WebSocketServer({ port: 3001 });
  const subscriptions = new Map<WebSocket, Set<string>>(); // endpoints this WS subscribed to

  wss.on("connection", ws => {
    subscriptions.set(ws, new Set());

    // Create a sessionRS for this WS
    const sessionRS = createSessionRS<any>(null);
    const endpoints = factory(); // fresh endpoints for this WS

    // Build source -> endpoints map
    const sourceToEndpoints = new Map<string, string[]>();
    for (const key in endpoints) {
      const ep = endpoints[key];
      for (const src of ep.sources ?? []) {
        const arr = sourceToEndpoints.get(src.id) ?? [];
        if (!arr.includes(key)) arr.push(key);
        sourceToEndpoints.set(src.id, arr);

        // Listen to source changes
        src.onChange(() => {
          const eps = sourceToEndpoints.get(src.id) ?? [];
          eps.forEach(epKey => {
            if (subscriptions.get(ws)?.has(epKey)) {
              sendEndpointUpdate(ws, epKey, null);
            }
          });
        });
      }
    }

    // --- WS message handler ---
    ws.on("message", async raw => {
      try {
        const msg = JSON.parse(raw.toString());
        const ep = endpoints[msg.endpoint];
        if (!ep) throw new Error(`Unknown endpoint: ${msg.endpoint}`);

        const ctx: EndpointContext = { ws, sessionRS };
        const params = msg.params ?? null;

        if ("fetch" in ep && (msg.type === "subscribe" || msg.type === "fetch")) {
          subscriptions.get(ws)?.add(msg.endpoint);
          const data = await ep.fetch({ ctx, params });
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: msg.endpoint, params, data }));
        }

        if ("mutate" in ep && msg.type === "call") {
          const result = await ep.mutate({ ctx, params });
          ws.send(JSON.stringify({ type: "mutationSuccess", endpoint: msg.endpoint, id: msg.id, result }));
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    });

    ws.on("close", () => subscriptions.delete(ws));

    // Helper to refresh endpoint
    async function sendEndpointUpdate(ws: WebSocket, endpointKey: string, params: any) {
      const ep = endpoints[endpointKey];
      if (!ep || !("fetch" in ep)) return;
      const ctx: EndpointContext = { ws, sessionRS };
      const data = await ep.fetch({ ctx, params });
      ws.send(JSON.stringify({ type: "dataUpdate", endpoint: endpointKey, params, data }));
    }
  });

  console.log("✅ Reactive WS server running at ws://localhost:3001");
  return { wss, subscriptions, endpoints: endpointsTemplate };
}
