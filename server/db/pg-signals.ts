import { computed, trigger } from "alien-signals";
import { getTableName } from "drizzle-orm";
import { AnyPgTable } from "drizzle-orm/pg-core";
import { Client } from "pg";

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

export function pgTableToSignal<T extends AnyPgTable>(table: T) {
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
