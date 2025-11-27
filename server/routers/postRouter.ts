import z from "zod";
import { $$items } from "../db/schema";
import { db } from "../db/client";
import { asc, eq, sql } from "drizzle-orm";
import { t } from "./trpc";
import {
  tap,
  switchMap,
  debounceTime,
  distinctUntilChanged,
} from "rxjs/operators";
import { BehaviorSubject, combineLatest } from "rxjs";

const globalStore = new BehaviorSubject(10);

export const postRouter = t.router({
  setPostMinLength: t.procedure
    .input(
      z.object({
        val: z.number().min(0).max(20),
      })
    )
    .mutation(({ input, ctx }) => {
      console.log("Setting postsMinLength to:", input.val);
      ctx.postsMinLength.next(input.val);
      return {
        success: true,
      };
    }),
  posts: t.procedure.subscription(({ ctx }) =>
    combineLatest([ctx.postsMinLength, $$items]).pipe(
      // startWith([0, $$items.getValue()] as const),
      debounceTime(200), // Add a 300ms debounce to reduce rapid emissions
      switchMap(([minLength, items]) => {
        console.log("postsMinLength emitted:", minLength); // Log emitted value of postsMinLength
        console.log("Computing posts with minLength:", minLength);
        return db
          .select()
          .from(items)
          .where(sql`LENGTH(${items.name}) >= ${minLength}`) // Corrected SQL syntax
          .orderBy(asc(items.id));
      }),
      distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr)), // Suppress emissions if the result is the same
      tap((res) => {
        console.log("posts subscription computation completed", res);
      })
    )
  ),
  create: t.procedure
    .input(
      z.object({
        val: z.string(),
      })
    )
    .mutation(({ input }) => {
      const items = $$items.getValue();
      return db.insert(items).values({ name: input.val });
    }),
  delete: t.procedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(({ input }) => {
      const items = $$items.getValue();
      return db.delete(items).where(eq(items.id, input.id));
    }),
  incrementStore: t.procedure
    .input(
      z.object({
        val: z.number(),
      })
    )
    .mutation(({ input }) => {
      globalStore.next(globalStore.getValue() + input.val);
      return {
        id: `${Math.random()}`,
        ...input,
      };
    }),
  globalStore: t.procedure.subscription(({ ctx }) => globalStore),
});
