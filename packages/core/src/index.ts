import { z } from "zod";

// export type QueryOrMutation = AnyQuery | AnyMutation;

/** ---------------- Core Types ---------------- */
export type Scope = "global" | "session";
export type Kind = "stateful" | "stateless";
export type Subscriber<T = any> = (value: T) => void;

export interface ReactiveSourceBase<T = any> {
  scope: Scope;
  kind: Kind;
  subscribe: (fn: Subscriber<T>) => { unsubscribe: () => void };
  // get?: () => T
  // set?: (val: T) => void
  // mutate?: (fn: (prev: T) => T) => void
}

export interface StoreReactiveSource<T> extends ReactiveSourceBase<T> {
  kind: Kind;
  get: () => T;
  set: (val: T) => void;
  mutate: (fn: (prev: T) => T) => void;
}

export interface NotifierReactiveSource extends ReactiveSourceBase<void> {
  kind: "stateless";
  notifyChanges: () => void;
}

export interface LiveQueryResult<TResult> {
  subscribe(fn: Subscriber<TResult>): { unsubscribe: () => void };
}

export type ReactiveSource<T = any> = StoreReactiveSource<T> | NotifierReactiveSource;

/** ---------------- Endpoint / Mutation Helpers ---------------- */
export type QueryFn<TSchema extends z.ZodTypeAny, TResult> = (
  args: z.infer<TSchema>
) => Promise<TResult> | TResult;

export type MutationFn<TSchema extends z.ZodTypeAny, TResult = void> = (
  args: z.infer<TSchema>
) => Promise<TResult> | TResult;


/** ---------------- WebSocket Server ---------------- */
export interface ClientSubscription {
  sub: { unsubscribe: () => void };
  name: string;
}
