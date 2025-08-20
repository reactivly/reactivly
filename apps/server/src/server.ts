// server.ts
import { db } from "./db/client.js";
import { asc, eq } from "drizzle-orm";
import defineEndpoints from "./defineEndpoints.js";
import { items, orders } from "./db/schema.js";
import z from "zod";

// Endpoints (what clients subscribe to)
// - `itemsList`: depends on `items` only
// - `ordersByItem`: depends on `orders` only (example transform)
// - `dashboard`: depends on BOTH `items` and `orders`
const server = await defineEndpoints({
  itemsList: {
    sources: [items],
    fetch: () => db.select().from(items).orderBy(asc(items.id)),
  },
  ordersByItem: {
    sources: [orders],
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
  },
  // dashboard: {
  //   sources: [items, orders],
  //   fetch: async () => {
  //     const [allItems, allOrders] = await Promise.all([
  //       db.select().from(items).orderBy(asc(items.id)),
  //       db.select().from(orders).orderBy(asc(orders.id)),
  //     ]);
  //     return {
  //       countItems: allItems.length,
  //       countOrders: allOrders.length,
  //       lastItem: allItems.at(-1) ?? null,
  //       lastOrder: allOrders.at(-1) ?? null,
  //     };
  //   },
  // },
});


// Infer types
export type Endpoints = typeof server.endpoints;

export type EndpointParams<K extends keyof Endpoints> =
  Endpoints[K] extends { input: z.ZodType } ? z.infer<Endpoints[K]["input"]> : undefined;