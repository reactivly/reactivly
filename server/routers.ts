import { initTRPC } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { observable } from "@trpc/server/observable";
import { effect, signal } from "alien-signals";
import z from "zod";
import { $items } from "./db/schema";
import { db } from "./db/client";
import { asc } from "drizzle-orm";

type AnyContextOpts = CreateHTTPContextOptions | CreateWSSContextFnOptions;

export function live<T>(compute: () => T) {
  return observable<T>((observer) => {
    const dispose = effect(async () => {
      console.log('Computing live value');
      return observer.next(await compute())
    });
    return () => {
      console.log('Disposing live subscription');
      dispose();
    };
  });
}

// This is how you initialize a context for the server
export function createContext(opts: AnyContextOpts ) {
  return {
    signalStore: signal(100),
    userName: signal<string | undefined>(undefined),
    numberStore: 777,
  };
}


type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const router = t.router;

const test = signal(10);

const greetingRouter = router({
  get: publicProcedure.subscription(({ ctx }) =>
    live(() => ctx.userName())
  ),
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.userName(undefined);
    return {
      success: true,
    };
  }),
  setName: publicProcedure
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
});

const postRouter = router({
  posts: publicProcedure.subscription(({ ctx }) =>
    live(() => {
      // const listener = $items().v()
      const items = $items();
      return db.select().from(items).orderBy(asc(items.id))
    })
  ),
  createPost: publicProcedure
    .input(
      z.object({
        val: z.number(),
      })
    )
    .mutation(({ input }) => {
      // imagine db call here
      test(test() + input.val);
      return {
        id: `${Math.random()}`,
        ...input,
      };
    }),
  updateSession: publicProcedure
    .input(
      z.object({
        val: z.number(),
      })
    )
    .mutation(({ input, ctx }) => {
      // imagine db call here
      ctx.signalStore(ctx.signalStore() + input.val);
      console.log(`Updated session to`, ctx.signalStore());
      return { id: `${Math.random()}`, ...input };
    }),
  randomNumber: publicProcedure.subscription(({ ctx }) =>
    live(() => {
      return {
        res: test(),
      };
    })
  ),
  session: publicProcedure.subscription(({ ctx }) =>
    live(() => {
      return {
        res: ctx.signalStore(),
      };
    })
  ),
});

// Merge routers together
export const appRouter = router({
  greeting: greetingRouter,
  post: postRouter,
});
