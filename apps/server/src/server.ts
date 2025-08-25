// server.ts
import { db } from "./db/client.js";
import { asc, eq } from "drizzle-orm";
import {
  defineEndpoint,
  defineEndpoints,
  type AnyEndpoint,
} from "@packages/server";
import { pgReactiveSource } from "@packages/server-pg";
import { items, orders } from "./db/schema.js";
import z from "zod";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Endpoints (what clients subscribe to)
// - `itemsList`: depends on `items` only
// - `ordersByItem`: depends on `orders` only (example transform)
// - `dashboard`: depends on BOTH `items` and `orders`
const server = await defineEndpoints(
  {
    itemsList: defineEndpoint({
      sources: [pgReactiveSource(items)],
      fetch: () => db.select().from(items).orderBy(asc(items.id)),
    }),
    ordersByItem: defineEndpoint({
      sources: [pgReactiveSource(orders)],
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
  },
  { connectionString }
);

// Infer types
export type Endpoints = typeof server.endpoints;
