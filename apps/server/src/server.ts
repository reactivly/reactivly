// server.ts
import { db } from "./db/client.js";
import { asc, eq, gt } from "drizzle-orm";
import { createPgNotifier } from "@reactivly/server-pg-drizzle";
import { createFsNotifier } from "@reactivly/server-fs";
import { items, orders } from "./db/schema.js";
import z from "zod";
import fs from "fs/promises";
import { createFastifyServer } from "@reactivly/server-fastify";
import {
  createReactiveWSServer,
  derivedNotifier,
  query,
  globalNotifier,
  globalStore,
  mutation,
  sessionStore,
} from "@reactivly/server";
// export {type LiveQueryResult} from "@reactivly/server"

console.log("CWD:", process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Endpoints (what clients subscribe to)
// - `itemsList`: depends on `items` only
// - `ordersByItem`: depends on `orders` only (example transform)
// - `dashboard`: depends on BOTH `items` and `orders`

interface User {
  username: string;
  password: string;
}

const { actions: endpoints } = createReactiveWSServer(() => {
  const counter = globalStore(0);
  const sessionUser = sessionStore<User | null>(null);
  const orders = globalNotifier(); // pgReactiveSource equivalent

  // const myPendingOrders = derivedNotifier([orders, sessionUser]);

  const pgNotifier = createPgNotifier({
    connectionString: process.env.DATABASE_URL!,
  });
  const fsNotifier = createFsNotifier();

  return {
    getMyOrders: query({
      schema: z.object({ userId: z.number() }),
      deps: [sessionUser],
      async fn({ userId }: { userId: number }) {
        const user = sessionUser.get();
        if (!user) return [];
        return db.select().from(items).where(eq(items.id, userId));
      },
    }),
    sessionUser: query({
      deps: [sessionUser],
      fn: () => sessionUser.get(),
    }),
    login: mutation({
      schema: z.object({ username: z.string(), password: z.string() }),
      fn: ({ username, password }: { username: string; password: string }) => {
        sessionUser.set({ username, password });
      },
    }),
    logout: mutation({
      fn: () => {
        sessionUser.set(null);
      },
    }),
    incrementCounter: mutation({
      schema: z.object({ step: z.number().optional() }),
      fn: ({ step = 1 }) => counter.mutate((n) => n + step),
    }),
    getCounter: query({
      deps: [counter],
      fn: () => counter.get(),
    }),
    // setSessionUser: mutation(
    //   z.object({ user: z.object({ id: z.number(), name: z.string() }) }),
    //   ({ user }) => sessionUser.set(user)
    // ),
    itemsList: query({
      deps: [pgNotifier.notifierFor(items)],
      schema: z.undefined(),
      async fn() {
        const res = await db.select().from(items).orderBy(asc(items.id));
        console.log("itemsList", res);
        return res;
      },
    }),

    fileWatcher: query({
      deps: [fsNotifier.notifierFor("./data.txt")],
      fn: () => {
        return fs.readFile("./data.txt", "utf-8");
      },
    }),

    addItem: mutation({
      schema: z.object({ name: z.string() }),
      fn: async ({ name }: { name: string }) => {
        console.log(name);
        await db.insert(items).values({ name });
        return { success: true };
      },
    }),
    deleteItem: mutation({
      schema: z.object({ id: z.number() }),
      fn: async ({ id }: { id: number }) => {
        await db.delete(items).where(eq(items.id, id));
        return { success: true };
      },
    }),
  };
}, 3001);

// createFastifyServer(endpoints, { port: 3000 });

// Infer types
export type Endpoints = typeof endpoints;
