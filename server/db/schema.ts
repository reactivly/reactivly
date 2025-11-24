// db/schema.ts
import { computed, trigger } from "alien-signals";
import { getTableName } from "drizzle-orm";
import { AnyPgTable } from "drizzle-orm/pg-core";
import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { Client } from "pg";

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

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
let isClientConnected = false;

function addListener<T>(channel: string, compute: () => T) {
  console.log("Listening to table changes for", channel);
  client.query(`LISTEN ${channel}`);
  client.on("notification", (msg) => {
    if (msg.channel !== channel) return;
    console.log("Notification received:", msg.channel, msg.payload);
    trigger(compute);
  });
}

function pgTableToSignal<T extends AnyPgTable>(table: T) {
  const compute = computed(() => table);
  const channel = `${getTableName(table)}_channel`;

  if (!isClientConnected) {
    isClientConnected = true;
    client.connect().then(() => {
      addListener(channel, compute);
    });
  } else {
    addListener(channel, compute);
  }

  return compute;
}

export const $items = pgTableToSignal(items);
export const $orders = pgTableToSignal(orders);
