# Reactivly Primitives Documentation

## Overview

Reactivly provides reactive primitives for building live APIs with session/client awareness.
Primitives are categorized into:

1. **Consumer API** – stores and queries used in application code.
2. **Adapter API** – low-level hooks for integrating external sources.

---

## Consumer API

### Global Store

Stateful store shared across all sessions.

```ts
const counter = globalStore(0);
counter.get();             // 0
counter.set(5);            // updates value
counter.mutate(n => n + 1);
counter.subscribe(val => console.log(val));
```

**Notes:**

* Stateful: holds current value.
* Scope: `global`.

---

### Session Store

Stateful store scoped per session.

```ts
const sessionUser = sessionStore<User | null>(null);
sessionUser.get();   // session-specific value
sessionUser.set(user);
sessionUser.mutate(u => ({ ...u, name: "Alice" }));
```

**Notes:**

* Stateful: holds value per session.
* Scope: `session`.

---

### Client Store

Stateful store scoped per client. Only updated by the client.

```ts
const themeStore = clientStore("light");
themeStore.get(); // readonly on server
themeStore.subscribe(val => console.log("Client theme:", val));
```

**Notes:**

* Scoped per client/session.
* Only server-side can read; clients send updates.
* Updates are validated like queries.

---

### Derived Store

Reactive value computed from other stores or notifiers.

```ts
const sumStore = derivedStore({
  deps: [aStore, bStore],
  fn: () => aStore.get() + bStore.get(),
  cache: Infinity,
  debounce: 50,
});
```

**Options:**

* `deps?: ReactiveSource[]` → dependencies
* `fn: () => T | Promise<T>` → computation function
* `cache?: number` → `0=no cache`, ms=cache duration, `Infinity=always cache`
* `debounce?: number` → optional debounce in ms

**Notes:**

* Always stateful (can cache last value for new subscribers).
* Does **not** take params; use queries for dynamic inputs.

---

### Query

Derived store with optional client parameters and validation.

```ts
const getOrders = query({
  schema: z.object({ userId: z.number() }),
  deps: [sessionUser],
  fn: ({ userId }) => db.getOrders(userId),
});
```

**Options:**

* `schema?: Zod schema` → validate input params
* `fn: (args) => TResult | Promise<TResult>` → computation function
* `deps?: ReactiveSource[]` → optional reactive dependencies
* `cache?: number` → `0=no cache`, ms=cache duration, `Infinity=always cache`
* `debounce?: number` → optional debounce in ms

**Notes:**

* Clients can subscribe multiple times with different params.
* Automatically validated if schema provided.

---

### Mutation

Function that performs server-side updates.

```ts
const increment = mutation({
  schema: z.object({ step: z.number() }),
  fn: ({ step }) => counter.mutate(n => n + step),
});
```

**Options:**

* `schema?: Zod schema`
* `fn: (args) => TResult | Promise<TResult>`

---

### Effect

Runs side-effects whenever dependencies change.

```ts
effect({
  deps: [sessionUser],
  immediate: true,
  fn: () => console.log("User changed:", sessionUser.get()),
});
```

**Options:**

* `deps?: ReactiveSource[]` → dependencies
* `fn: () => void | Promise<void>` → side effect
* `immediate?: boolean` → run immediately on creation

**Notes:**

* Non-stateful.
* Useful for fetching external data, scheduled jobs, or logging.

---

## Adapter API

### Global Notifier

Stateless event source.

```ts
const pgNotifier = globalNotifier();
pgNotifier.subscribe(() => console.log("Something changed"));
pgNotifier.notifyChanges(); // manual trigger
```

---

### Derived Notifier

Combines multiple reactive sources into a single notifier.

```ts
const combined = derivedNotifier([storeA, storeB]);
combined.subscribe(() => console.log("Either A or B changed"));
combined.notifyChanges();
```

---

### Store Notify

Low-level hook to manually notify subscribers of changes.

```ts
fs.watch("file.txt", () => fileStore.notifyChanges());
```

**Notes:**

* Should only be used in adapter code.
* Consumers usually **never call `.notify`**; it’s automatic.

---

### Queries & Subscriptions Notes

* Queries can have multiple subscriptions with different params.
* Client deduplication is automatic for identical query subscriptions.
* Derived stores with no params behave like cached queries.
