import WebSocket, { WebSocketServer } from "ws";
import { Subject } from "rxjs";
import { z } from "zod";
import type {
  ClientSubscription,
  LiveQueryResult,
  MutationFn,
  NotifierReactiveSource,
  ReactiveSource,
  StoreReactiveSource,
  Subscriber,
  QueryFn
} from "@reactivly/core";

export type { LiveQueryResult, NotifierReactiveSource };

// ---------------- Dependency Tracking ----------------
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

// ---------------- Session Handling ----------------
const activeSessionStack: string[] = [];
function getActiveSessionId(): string {
  const sessionId = activeSessionStack[activeSessionStack.length - 1];
  if (!sessionId) throw new Error("No active session");
  return sessionId;
}

// ---------------- Stateful Sources ----------------
export function globalStore<T>(init: T): StoreReactiveSource<T> {
  const subj = new Subject<T>();
  const notifierSubj = new Subject<void>();
  const notifier: NotifierReactiveSource = {
    scope: "global",
    kind: "stateless",
    subscribe: (fn) => {
      fn();
      const sub = notifierSubj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    },
    notifyChanges: () => notifierSubj.next()
  };
  let value = init;
  return {
    scope: "global" as const,
    kind: "stateful" as const,
    get: () => {
      collectDependency(notifier);
      return value;
    },
    set: (val: T) => {
      value = val;
      subj.next(value);
      notifier.notifyChanges();
    },
    mutate: (fn: (prev: T) => T) => {
      value = fn(value);
      subj.next(value);
      notifier.notifyChanges();
    },
    subscribe: (fn: Subscriber<T>) => {
      fn(value);
      const sub = subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    }
  } satisfies StoreReactiveSource<T>;
}

export function sessionStore<T>(init: T): StoreReactiveSource<T> {
  const sessions = new Map<
    string,
    { value: T; subj: Subject<T>; notifier: NotifierReactiveSource }
  >();

  function current() {
    const sessionId = getActiveSessionId();
    if (!sessions.has(sessionId)) {
      const subj = new Subject<T>();
      const notifierSubj = new Subject<void>();
      const notifier: NotifierReactiveSource = {
        scope: "session",
        kind: "stateless",
        subscribe: (fn) => {
          fn();
          const sub = notifierSubj.subscribe(fn);
          return { unsubscribe: () => sub.unsubscribe() };
        },
        notifyChanges: () => notifierSubj.next()
      };
      sessions.set(sessionId, { value: init, subj, notifier });
    }
    return sessions.get(sessionId)!;
  }

  return {
    scope: "session" as const,
    kind: "stateful" as const,
    get: () => {
      const c = current();
      collectDependency(c.notifier);
      return c.value;
    },
    set: (val: T) => {
      const c = current();
      c.value = val;
      c.subj.next(val);
      c.notifier.notifyChanges();
    },
    mutate: (fn: (prev: T) => T) => {
      const c = current();
      c.value = fn(c.value);
      c.subj.next(c.value);
      c.notifier.notifyChanges();
    },
    subscribe: (fn: Subscriber<T>) => {
      const c = current();
      fn(c.value);
      const sub = c.subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    }
  } satisfies StoreReactiveSource<T>;
}

// ---------------- Stateless Sources ----------------
export function globalNotifier(): NotifierReactiveSource {
  const subj = new Subject<void>();
  return {
    scope: "global" as const,
    kind: "stateless" as const,
    subscribe: (fn: () => void) => {
      fn();
      const sub = subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    },
    notifyChanges: () => subj.next()
  };
}

export function derivedNotifier(sources: ReactiveSource[]): NotifierReactiveSource {
  const subj = new Subject<void>();
  const subs = sources.map((src) => src.subscribe(() => subj.next()));
  return {
    scope: sources.some((s) => s.scope === "session") ? "session" : "global",
    kind: "stateless",
    subscribe: (fn: () => void) => {
      fn();
      const sub = subj.subscribe(fn);
      return { unsubscribe: () => sub.unsubscribe() };
    },
    notifyChanges: () => subj.next()
  };
}

// ---------------- Endpoint / Mutation Helpers ----------------
export function query<TSchema extends z.ZodTypeAny, TResult>(
  schema: TSchema,
  fn: (args: z.infer<TSchema>) => Promise<TResult> | TResult
) {
  return (args: unknown): LiveQueryResult<TResult> => {
    return {
      subscribe: (notify: Subscriber<TResult>) => {
        let active = true;
        let subs: { unsubscribe: () => void }[] = [];

        async function run() {
          try {
            const parsed = schema.parse(args);

            // collect deps for this run
            const { result, deps } = await withDependencyCollectionAsync(() =>
              fn(parsed)
            );

            if (!active) return;
            notify(result);

            // unsubscribe old deps
            subs.forEach((s) => s.unsubscribe());
            subs = [];

            // subscribe to new deps
            subs = deps.map((dep) =>
              dep.subscribe(async () => {
                if (!active) return;
                const updated = await fn(parsed);
                notify(updated);
              })
            );
          } catch (err) {
            if (active) {
              notify(Promise.reject(err) as unknown as TResult);
            }
          }
        }

        // first run immediately
        run();

        return {
          unsubscribe: () => {
            active = false;
            subs.forEach((s) => s.unsubscribe());
          }
        };
      }
    };
  };
}

export function mutation<TSchema extends z.ZodTypeAny, TResult = void>(
  schema: TSchema,
  fn: (args: z.infer<TSchema>) => Promise<TResult> | TResult
) {
  return async (args: unknown): Promise<TResult> => {
    const parsed = schema.parse(args);
    return await fn(parsed);
  };
}

// ---------------- WebSocket Server ----------------
export function createReactiveWSServer<Endpoints extends Record<string, QueryOrMutation>>(
  factory: () => Endpoints,
  port: number
) {
  const actions = factory();
  const wss = new WebSocketServer({ port });
  const clientSubs = new Map<WebSocket, ClientSubscription[]>();

  wss.on("connection", (ws) => {
    clientSubs.set(ws, []);
    const sessionId = crypto.randomUUID(); // unique session per connection
    activeSessionStack.push(sessionId);

    ws.on("message", async (raw) => {
      const msg = JSON.parse(raw.toString());
      const fn = actions[msg.name];
      if (!fn) {
        ws.send(JSON.stringify({ type: "error", message: "Unknown action: " + msg.name }));
        return;
      }

      try {
        if (msg.type === "subscribe") {
          const result = fn(msg.params);

          if ("subscribe" in result) {
            const sub = result.subscribe((data) =>
              ws.send(JSON.stringify({ type: "update", name: msg.name, data }))
            );
            clientSubs.get(ws)!.push({ name: msg.name, sub });
          } else {
            ws.send(JSON.stringify({ type: "update", name: msg.name, data: result }));
          }
        }

        if (msg.type === "unsubscribe") {
          const subs = clientSubs.get(ws);
          if (subs) {
            for (const s of subs.filter((s) => s.name === msg.name)) s.sub.unsubscribe();
            clientSubs.set(ws, subs.filter((s) => s.name !== msg.name));
          }
        }

        if (msg.type === "mutation") {
          const result = await fn(msg.params);
          ws.send(JSON.stringify({ type: "mutationResult", name: msg.name, data: result }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", name: msg.name, error: String(err) }));
      }
    });

    ws.on("close", () => {
      const subs = clientSubs.get(ws);
      if (subs) for (const s of subs) s.sub.unsubscribe();
      clientSubs.delete(ws);
      activeSessionStack.pop();
    });
  });

  console.log("Reactive WS server running");
  return { wss, actions };
}
