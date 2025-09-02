import { WebSocketServer, WebSocket } from "ws";
import type { AnyEndpoint } from "./queries.js";
import type { AnyMutation } from "./mutations.js";
export { defineEndpoint } from "./queries.js";
export { defineMutation } from "./mutations.js";
export { type ReactiveSource } from "./reactivity.js";
import { parseCookie, createJwt, verifyJwt } from "./jwt.js";

declare module "ws" {
  interface WebSocket {
    session?: any;
  }
}

export type EndpointOrMutation = AnyEndpoint | AnyMutation;

export type EndpointContext = {
  session?: any;
  ws: WebSocket;
};

export async function defineEndpoints<Endpoints extends Record<string, EndpointOrMutation>>(
  endpoints: Endpoints
) {
  type EndpointName = keyof Endpoints;

  // Map each source ID -> endpoints that depend on it
  const sourceToEndpoints = new Map<string, EndpointName[]>();
  for (const key in endpoints) {
    const ep = endpoints[key]!;
    // if (!("sources" in ep)) continue;
    for (const src of ep.sources ?? []) {
      const arr = sourceToEndpoints.get(src.id) ?? [];
      if (!arr.includes(key)) arr.push(key);
      sourceToEndpoints.set(src.id, arr);
      src.onChange(() => notifyEndpoints(key));
    }
  }

  // --- WebSocket server ---
  const wss = new WebSocketServer({ port: 3001 });
  const subscriptions = new Map<WebSocket, Map<EndpointName, any>>();

  function validateParams<K extends EndpointName>(key: K, params: any) {
    const endpoint = endpoints[key]!;
    if ("input" in endpoint && endpoint.input) return endpoint.input.parse(params);
    return params ?? null;
  }

  async function notifyEndpoints(endpointKey: EndpointName) {
    const ep = endpoints[endpointKey]!;
    for (const [ws, endpointMap] of subscriptions.entries()) {
      if (endpointMap.has(endpointKey) && ws.readyState === WebSocket.OPEN) {
        const params = endpointMap.get(endpointKey);
        const ctx: EndpointContext = { ws, session: ws.session };
        const data = await ep.fetch({ ctx, params });
        ws.send(JSON.stringify({ type: "dataUpdate", endpoint: endpointKey, params, data }));
      }
    }
  }

  // --- WS handlers ---
  wss.on("connection", (ws, req) => {
  subscriptions.set(ws, new Map());

  // Restore session from JWT in cookie if present
  const cookies = parseCookie(req.headers.cookie);
  ws.session = cookies.jwt ? verifyJwt(cookies.jwt) : null;

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as
        | { type: "subscribe"; endpoint: string; params?: any }
        | { type: "unsubscribe"; endpoint: string }
        | { type: "fetch"; endpoint: string; params?: any }
        | { type: "call"; endpoint: string; params?: any; id: string }
        | { type: "restoreSession"; token: string };

      // --- Handle restoreSession ---
      if (msg.type === "restoreSession" && msg.token) {
        const session = verifyJwt(msg.token);
        if (session) {
          ws.session = session;
          console.log("✅ Session restored from JWT", session);
        } else {
          ws.session = null;
          console.log("⚠️ Invalid JWT, session not restored");
        }
        return;
      }

      const ep = endpoints[msg.endpoint];
      if (!ep) throw new Error(`Unknown endpoint: ${String(msg.endpoint)}`);

      const endpointMap = subscriptions.get(ws)!;

      if (msg.type === "subscribe") {
        const params = validateParams(msg.endpoint, msg.params);
        endpointMap.set(msg.endpoint, params);
        const ctx: EndpointContext = { ws, session: ws.session };
        const data = await ep.fetch({ ctx, params });
        ws.send(JSON.stringify({ type: "dataUpdate", endpoint: msg.endpoint, params, data }));

      } else if (msg.type === "unsubscribe") {
        endpointMap.delete(msg.endpoint);

      } else if ("query" in ep && msg.type === "fetch") {
        const params = validateParams(msg.endpoint, msg.params);
        const ctx: EndpointContext = { ws, session: ws.session };
        const data = await ep.fetch({ ctx, params });
        ws.send(JSON.stringify({ type: "fetchResult", endpoint: msg.endpoint, params, data }));

      } else if ("mutate" in ep && msg.type === "call") {
        const params = "input" in ep && ep.input ? ep.input.parse(msg.params) : msg.params ?? null;
        const ctx: EndpointContext = { ws, session: ws.session };
        const result = await ep.mutate({ ctx, params });

        // Update JWT if session changed
        if (ctx.session) {
          ws.session = ctx.session;
          const token = createJwt(ctx.session);
          ws.send(JSON.stringify({ type: "sessionUpdate", token }));
        }

        ws.send(JSON.stringify({ type: "mutationSuccess", endpoint: msg.endpoint, id: msg.id, result }));
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
