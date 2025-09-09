import WebSocket, { WebSocketServer } from "ws";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import type {
  StoreReactiveSource,
  NotifierReactiveSource,
  Subscriber,
  ReactiveSource,
  LiveQueryResult,
  ClientSubscription,
} from "@reactivly/core";
import { AsyncLocalStorage } from "node:async_hooks";

export type { StoreReactiveSource, NotifierReactiveSource, ReactiveSource };

/* ---------------- AsyncLocalStorage ---------------- */
const sessionALS = new AsyncLocalStorage<{ sessionId: string }>();
function getCurrentSessionId(): string {
  const store = sessionALS.getStore();
  if (!store) throw new Error("sessionStore used outside of session context");
  return store.sessionId;
}

/* ---------------- Stateful Stores ---------------- */

/** Global store shared across sessions */
export function globalStore<T>(init: T): StoreReactiveSource<T> {
  const subj = new BehaviorSubject<T>(init);
  return {
    scope: "global",
    kind: "stateful",
    get: () => subj.getValue(),
    set: (val: T) => subj.next(val),
    mutate: (fn: (prev: T) => T) => subj.next(fn(subj.getValue())),
    subscribe: (fn: Subscriber<T>) => {
      const sub = subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    },
    notifyChanges: () => subj.next(subj.getValue()),
  };
}

/** Internal session store map */
function _sessionStore<T>(init: T) {
  const sessions = new Map<
    string,
    { subj: BehaviorSubject<T>; notifier: NotifierReactiveSource }
  >();
  function current(sessionId: string) {
    if (!sessions.has(sessionId)) {
      const subj = new BehaviorSubject<T>(init);
      const notifierSubj = new Subject<void>();
      const notifier: NotifierReactiveSource = {
        scope: "session",
        kind: "stateless",
        subscribe: (fn) => {
          const sub = notifierSubj.subscribe(fn);
          return { unsubscribe: () => sub.unsubscribe() };
        },
        notifyChanges: () => notifierSubj.next(),
      };
      sessions.set(sessionId, { subj, notifier });
    }
    return sessions.get(sessionId)!;
  }
  return {
    get(sessionId: string) {
      return current(sessionId).subj.getValue();
    },
    set(sessionId: string, val: T) {
      const { subj, notifier } = current(sessionId);
      subj.next(val);
      notifier.notifyChanges();
    },
    mutate(sessionId: string, fn: (prev: T) => T) {
      const { subj, notifier } = current(sessionId);
      subj.next(fn(subj.getValue()));
      notifier.notifyChanges();
    },
    subscribe(sessionId: string, fn: Subscriber<T>) {
      const { subj } = current(sessionId);
      const sub = subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    },
    notifyChanges(sessionId: string) {
      return current(sessionId).notifier;
    },
  };
}

/** Session-scoped store */
export function sessionStore<T>(init: T): StoreReactiveSource<T> {
  const internal = _sessionStore(init);
  return {
    scope: "session",
    kind: "stateful",
    get: () => internal.get(getCurrentSessionId()),
    set: (val: T) => internal.set(getCurrentSessionId(), val),
    mutate: (fn: (prev: T) => T) => internal.mutate(getCurrentSessionId(), fn),
    subscribe: (fn: Subscriber<T>) =>
      internal.subscribe(getCurrentSessionId(), fn),
    notifyChanges: () => internal.notifyChanges(getCurrentSessionId()),
  };
}

/** Client-scoped store (updated only by client) */
export function clientStore<T>(init: T): StoreReactiveSource<T> {
  const internal = _sessionStore(init);
  return {
    scope: "session",
    kind: "stateful",
    get: () => internal.get(getCurrentSessionId()),
    set: (val: T) => internal.set(getCurrentSessionId(), val),
    mutate: (fn: (prev: T) => T) => internal.mutate(getCurrentSessionId(), fn),
    subscribe: (fn: Subscriber<T>) =>
      internal.subscribe(getCurrentSessionId(), fn),
    notifyChanges: () => internal.notifyChanges(getCurrentSessionId()),
  };
}

/* ---------------- Derived Store ---------------- */
export interface DerivedStoreOptions<T> {
  deps?: ReactiveSource[];
  fn: () => T | Promise<T>;
  cache?: number;
  debounce?: number;
}
export function derivedStore<T>(
  opts: DerivedStoreOptions<T>
): StoreReactiveSource<T> {
  const { deps = [], fn, cache = Infinity, debounce } = opts;
  const hasCache = cache !== 0;
  let lastValue: T | undefined;
  let activeSubs = 0;
  const subj = hasCache
    ? new BehaviorSubject<T | undefined>(undefined)
    : new Subject<T>();
  let timeout: NodeJS.Timeout | null = null;
  let running = false;
  let pending = false;
  const run = async () => {
    if (debounce) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => execute(), debounce);
    } else await execute();
  };
  const execute = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      const result = await fn();
      if (hasCache) lastValue = result;
      subj.next(result);
      if (cache !== Infinity && hasCache)
        setTimeout(() => (lastValue = undefined), cache);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        run();
      }
    }
  };
  const depSubs: { unsubscribe(): void }[] = deps.map((d) => d.subscribe(run));
  return {
    scope: deps.some((d) => d.scope === "session") ? "session" : "global",
    kind: "stateful",
    get: () => {
      if (!hasCache)
        throw new Error("Cannot get value from non-cached derived store");
      if (lastValue === undefined) throw new Error("Value not yet initialized");
      return lastValue;
    },
    set: () => {
      throw new Error("Cannot set derived store");
    },
    mutate: () => {
      throw new Error("Cannot mutate derived store");
    },
    subscribe(fn: Subscriber<T>) {
      activeSubs++;
      if (hasCache && lastValue !== undefined) fn(lastValue);
      else run();
      const sub = subj.subscribe((val) => val !== undefined && fn(val));
      return {
        unsubscribe() {
          sub.unsubscribe();
          activeSubs--;
          if (activeSubs === 0) depSubs.forEach((s) => s.unsubscribe());
        },
      };
    },
    notifyChanges() {
      run();
    },
  };
}

/* ---------------- Effect ---------------- */
export interface EffectOptions {
  deps?: ReactiveSource[];
  fn: () => void | Promise<void>;
  immediate?: boolean;
}
export function effect(opts: EffectOptions) {
  const { deps = [], fn, immediate = false } = opts;
  if (immediate) fn();
  const sub = deps.map((d) => d.subscribe(fn));
  return { unsubscribe: () => sub.forEach((s) => s.unsubscribe()) };
}

/* ---------------- Stateless Sources ---------------- */
export function globalNotifier(): NotifierReactiveSource {
  const subj = new Subject<void>();
  return {
    scope: "global",
    kind: "stateless",
    subscribe: (fn: Subscriber<void>) => {
      const sub = subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    },
    notifyChanges: () => subj.next(),
  };
}
export function derivedNotifier(
  sources: ReactiveSource[]
): NotifierReactiveSource {
  const subj = new Subject<void>();
  const scope = sources.some((s) => s.scope === "session")
    ? "session"
    : "global";
  return {
    scope,
    kind: "stateless",
    subscribe: (fn) => {
      const subs = sources.map((s) => s.subscribe(() => subj.next()));
      const sub = subj.subscribe(fn);
      return {
        unsubscribe: () => {
          subs.forEach((s) => s.unsubscribe());
          sub.unsubscribe();
        },
      };
    },
    notifyChanges: () => subj.next(),
  };
}

/* ---------------- Queries & Mutations ---------------- */
export interface QueryOptions<TSchema, TResult> {
  schema?: TSchema;
  fn: (
    args: TSchema extends { parse: any } ? z.infer<TSchema> : undefined
  ) => TResult | Promise<TResult>;
  deps?: ReactiveSource[];
  cache?: number;
  debounce?: number;
}
export function query<TSchema = undefined, TResult = any>(
  opts: QueryOptions<TSchema, TResult>
) {
  return (input?: ReactiveSource | ReactiveSource[]) => {
    const inputs = Array.isArray(input) ? input : [input].filter(Boolean);
    const allDeps = [...(opts.deps ?? []), ...inputs];
    return derivedStore<TResult>({
      deps: allDeps,
      fn: () =>
        opts.fn(
          input
            ? Array.isArray(input)
              ? input.map((i) => ("get" in i ? i.get() : i))
              : "get" in input
                ? input.get()
                : input
            : undefined
        ),
      cache: opts.cache ?? 0,
      debounce: opts.debounce,
    });
  };
}
export interface MutationOptions<
  TSchema extends z.ZodTypeAny | undefined,
  TResult,
> {
  schema?: TSchema;
  fn: (
    args: TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined
  ) => TResult | Promise<TResult>;
}
export function mutation<
  TSchema extends z.ZodTypeAny | undefined,
  TResult = void,
>(opts: MutationOptions<TSchema, TResult>) {
  return async (
    args: TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined
  ): Promise<TResult> => {
    const parsed = opts.schema ? opts.schema.parse(args) : (undefined as any);
    return opts.fn(parsed);
  };
}

/* ---------------- WebSocket Server ---------------- */
/* ---------------- WebSocket Server ---------------- */
export function createReactiveWSServer<Endpoints extends Record<string, any>>(
  factory: () => Endpoints,
  port: number
) {
  const actions = factory();
  const wss = new WebSocketServer({ port });
  const sessionMap = new Map<WebSocket, string>();

  // Active queries per session
  interface ActiveQuery {
    store: LiveQueryResult<any>;
    subscribers: Map<string, { unsubscribe: () => void }>; // subId -> unsubscribe
  }
  const activeQueries = new Map<
    string, // key = `${sessionId}:${queryName}:${JSON.stringify(params)}`
    ActiveQuery
  >();

  // Run a function inside a session context
  function runWithSession<T>(sessionId: string, fn: () => T): T {
    return sessionALS.run({ sessionId }, fn);
  }

  wss.on("connection", (ws) => {
    const sessionId = crypto.randomUUID();
    sessionMap.set(ws, sessionId);

    ws.on("message", async (raw) => {
      const msg = JSON.parse(raw.toString());
      const fn = actions[msg.name];
      if (!fn) {
        return ws.send(
          JSON.stringify({
            type: "error",
            message: "Unknown action: " + msg.name,
          })
        );
      }

      await runWithSession(sessionId, async () => {
        if (msg.type === "subscribe") {
          const { subId, params } = msg;
          const key = `${sessionId}:${msg.name}:${JSON.stringify(params)}`;

          let active = activeQueries.get(key);

          // Start query if not already active
          if (!active) {
            const store = fn(params);
            if (!("subscribe" in store)) {
              // immediate (non-reactive) result
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: "update",
                    name: msg.name,
                    data: store,
                    subId,
                  })
                );
              }
              return;
            }
            active = { store, subscribers: new Map() };
            activeQueries.set(key, active);
          }

          // Add this client subscription
          const sub = active.store.subscribe((data: any) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({ type: "update", name: msg.name, data, subId })
              );
            }
          });
          active.subscribers.set(subId, sub);
        } else if (msg.type === "unsubscribe") {
          const { subId, params } = msg;
          const key = `${sessionId}:${msg.name}:${JSON.stringify(params)}`;
          const active = activeQueries.get(key);
          if (!active) return;

          const sub = active.subscribers.get(subId);
          if (sub) {
            sub.unsubscribe();
            active.subscribers.delete(subId);
          }

          if (active.subscribers.size === 0) {
            activeQueries.delete(key);
          }
        } else if (msg.type === "mutation") {
          const result = await fn(msg.params);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "mutationResult",
                name: msg.name,
                data: result,
                requestId: msg.requestId,
              })
            );
          }
        }
      });
    });

    ws.on("close", () => {
      // Cleanup all queries owned by this session
      for (const [key, active] of activeQueries.entries()) {
        if (key.startsWith(sessionId + ":")) {
          for (const sub of active.subscribers.values()) {
            sub.unsubscribe();
          }
          activeQueries.delete(key);
        }
      }
      sessionMap.delete(ws);
    });
  });

  console.log(`✅ Reactive WS server running on port ${port}`);
  return { wss, actions };
}
