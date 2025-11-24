import { initTRPC } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { observable } from "@trpc/server/observable";
import { effect, signal } from "alien-signals";
import z from "zod";
import { $items } from "./db/schema";
import { db } from "./db/client";
import { asc, eq, lte, sql } from "drizzle-orm";
import { fileToSignal } from "./fs";

type AnyContextOpts = CreateHTTPContextOptions | CreateWSSContextFnOptions;

export function live<T>(compute: () => T) {
  return observable<T>((observer) => {
    const dispose = effect(async () => {
      console.log("Computing live value");
      return observer.next(await compute());
    });
    return () => {
      console.log("Disposing live subscription");
      dispose();
    };
  });
}

// This is how you initialize a context for the server
export function createContext(opts: AnyContextOpts) {
  return {
    postsMinLength: signal(0),
    userName: signal<string | undefined>(undefined),
  };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const router = t.router;

const globalStore = signal(10);
const fileSignal = fileToSignal("data.txt");

effect(() => {
  console.log("fileSignal changed:", fileSignal());
});

const greetingRouter = router({
  get: publicProcedure.subscription(({ ctx }) => live(() => ctx.userName())),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.userName(undefined);
    return {
      success: true,
    };
  }),
  login: publicProcedure
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
  file: publicProcedure.subscription(() => live(() => fileSignal()())),
});

const postRouter = router({
  setPostMinLength: publicProcedure
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
  posts: publicProcedure.subscription(({ ctx }) =>
    live(() => {
      const items = $items();
      return db
        .select()
        .from(items)
        .where(sql`length(${items.name}) >= ${ctx.postsMinLength()}`)
        .orderBy(asc(items.id));
    })
  ),
  create: publicProcedure
    .input(
      z.object({
        val: z.string(),
      })
    )
    .mutation(({ input }) => {
      const items = $items();
      return db.insert(items).values({ name: input.val });
    }),
  delete: publicProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(({ input }) => {
      const items = $items();
      return db.delete(items).where(eq(items.id, input.id));
    }),
  incrementStore: publicProcedure
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
  globalStore: publicProcedure.subscription(({ ctx }) =>
    live(() => globalStore())
  ),
});

// Merge routers together
export const appRouter = router({
  greeting: greetingRouter,
  post: postRouter,
});
