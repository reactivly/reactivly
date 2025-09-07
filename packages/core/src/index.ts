
/* ---------------- Core Types ---------------- */
export type Scope = "global" | "session";
export type Kind = "stateful" | "stateless";
export type Subscriber<T = any> = (value: T) => void;

export interface ReactiveSourceBase<T = any> {
  scope: Scope;
  kind: Kind;
  subscribe: (
    fn: Subscriber<T>,
    _sessionId?: string
  ) => { unsubscribe: () => void };
}

export interface StoreReactiveSource<T> extends ReactiveSourceBase<T> {
  kind: "stateful";
  get: () => T;
  set: (val: T) => void;
  mutate: (fn: (prev: T) => T) => void;
}

export interface NotifierReactiveSource extends ReactiveSourceBase<void> {
  kind: "stateless";
  notifyChanges: () => void;
}

export interface LiveQueryResult<TResult> {
  subscribe: (
    fn: Subscriber<TResult>,
    _sessionId?: string
  ) => { unsubscribe: () => void };
}

export type ReactiveSource<T = any> =
  | StoreReactiveSource<T>
  | NotifierReactiveSource;

export interface ClientSubscription {
  sub: { unsubscribe: () => void };
  name: string;
}
