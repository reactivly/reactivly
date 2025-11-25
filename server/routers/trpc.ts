import { initTRPC } from "@trpc/server";
import { CreateHTTPContextOptions } from "@trpc/server/adapters/standalone";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { signal } from "alien-signals";
type AnyContextOpts = CreateHTTPContextOptions | CreateWSSContextFnOptions;

// This is how you initialize a context for the server
export function createContext(opts: AnyContextOpts) {
  return {
    postsMinLength: signal(0),
    userName: signal<string | undefined>(undefined),
  };
}

type Context = Awaited<ReturnType<typeof createContext>>;

export const t = initTRPC.context<Context>().create();
