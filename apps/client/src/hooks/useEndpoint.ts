import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import type { EndpointParams, Endpoints } from "@apps/server";

// wsClient.ts (singleton, no hooks)
export class EndpointsWSClient {
  ws: WebSocket | null = null;
  subscriptions = new Map<string, Set<(data: any) => void>>();

  init(url: string) {
    if (!this.ws) {
      this.ws = new WebSocket(url);
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "dataUpdate") {
          const key = msg.endpoint + JSON.stringify(msg.params ?? {});
          this.subscriptions.get(key)?.forEach((cb) => cb(msg.data));
        }
      };
    }
  }

  subscribe<K extends string>(
    endpoint: K,
    params: any,
    cb: (data: any) => void
  ) {
    const key = endpoint + JSON.stringify(params ?? {});
    let set = this.subscriptions.get(key);
    if (!set) {
      set = new Set();
      this.subscriptions.set(key, set);
      if (this.ws!.readyState === WebSocket.OPEN) {
        this.ws!.send(JSON.stringify({ type: "subscribe", endpoint, params }));
      } else {
        this.ws!.addEventListener("open", () => {
          this.ws!.send(JSON.stringify({ type: "subscribe", endpoint, params }));
        }, { once: true });
      }
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws!.send(JSON.stringify({ type: "unsubscribe", endpoint, params }));
      }
    };
  }
}

const wsClient = new EndpointsWSClient();
wsClient.init("ws://localhost:3001");

// Infer keys, params, and return types
type EndpointKeys = keyof Endpoints;
type EndpointResult<K extends EndpointKeys> =
  Endpoints[K] extends { fetch: (...args: any) => Promise<infer R> } ? R : never;

export function useEndpoints() {
  const queryClient = useQueryClient();

  return {
    query<K extends EndpointKeys>(
      endpoint: K,
      params?: EndpointParams<K>
    ): UseQueryResult<EndpointResult<K>, Error> {
      return useQuery({
        queryKey: [endpoint, params ?? {}],
        queryFn: () =>
          new Promise<EndpointResult<K>>((resolve) => {
            const unsub = wsClient.subscribe(endpoint, params ?? {}, (data) => {
              resolve(data);
              // Keep live updates in cache
              queryClient.setQueryData([endpoint, params ?? {}], data);
            });
          }),
        staleTime: Infinity,
      });
    },
  };
}