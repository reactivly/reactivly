// server.ts
import { db } from "./db/client.js";
import { asc, eq } from "drizzle-orm";
import defineEndpoints, {
  defineEndpoint,
  type AnyEndpoint,
} from "./defineEndpoints.js";
import { items, orders } from "./db/schema.js";
import z from "zod";

// Endpoints (what clients subscribe to)
// - `itemsList`: depends on `items` only
// - `ordersByItem`: depends on `orders` only (example transform)
// - `dashboard`: depends on BOTH `items` and `orders`
const server = await defineEndpoints({
  itemsList: defineEndpoint({
    sources: [items],
    fetch: () => db.select().from(items).orderBy(asc(items.id)),
  }),
  ordersByItem: defineEndpoint({
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
  }),
});

// Infer types
// keys
export type Endpoints = typeof server.endpoints;

export type EndpointKeys = keyof Endpoints;

export type EndpointParams<K extends EndpointKeys> = Endpoints[K] extends {
  input: z.ZodTypeAny;
}
  ? z.infer<Endpoints[K]["input"]>
  : undefined;

export type EndpointResult<K extends EndpointKeys> = Endpoints[K] extends {
  fetch: (...args: any) => infer R;
}
  ? Awaited<R>
  : never;
