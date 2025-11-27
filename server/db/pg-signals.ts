import { getTableName } from "drizzle-orm";
import { AnyPgTable } from "drizzle-orm/pg-core";
import { Client } from "pg";
import { BehaviorSubject } from "rxjs";

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
    compute();
  });
}

export function pgTableToObservable<T extends AnyPgTable>(table: T): BehaviorSubject<T> {
  const channel = `${getTableName(table)}_channel`;
  const subject = new BehaviorSubject<T>(table); // Emit the initial value

  const connectAndListen = async () => {
    if (!isClientConnected) {
      isClientConnected = true;
      await client.connect();
    }

    addListener(channel, () => {
      subject.next(table); // Emit new values when changes occur
    });
  };

  connectAndListen().catch((err) => subject.error(err));

  return subject;
}
