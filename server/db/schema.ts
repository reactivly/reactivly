// db/schema.ts
import { computed, effect, signal, trigger } from "alien-signals";
import { getTableName } from "drizzle-orm";
import { TableConfig } from "drizzle-orm/gel-core";
import { AnyPgTable } from "drizzle-orm/pg-core";
import { PgTableWithColumns } from "drizzle-orm/pg-core";
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

function pgTableToSignal<T extends AnyPgTable>(table: T) {
  const compute = computed(() => table)

  client.connect().then(() => {
    console.log('Listening to table changes for', getTableName(table));
    client.query(`LISTEN ${getTableName(table)}_channel`);
    client.on('notification', (msg) => {
      console.log('Notification received:', msg.channel, msg.payload);
      trigger(compute);
    });
  });

  // effect(() => {
  //   const current = compute();
  //   console.log(`Table ${getTableName(table)} signal triggered:`, current);
  // });

  return compute;
}

export const $items = pgTableToSignal(items);