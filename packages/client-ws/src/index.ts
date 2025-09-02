export class EndpointsWSClient {
  ws: WebSocket | null = null;
  subscriptions = new Map<string, Set<(data: any) => void>>();
  pendingCalls = new Map<string, (data: any) => void>();
  jwt: string | null = null; // store JWT locally

  init(url: string) {
    if (!this.ws) {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        // Send JWT to restore session if present
        if (this.jwt) {
          this.ws!.send(JSON.stringify({ type: "restoreSession", token: this.jwt }));
        }
      };

      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);

        if (msg.type === "dataUpdate") {
          const key = msg.endpoint + JSON.stringify(msg.params ?? {});
          this.subscriptions.get(key)?.forEach((cb) => cb(msg.data));
        }

        if (msg.type === "mutationSuccess" && msg.id) {
          const resolve = this.pendingCalls.get(msg.id);
          if (resolve) {
            resolve(msg.result ?? msg.data);
            this.pendingCalls.delete(msg.id);
          }
        }

        if (msg.type === "sessionUpdate" && msg.token) {
          // Update JWT locally
          this.jwt = msg.token;
          localStorage.setItem("jwt", msg.token); // persist across reloads
        }
      };

      this.ws.onclose = () => {
        // Optionally attempt reconnect after delay
        setTimeout(() => {
          this.ws = null;
          this.init(url);
        }, 1000);
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
        this.ws!.addEventListener("open", () => this.ws!.send(subscribeMsg), { once: true });
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

  call<K extends string>(endpoint: K, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws) return reject(new Error("WebSocket not initialized"));

      const id = crypto.randomUUID();
      this.pendingCalls.set(id, resolve);

      const msg = JSON.stringify({ type: "call", id, endpoint, params });

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(msg);
      } else {
        this.ws.addEventListener("open", () => this.ws!.send(msg), { once: true });
      }

      setTimeout(() => {
        if (this.pendingCalls.has(id)) {
          this.pendingCalls.delete(id);
          reject(new Error(`Timeout calling endpoint: ${endpoint}`));
        }
      }, 10000);
    });
  }
}

// On client load, restore JWT from localStorage
export const wsClient = new EndpointsWSClient();
wsClient.jwt = localStorage.getItem("jwt") || null;
