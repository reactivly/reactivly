import { pgDrizzleReactiveSource } from "@reactivly/server-pg-drizzle";
import { items, orders } from "./schema.js";

export const sources = {
  items: pgDrizzleReactiveSource(items),
  orders: pgDrizzleReactiveSource(orders),
};
