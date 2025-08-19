// db/schema.ts
import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

// Wrap them as reactive
export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id"),
  quantity: integer("quantity"),
});