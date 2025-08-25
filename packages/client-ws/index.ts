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
        this.ws!.addEventListener(
          "open",
          () => {
            this.ws!.send(
              JSON.stringify({ type: "subscribe", endpoint, params })
            );
          },
          { once: true }
        );
      }
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws!.send(
          JSON.stringify({ type: "unsubscribe", endpoint, params })
        );
      }
    };
  }
}

export const wsClient = new EndpointsWSClient();