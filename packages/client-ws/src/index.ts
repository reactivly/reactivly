export class EndpointsWSClient {
  ws: WebSocket | null = null;
  subscriptions = new Map<string, Set<(data: any) => void>>();
  pendingCalls = new Map<string, (data: any, error?: string) => void>();

  init(url: string) {
    if (this.ws) return;

    this.ws = new WebSocket(url);

    this.ws.onmessage = ev => {
      const msg = JSON.parse(ev.data.toString());

      if (msg.type === "update") {
        const key = msg.name + (msg.params ? JSON.stringify(msg.params) : "");
        this.subscriptions.get(key)?.forEach(cb => cb(msg.data));
      }

      if (msg.type === "mutationResult" && msg.requestId) {
        const resolve = this.pendingCalls.get(msg.requestId);
        if (resolve) {
          resolve(msg.data);
          this.pendingCalls.delete(msg.requestId);
        }
      }

      if (msg.type === "error" && msg.requestId) {
        const resolve = this.pendingCalls.get(msg.requestId);
        if (resolve) {
          resolve(undefined, msg.error);
          this.pendingCalls.delete(msg.requestId);
        }
      }
    };
  }

  subscribe(endpoint: string, params: any, cb: (data: any) => void) {
    const key = endpoint + (params ? JSON.stringify(params) : "");
    let set = this.subscriptions.get(key);
    if (!set) {
      set = new Set();
      this.subscriptions.set(key, set);

      const msg = JSON.stringify({ type: "subscribe", name: endpoint, params });
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(msg);
      else
        this.ws?.addEventListener("open", () => {
          this.ws!.send(msg);
        }, { once: true });
    }

    set.add(cb);

    return () => {
      set!.delete(cb);
      if (set!.size === 0) {
        const msg = JSON.stringify({ type: "unsubscribe", name: endpoint, params });
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(msg);
      }
    };
  }

  call(endpoint: string, params: any): Promise<any> {
    if (!this.ws) return Promise.reject(new Error("WS not initialized"));
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      this.pendingCalls.set(requestId, (data, error) => {
        if (error) reject(new Error(error));
        else resolve(data);
      });

      const msg = JSON.stringify({ type: "mutation", name: endpoint, params, requestId });

      if (this.ws.readyState === WebSocket.OPEN) this.ws.send(msg);
      else
        this.ws.addEventListener("open", () => {
          this.ws!.send(msg);
        }, { once: true });

      setTimeout(() => {
        if (this.pendingCalls.has(requestId)) {
          this.pendingCalls.delete(requestId);
          reject(new Error(`Timeout calling ${endpoint}`));
        }
      }, 10000);
    });
  }
}

export const wsClient = new EndpointsWSClient();
