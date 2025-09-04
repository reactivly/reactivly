# Building Real-Time Apps with `@reactivly`

Most modern applications should be **reactive by default**—when the data changes in the database, all connected clients should update instantly. Instead of wiring together multiple tools, the `@reactivly` packages provide a unified system for **type-safe queries, mutations, and live updates** out of the box.

![instant updates](reactivly.gif "Reactivly")


# Reactivly Concepts

## 1. Queries

A **query** is a function the client can subscribe to.
It declares its input (with Zod), runs code, and returns a result.

```ts
import { query } from "@reactivly/server";
import z from "zod";

const itemsList = query(z.void(), async () => {
  return [
    { id: 1, name: "First" },
    { id: 2, name: "Second" },
  ];
});
```

* **Input** is validated with `zod`.
* **Result** is pushed live to clients whenever the query re-runs.

---

## 2. Mutations

A **mutation** is a one-off operation.
Unlike queries, it does **not** re-run or stream results.

```ts
import { mutation } from "@reactivly/server";
import z from "zod";

const addItem = mutation(
  z.object({ name: z.string() }),
  async ({ name }) => {
    console.log("Inserting:", name);
    // Example DB insert…
    return { success: true };
  }
);
```

---

## 3. Stores

Stores hold state on the server that queries and mutations can access.

### Global Store

Shared between all connections.

```ts
import { globalStore } from "@reactivly/server";

const counter = globalStore(0);

const incrementCounter = mutation(
  z.object({ step: z.number().optional() }),
  ({ step = 1 }) => counter.mutate(n => n + step)
);

const currentCount = query(z.void(), () => counter.get());
```

### Session Store

Isolated per WebSocket connection.

```ts
import { sessionStore, query, mutation } from "@reactivly/server";

interface User { username: string }

const sessionUser = sessionStore<User | null>(null);

const login = mutation(
  z.object({ username: z.string() }),
  ({ username }) => sessionUser.set({ username })
);

const me = query(z.void(), () => sessionUser.get());
```

---

## 4. Notifiers

Notifiers tie queries to **external data sources**.
When the source changes, queries that depend on it re-run.

### Postgres + Drizzle

```ts
import { createPgNotifier } from "@reactivly/server-pg-drizzle";
import { db } from "./db/client";
import { items } from "./db/schema";
import { asc } from "drizzle-orm";

const pgNotifier = createPgNotifier({ connectionString: process.env.DATABASE_URL! });

const itemsList = query(z.void(), async () => {
  const items$ = pgNotifier.proxy(items);
  return db.select().from(items$).orderBy(asc(items.id));
});
```

### Filesystem

```ts
import { createFsNotifier } from "@reactivly/server-fs";
import fs from "fs/promises";

const fsNotifier = createFsNotifier();

const fileContent = query(z.void(), async () => {
  try {
    return await fs.readFile(fsNotifier.proxy("./data.txt"), "utf-8");
  } catch {
    return null;
  }
});
```

---

## 5. Derived Notifiers

You can combine multiple notifiers into one.

```ts
import { derivedNotifier } from "@reactivly/server";

const combined = derivedNotifier([pgNotifier.proxy(items), sessionUser]);

const dashboard = query(z.void(), async () => {
  combined; // registers dependency
  return { stats: "…" };
});
```

---

## 6. Server Setup

Finally, wire your endpoints into a WebSocket server:

```ts
import { createReactiveWSServer, query, mutation } from "@reactivly/server";

const { actions: endpoints } = createReactiveWSServer(() => ({
  itemsList,
  addItem,
  currentCount,
  me,
}), 3001);

export type Endpoints = typeof endpoints;
```


## 7. Client Usage


Reactivly has multiple client SDKs depending on your frontend stack.

* **Vanilla Client** – plain JS/TS, framework-agnostic.
* **Vue Client** – tight integration with Vue 3 reactivity (`ref`, `computed`, Suspense).
* *(React / Svelte clients could follow the same pattern later).*

---

## 7.1 Vanilla Client

```ts
import { createClient } from "@reactivly/client";
import type { Endpoints } from "@apps/server";

const client = createClient<Endpoints>({ url: "ws://localhost:3001" });

// Live query subscription
client.subscribe("itemsList", {}, (items) => {
  console.log("Items updated:", items);
});

// Run a mutation
await client.mutate("addItem", { name: "Another item" });
```

---

## 7.2 Vue Client

Install:

```bash
npm install @reactivly/client-vue
```

Setup:

```ts
// composables/endpointClient.ts
import { createEndpoints } from "@reactivly/client-vue";
import type { Endpoints } from "@apps/server";

export const endpointClient = createEndpoints<Endpoints>({
  url: "ws://localhost:3001",
});
```

---

### Queries

```vue
<script setup lang="ts">
import { endpointClient } from "../composables/endpointClient";

const { data, isLoading } = endpointClient.query("fileWatcher");
</script>

<template>
  <div v-if="isLoading">Loading…</div>
  <div v-else>{{ data }}</div>
</template>
```

---

### Mutations + Session Handling

```vue
<script setup lang="ts">
import { endpointClient } from "../composables/endpointClient";

const me = endpointClient.query("sessionUser");
const login = endpointClient.mutation("login");
const logout = endpointClient.mutation("logout");

const doLogin = () => login.mutateAsync({ username: "test", password: "123" });
</script>

<template>
  <div v-if="me.data.value">
    <p>Logged in as: {{ me.data.value }}</p>
    <button @click="logout.mutateAsync(undefined)">Logout</button>
  </div>
  <div v-else>
    <button @click="doLogin">Login</button>
  </div>
</template>
```

---

### CRUD Example

```vue
<script setup lang="ts">
import { ref } from "vue";
import { endpointClient } from "../composables/endpointClient";

const input = ref("");

const { data, isLoading } = endpointClient.query("itemsList");
const addItem = endpointClient.mutation("addItem");
const deleteItem = endpointClient.mutation("deleteItem");
</script>

<template>
  <div v-if="isLoading">Loading…</div>
  <ul v-else>
    <li v-for="item in data" :key="item.id">
      {{ item.name }}
      <button @click="deleteItem.mutate({ id: item.id })">X</button>
    </li>
  </ul>

  <form @submit.prevent>
    <input
      v-model="input"
      :style="addItem.isPending.value ? 'background-color: red' : ''"
    />
    <button @click="addItem.mutateAsync({ name: input }); input = ''">
      Add item
    </button>
  </form>
</template>
```

Perfect 👍 we can extend the README with a **React client section** alongside the Vue one. Here’s how it would look with your inspiration code formatted into examples:

---

## 7.3 React Client

Install:

```bash
npm install @reactivly/client-react
```

Setup your client instance:

```ts
// hooks/endpointClient.ts
import { createEndpoints } from "@reactivly/client-react";
import type { Endpoints } from "@apps/server";

export const endpointClient = createEndpoints<Endpoints>({
  url: "ws://localhost:3001",
});
```

---

### Authentication Example

```tsx
import { endpointClient } from "./hooks/endpointClient";

export function Login() {
  const me = endpointClient.query("sessionUser");
  const login = endpointClient.mutation("login");
  const logout = endpointClient.mutation("logout");

  return (
    <div>
      {me.data ? (
        <>
          <pre>{JSON.stringify(me.data, null, 2)}</pre>
          <button onClick={() => logout.mutateAsync()}>Logout</button>
        </>
      ) : (
        <button
          onClick={() =>
            login.mutateAsync({ username: "test", password: "123" })
          }
        >
          Login
        </button>
      )}
    </div>
  );
}
```

---

### Queries + Mutations

```tsx
import { endpointClient } from "./hooks/endpointClient";

export function App() {
  const { data, isLoading } = endpointClient.query("itemsList");
  const deleteItem = endpointClient.mutation("deleteItem");

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {data?.map((item) => (
        <li key={item.id}>
          {item.name}{" "}
          <button onClick={() => deleteItem.mutate({ id: item.id })}>X</button>
        </li>
      ))}
    </ul>
  );
}
```

---

### Add Item Form

```tsx
import { useRef } from "react";
import { endpointClient } from "./hooks/endpointClient";

export function AddItem() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addItem = endpointClient.mutation("addItem");

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input
        ref={inputRef}
        disabled={addItem.isPending}
        style={{ backgroundColor: addItem.isPending ? "red" : "unset" }}
      />
      <button
        onClick={async () => {
          if (!inputRef.current?.value) return;
          await addItem.mutateAsync({ name: inputRef.current.value });
          inputRef.current.value = "";
        }}
      >
        Add Item
      </button>
    </form>
  );
}
```

---

### Parameterized Query

```tsx
import { endpointClient } from "./hooks/endpointClient";

export function OrdersByItem() {
  const { data } = endpointClient.query("ordersByItem", { filter: "all" });

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

---

### File Watcher Example

```tsx
import { endpointClient } from "./hooks/endpointClient";

export function FileWatcher() {
  const { data } = endpointClient.query("fileWatcher");

  return <pre>{data}</pre>;
}
```


## Why This Matters

* **Reactive by design**: Queries tied to sources always stay fresh.
* **Type-safe end-to-end**: Zod inputs + drizzle schemas ensure correctness.
* **No invalidation headaches**: The database itself drives reactivity.

Instead of juggling WebSocket subscriptions manually, you declare your sources once and the system handles the rest.

---

✅ With this setup, you get a **real-time, type-safe data layer** with minimal boilerplate. Perfect for dashboards, collaborative tools, or anything that needs instant updates.


## Remarks

What this should not be used for:
- instant messages: all the db query is ran again everytime, for instant messages, send them right away to the other clients, or find a way to request olnly the new message (or send it in the listen/notify)


## todo

server:
- debounce
