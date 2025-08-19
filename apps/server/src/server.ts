// server.ts
import { db } from "./db/client.js";
import { asc, eq } from "drizzle-orm";
import {defineEndpoints} from "./defineEndpoints.js";
import { items, orders } from "./db/schema.js";

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
    fetch: async () => {
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


// Export endpoint types for client
export type EndpointKeys = keyof typeof server.endpoints;
export type EndpointData<K extends EndpointKeys> = Awaited<
  ReturnType<typeof server.endpoints[K]["fetch"]>
>;
