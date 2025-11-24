import { initTRPC } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { effect, signal } from "alien-signals";
import z from "zod";
import { $items } from "./db/schema";
import { db } from "./db/client";
import { asc, eq, sql } from "drizzle-orm";
import { fileToSignal } from "./fs";
import { live } from "./lib/live";

type AnyContextOpts = CreateHTTPContextOptions | CreateWSSContextFnOptions;

// This is how you initialize a context for the server
export function createContext(opts: AnyContextOpts) {
  return {
    postsMinLength: signal(0),
    userName: signal<string | undefined>(undefined),
  };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const globalStore = signal(10);
const fileSignal = fileToSignal("data.txt");

effect(() => {
  console.log("fileSignal changed:", fileSignal());
});

const greetingRouter = t.router({
  get: t.procedure.subscription(({ ctx }) => live(() => ctx.userName())),
  logout: t.procedure.mutation(({ ctx }) => {
    ctx.userName(undefined);
    return {
      success: true,
    };
  }),
  login: t.procedure
    .input(
      z.object({
        name: z.string().min(2).max(20),
      })
    )
    .mutation(({ input, ctx }) => {
      ctx.userName(input.name);
      return {
        success: true,
      };
    }),
  file: t.procedure.subscription(() => live(() => fileSignal()())),
});

const postRouter = t.router({
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
    live(() => {
      const items = $items();
      return db
        .select()
        .from(items)
        .where(sql`length(${items.name}) >= ${ctx.postsMinLength()}`)
        .orderBy(asc(items.id));
    })
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
  globalStore: t.procedure.subscription(({ ctx }) => live(() => globalStore())),
});

// Merge routers together
export const router = t.router({
  greeting: greetingRouter,
  post: postRouter,
});
