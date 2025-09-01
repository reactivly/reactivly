# Building Real-Time Apps with `@reactivly`

Most modern applications should be **reactive by default**—when the data changes in the database, all connected clients should update instantly. Instead of wiring together multiple tools, the `@reactivly` packages provide a unified system for **type-safe queries, mutations, and live updates** out of the box.

![instant updates](reactivly.gif "Reactivly")


## On the server

Install needed packages:
```cli
pnpm i @reactivly/server @reactivly/server-db-drizzle @reactivly/server-fs
```

### 1. Defining Reactive Sources

A **source** represents a stream of updates. With PostgreSQL, we use the `pgReactiveSource` utility, which listens to table changes and emits them.

```ts
// db/schema.ts
import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});
```

```ts
// server/sources.ts
import { initDrizzlePgReactive } from "@reactivly/server-db-drizzle";
import { users } from "../db/schema";
import { db } from "../db/client"; // drizzle instance

export const getSources = () => initDrizzlePgReactive(
  {
    users,
    orders,
  },
  { connectionString }
);
```

Now `userSource` emits updates whenever the `users` table changes (via `LISTEN/NOTIFY` under the hood).

---

### 2. Defining Endpoints

Endpoints describe how clients can fetch or mutate data. They can be **queries** (read) or **mutations** (write).

```ts
// server/endpoints.ts
import { defineEndpoint, defineMutation } from "@reactivly/server";
import { z } from "zod";
import { getSources } from "./sources";
import { db } from "../db/client";
import { users } from "../db/schema";

const sources = await getSources();

// Query: stream all users
export const listUsers = defineEndpoint({
  sources: [sources.users],
  fetch: async () => {
    return await db.select().from(users);
  },
});

// Mutation: insert a new user
export const addUser = defineMutation({
  input: z.object({ name: z.string() }),
  mutate: async ({ name }) => {
    await db.insert(users).values({ name });
  },
});
```

* `listUsers` depends on `userSource`, so whenever `users` change in the DB, all subscribed clients will update automatically.
* `addUser` inserts a new row, triggering the `userSource` to emit a new update → clients refresh instantly.

---

### 3. Starting the Server

The server can be bootstrapped with `createWsServer`, which exposes endpoints over **WebSockets**.

```ts
// server/index.ts
import { createWsServer } from "@reactivly/server";
import { listUsers, addUser } from "./endpoints";

const { endpoints } = await createWsServer({ 
  listUsers, 
  addUser 
}, { port: 4000 });

export type Endpoints = typeof endpoints;
```

That’s it — the backend is live with reactive endpoints.

---

## On the client

On the frontend, `@reactivly/client` integrates with **TanStack Query** and provides a familiar API.

First install the package:

```cli
pnpm i @reactivly/client-react
```

For vue, replace with `@reactivly/client-vue`

```ts
// frontend/useUsers.ts
import { useEndpoints } from "@reactivly/client-react";
import type { Endpoints } from "../../server/index" // import from your own server codebase (a monrepo is well-suited for this)

const client = createEndpoints<Endpoints>({
  url: "ws://localhost:4000",
});

export function useUsers() {
  return client.useQuery("listUsers"); // live reactive stream
}

export function useAddUser() {
  return client.useMutation("addUser");
}
```

And in a component:

```tsx
import { useUsers, useAddUser } from "./useUsers";

export function UserList() {
  const { data: users } = useUsers();
  const addUser = useAddUser();

  return (
    <div>
      <ul>
        {users?.map(u => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
      <button onClick={() => addUser.mutate({ name: "Alice" })}>
        Add User
      </button>
    </div>
  );
}
```

* The `useUsers` hook subscribes to `listUsers`.
* When `addUser` runs, the database changes → `userSource` emits → all clients’ queries update **without any manual invalidation**.

---

Why This Matters

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
- sessions, get from context
- debounce
- variableReactiveSource
