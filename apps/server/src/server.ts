// server.ts
import { db } from "./db/client.js";
import { asc, eq } from "drizzle-orm";
import {
  defineEndpoint,
  defineMutation,
  defineEndpoints,
} from "@reactivly/server";
import { initPgReactive } from "@reactivly/server-pg";
import { fsReactiveSource } from "@reactivly/server-fs";
import { items, orders } from "./db/schema.js";
import z from "zod";
import fs from "fs/promises";
import { createFastifyServer } from "@reactivly/server-fastify";
import { sources } from "./db/sources.js";

console.log("CWD:", process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

await initPgReactive(connectionString);

// Endpoints (what clients subscribe to)
// - `itemsList`: depends on `items` only
// - `ordersByItem`: depends on `orders` only (example transform)
// - `dashboard`: depends on BOTH `items` and `orders`
const { endpoints } = await defineEndpoints({
  itemsList: defineEndpoint({
    sources: [sources.items],
    fetch: () => db.select().from(items).orderBy(asc(items.id)),
  }),
  ordersByItem: defineEndpoint({
    sources: [sources.orders],
    input: z.object({
      filter: z.string().optional(), // optional filter param
    }),
    fetch: async (params) => {
      const rows = await db.select().from(orders).orderBy(asc(orders.id));
      // reduce into a map { itemId -> totalQuantity }
      return rows.reduce<Record<number, number>>((acc, r) => {
        acc[r.itemId!] = (acc[r.itemId!] ?? 0) + (r.quantity ?? 0);
        return acc;
      }, {});
    },
  }),
  fileWatcher: defineEndpoint({
    sources: [fsReactiveSource("./data.txt")],
    fetch: async () => {
      try {
        return await fs.readFile("./data.txt", "utf-8");
      } catch (err) {
        return null;
      }
    },
  }),
  addItem: defineMutation({
    input: z.object({ name: z.string() }),
    mutate: async ({ name }) => {
      console.log(name);
      await db.insert(items).values({ name });
      return { success: true };
    },
  }),
  deleteItem: defineMutation({
    input: z.object({ id: z.number() }),
    mutate: async ({ id }) => {
      await db.delete(items).where(eq(items.id, id));
      return { success: true };
    },
  }),
});

createFastifyServer(endpoints, { port: 3000 });

// Infer types
export type Endpoints = typeof endpoints;
