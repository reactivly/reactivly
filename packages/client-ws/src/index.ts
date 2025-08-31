export class EndpointsWSClient {
  ws: WebSocket | null = null;
  subscriptions = new Map<string, Set<(data: any) => void>>();
  pendingCalls = new Map<string, (data: any) => void>();

  init(url: string) {
    if (!this.ws) {
      this.ws = new WebSocket(url);

      this.ws.onmessage = (ev) => {
        console.log(ev.data)
        const msg = JSON.parse(ev.data);

        if (msg.type === "dataUpdate") {
          const key = msg.endpoint + JSON.stringify(msg.params ?? {});
          this.subscriptions.get(key)?.forEach((cb) => cb(msg.data));
        }

        if (msg.type === "mutationSuccess" && msg.id) {
          const resolve = this.pendingCalls.get(msg.id);
          if (resolve) {
            resolve(msg.data);
            this.pendingCalls.delete(msg.id);
          }
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

      const subscribeMsg = JSON.stringify({ type: "subscribe", endpoint, params });

      if (this.ws!.readyState === WebSocket.OPEN) {
        this.ws!.send(subscribeMsg);
      } else {
        this.ws!.addEventListener(
          "open",
          () => this.ws!.send(subscribeMsg),
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

  call<K extends string>(endpoint: K, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        return reject(new Error("WebSocket not initialized"));
      }

      const id = crypto.randomUUID();
      this.pendingCalls.set(id, resolve);

      const msg = JSON.stringify({ type: "call", id, endpoint, params });
      console.log(msg)
      console.log(this.ws.readyState === WebSocket.OPEN)

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(msg);
        console.log("message sent")
      } else {
        this.ws.addEventListener(
          "open",
          () => this.ws!.send(msg),
          { once: true }
        );
      }

      // Optional timeout to avoid hanging forever
      setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          reject(new Error(`Timeout calling endpoint: ${endpoint}`));
        }
      }, 10000);
    });
  }
}

export const wsClient = new EndpointsWSClient();
