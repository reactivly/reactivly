import z from "zod";
import { $items } from "../db/schema";
import { db } from "../db/client";
import { asc, eq, sql } from "drizzle-orm";
import { debounceComputed, live } from "../lib/live";
import { t } from "./trpc";
import { signal } from "alien-signals";

const globalStore = signal(10);

export const postRouter = t.router({
  setPostMinLength: t.procedure
    .input(
      z.object({
        val: z.number().min(0).max(20),
      })
    )
    .mutation(({ input, ctx }) => {
      ctx.postsMinLength(input.val);
      return {
        success: true,
      };
    }),
  posts: t.procedure.subscription(({ ctx }) =>
    live(() =>
      debounceComputed(() => {
        const items = $items();
        return db
          .select()
          .from(items)
          .where(sql`length(${items.name}) >= ${ctx.postsMinLength()}`)
          .orderBy(asc(items.id));
      }, 200)()
    )
  ),
  create: t.procedure
    .input(
      z.object({
        val: z.string(),
      })
    )
    .mutation(({ input }) => {
      const items = $items();
      return db.insert(items).values({ name: input.val });
    }),
  delete: t.procedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(({ input }) => {
      const items = $items();
      return db.delete(items).where(eq(items.id, input.id));
    }),
  incrementStore: t.procedure
    .input(
      z.object({
        val: z.number(),
      })
    )
    .mutation(({ input }) => {
      globalStore(globalStore() + input.val);
      return {
        id: `${Math.random()}`,
        ...input,
      };
    }),
  globalStore: t.procedure.subscription(({ ctx }) => live(globalStore)),
});
