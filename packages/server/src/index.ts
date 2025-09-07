import WebSocket, { WebSocketServer } from "ws";
import { BehaviorSubject, Subject } from "rxjs";
import { Subscription, timer } from "rxjs";
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

/* ---------------- Dependency Tracking ---------------- */
let currentDeps: NotifierReactiveSource[] | null = null;

export function collectDependency(dep: NotifierReactiveSource) {
  if (currentDeps) currentDeps.push(dep);
}

async function withDependencyCollectionAsync<T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; deps: NotifierReactiveSource[] }> {
  const deps: NotifierReactiveSource[] = [];
  currentDeps = deps;
  try {
    const result = await fn();
    return { result, deps };
  } finally {
    currentDeps = null;
  }
}

/* ---------------- AsyncLocalStorage ---------------- */
const sessionALS = new AsyncLocalStorage<{ sessionId: string }>();

function getCurrentSessionId(): string {
  const store = sessionALS.getStore();
  if (!store) throw new Error("sessionStore used outside of session context");
  return store.sessionId;
}

/* ---------------- Stateful Stores ---------------- */
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
    notifyChanges: () => subj.next(subj.getValue()), // only manual trigger if needed
  };
}

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
      const { subj, notifier } = current(sessionId);
      // collectDependency(notifier);
      return subj.getValue();
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

export function sessionStore<T>(init: T): StoreReactiveSource<T> {
  const internal = _sessionStore(init);

  return {
    scope: "session",
    kind: "stateful",
    get: () => internal.get(getCurrentSessionId()),
    set: (val: T) => internal.set(getCurrentSessionId(), val),
    mutate: (fn: (prev: T) => T) => internal.mutate(getCurrentSessionId(), fn),
    subscribe: (fn: Subscriber<T>) => internal.subscribe(getCurrentSessionId(), fn),
    notifyChanges: () => internal.notifyChanges(getCurrentSessionId()), // manual only
  };
}

export interface DerivedStoreOptions<T> {
  deps?: ReactiveSource[];
  fn: () => T | Promise<T>;
  cache?: number; // 0 = no cache, number = ms, Infinity = always use cache
  debounce?: number | undefined; // optional debounce in ms
}

/**
 * Derived store / query.
 * - If cache=0, result is not stored; emits only when deps change.
 * - If cache>0 or Infinity, last value is stored for new subscribers.
 * - Supports optional debounce.
 */
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

  // Core runner
  const run = async () => {
    if (debounce) {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => execute(), debounce);
    } else {
      await execute();
    }
  };

  const execute = async () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;

    try {
      const result = await fn();
      if (hasCache) {
        lastValue = result;

        // handle cache expiration if cache is finite
        if (cache !== Infinity) {
          setTimeout(() => {
            lastValue = undefined;
          }, cache);
        }
      }

      subj.next(result);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        run();
      }
    }
  };

  // Subscribe to deps
  const depSubs: { unsubscribe(): void }[] = deps.map(dep =>
    dep.subscribe(() => {
      run();
    })
  );

  return {
    scope: deps.some(d => d.scope === "session") ? "session" : "global",
    kind: "stateful",
    get: () => {
      if (!hasCache) throw new Error("Cannot get value from a non-cached derived store");
      if (lastValue === undefined) throw new Error("Value not yet initialized");
      return lastValue;
    },
    set: () => {
      throw new Error("Cannot set derived store directly");
    },
    mutate: () => {
      throw new Error("Cannot mutate derived store directly");
    },
    subscribe(fn: Subscriber<T>) {
      activeSubs++;

      if (hasCache && lastValue !== undefined) {
        fn(lastValue);
      } else {
        run();
      }

      const sub = subj.subscribe((val) => {
        if (val !== undefined) fn(val);
      });

      return {
        unsubscribe() {
          sub.unsubscribe();
          activeSubs--;
          if (activeSubs === 0) depSubs.forEach(s => s.unsubscribe());
        },
      };
    },
    notifyChanges() {
      run();
    },
  };
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
  return {
    scope: sources.some((s) => s.scope === "session") ? "session" : "global",
    kind: "stateless",
    subscribe: (fn: Subscriber<void>) => {
      const subs = sources.map((src) =>
        src.subscribe(() => subj.next())
      );
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

/* ---------------- Endpoint Helpers ---------------- */
export interface QueryOptions<TSchema, TResult> {
  schema?: TSchema;
  fn: (args: TSchema extends { parse: any } ? z.infer<TSchema> : undefined) => Promise<TResult> | TResult;
  deps?: ReactiveSource[];
  cache?: number;      // 0 = no cache, number = ms, Infinity = always
  debounce?: number;   // optional debounce in ms
}

/**
 * Query factory with reactive inputs
 */
export function query<TSchema = undefined, TResult = any>(
  opts: QueryOptions<TSchema, TResult>
) {
  return (input?: ReactiveSource | ReactiveSource[] | undefined) => {
    const inputDeps: ReactiveSource[] = [];

    // normalize inputs to array
    if (input) {
      if (Array.isArray(input)) inputDeps.push(...input);
      else inputDeps.push(input);
    }

    // merge with optional static deps
    const allDeps = [...(opts.deps ?? []), ...inputDeps];

    return derivedStore<TResult>({
      deps: allDeps,
      fn: () => opts.fn(input ? (Array.isArray(input) ? input.map(i => ('get' in i ? i.get() : i)) : ('get' in input ? input.get() : input)) : undefined),
      cache: opts.cache ?? 0,
      debounce: opts.debounce,
    });
  };
}


interface MutationOptions<TSchema extends z.ZodTypeAny | undefined, TResult> {
  schema?: TSchema;
  fn: (
    args: TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined
  ) => Promise<TResult> | TResult;
}

export function mutation<
  TSchema extends z.ZodTypeAny | undefined,
  TResult = void
>(opts: MutationOptions<TSchema, TResult>) {
  return async (
    args: TSchema extends z.ZodTypeAny ? z.infer<TSchema> : undefined
  ): Promise<TResult> => {
    const parsed = opts.schema ? opts.schema.parse(args) : (undefined as any);
    return opts.fn(parsed);
  };
}

/* ---------------- WebSocket Server ---------------- */
export function createReactiveWSServer<Endpoints extends Record<string, any>>(
  factory: () => Endpoints,
  port: number
) {
  const actions = factory();
  const wss = new WebSocketServer({ port });
  const clientSubs = new Map<WebSocket, ClientSubscription[]>();
  const sessionMap = new Map<WebSocket, string>();

  // Run a function inside a session context
  function runWithSession<T>(sessionId: string, fn: () => T): T {
    return sessionALS.run({ sessionId }, fn);
  }

  wss.on("connection", (ws) => {
    const sessionId = crypto.randomUUID();
    sessionMap.set(ws, sessionId);
    clientSubs.set(ws, []);

    ws.on("message", async (raw) => {
      const msg = JSON.parse(raw.toString());
      const fn = actions[msg.name];
      if (!fn) return ws.send(JSON.stringify({ type: "error", message: "Unknown action: " + msg.name }));

      await runWithSession(sessionId, async () => {
        const subs = clientSubs.get(ws)!;

        if (msg.type === "subscribe") {
          const result = fn(msg.params);
          if ("subscribe" in result) {
            const sub = (result as LiveQueryResult<any>).subscribe((data: any) => {
              if (ws.readyState === WebSocket.OPEN)
                ws.send(JSON.stringify({ type: "update", name: msg.name, data }));
            });
            subs.push({ name: msg.name, sub });
          } else {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: "update", name: msg.name, data: result }));
          }
        }

        else if (msg.type === "unsubscribe") {
          for (const s of subs.filter(s => s.name === msg.name)) s.sub.unsubscribe();
          clientSubs.set(ws, subs.filter(s => s.name !== msg.name));
        }

        else if (msg.type === "mutation") {
          const result = await fn(msg.params);
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({
              type: "mutationResult",
              name: msg.name,
              data: result,
              requestId: msg.requestId,
            }));
        }
      });
    });

    ws.on("close", () => {
      const subs = clientSubs.get(ws);
      if (subs) for (const s of subs) s.sub.unsubscribe();
      clientSubs.delete(ws);
      sessionMap.delete(ws);
    });
  });

  console.log(`✅ Reactive WS server running on port ${port}`);
  return { wss, actions };
}
