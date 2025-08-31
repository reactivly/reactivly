import { WebSocketServer, WebSocket } from "ws";
import type { AnyEndpoint } from "./queries.js";
import type { AnyMutation } from "./mutations.js";
export { defineEndpoint } from "./queries.js"
export { defineMutation } from "./mutations.js"
export { type ReactiveSource } from "./reactivity.js"

export type EndpointOrMutation =
  | AnyEndpoint
  | AnyMutation;


export async function defineEndpoints<
  Endpoints extends Record<string, EndpointOrMutation>
>(endpoints: Endpoints) {
  type EndpointName = keyof Endpoints;

  // Map each source ID -> endpoints that depend on it
  const sourceToEndpoints = new Map<string, EndpointName[]>();
  for (const key in endpoints) {
    const ep = endpoints[key]!;
    // if ("mutation" in ep) return;
    for (const src of (ep.sources ?? [])) {
      // console.log(ep)
      const arr = sourceToEndpoints.get(src.id) ?? [];
      if (!arr.includes(key)) arr.push(key);
      sourceToEndpoints.set(src.id, arr);
      src.onChange(() => notifyEndpoints(key)); // Subscribe once per source
    }
  }

  // --- WebSocket server ---
  const wss = new WebSocketServer({ port: 3001 });
  const subscriptions = new Map<WebSocket, Map<EndpointName, any>>();

  function validateParams<K extends EndpointName>(key: K, params: any) {
    const endpoint = endpoints[key]!;
    if (endpoint.input) return endpoint.input.parse(params);
    return params ?? null;
  }

  async function notifyEndpoints(endpointKey: EndpointName) {
    const ep = endpoints[endpointKey]!;
    for (const [ws, endpointMap] of subscriptions.entries()) {
      if (endpointMap.has(endpointKey) && ws.readyState === WebSocket.OPEN) {
        const params = endpointMap.get(endpointKey);
        const data = await ep.fetch(params);
        ws.send(JSON.stringify({ type: "dataUpdate", endpoint: endpointKey, params, data }));
      }
    }
  }

  // --- WS handlers ---
  wss.on("connection", (ws) => {
    subscriptions.set(ws, new Map());

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as
          | { type: "subscribe"; endpoint: EndpointName; params?: any }
          | { type: "unsubscribe"; endpoint: EndpointName }
          | { type: "fetch"; endpoint: EndpointName; params?: any }
          | { type: "call"; endpoint: EndpointName; params?: any; id: string };

        const ep = endpoints[msg.endpoint];
        if (!ep) throw new Error(`Unknown endpoint: ${String(msg.endpoint)}`);

        const endpointMap = subscriptions.get(ws)!;

        if (msg.type === "subscribe") {
          const params = validateParams(msg.endpoint, msg.params);
          endpointMap.set(msg.endpoint, params);
          const data = await ep.fetch(params);
          ws.send(JSON.stringify({ type: "dataUpdate", endpoint: msg.endpoint, params, data }));

        } else if (msg.type === "unsubscribe") {
          endpointMap.delete(msg.endpoint);

        } else if ("query" in ep && msg.type === "fetch") {
          const data = await ep.fetch(msg.params ?? null);
          ws.send(JSON.stringify({ type: "fetchResult", endpoint: msg.endpoint, params: msg.params ?? null, data }));
        
        } else if ("mutate" in ep && msg.type === "call") {
          console.log("message received", msg.params)
          const params = ep.input ? ep.input.parse(msg.params) : msg.params ?? null;
          const result = await ep.mutate(params);
          ws.send(JSON.stringify({ type: "mutationSuccess", endpoint: msg.endpoint, id: msg.id, result }));
          return;
        }
      } catch (err) {
        console.error("Invalid WS message:", err);
      }
    });

    ws.on("close", () => subscriptions.delete(ws));
  });

  console.log("✅ Reactive WS server running at ws://localhost:3001");

  return { wss, subscriptions, endpoints, sourceToEndpoints };
}
