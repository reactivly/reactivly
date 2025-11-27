// db/schema.ts
import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { pgTableToObservable } from "./pg-signals";

// Wrap them as reactive
const items = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name"),
});
const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id"),
  quantity: integer("quantity"),
});

export const $$items = pgTableToObservable(items); 
