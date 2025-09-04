import type z from "zod";
import type { ReactiveSource } from "./reactivity.js";

// ==========================
// Context type
// ==========================
// export type EndpointContext = {
//   session?: any;
//   ws?: any;
//   [key: string]: any;
// };

// ==========================
// Final endpoint types
// ==========================
export type EndpointWithInput<
  Sources extends readonly ReactiveSource[],
  Input extends z.ZodTypeAny,
  Result
> = {
  sources: Sources;
  input: Input;
  fetch: (args: { params: z.infer<Input> }) => Promise<Result> | Result;
  type: "query";
};

export type EndpointWithoutInput<
  Sources extends readonly ReactiveSource[],
  Result
> = {
  sources: Sources;
  fetch: () => Promise<Result> | Result;
  type: "query";
};

export type AnyEndpoint =
  | EndpointWithInput<any, any, any>
  | EndpointWithoutInput<any, any>;

// ==========================
// Input types for defineEndpoint (without 'type')
// ==========================
type EndpointInput<
  Sources extends readonly ReactiveSource[],
  Input extends z.ZodTypeAny,
  Result
> = {
  sources: Sources;
  input: Input;
  fetch: (args: { params: z.infer<Input> }) => Promise<Result> | Result;
};

type EndpointInputWithoutInput<
  Sources extends readonly ReactiveSource[],
  Result
> = {
  sources: Sources;
  fetch: () => Promise<Result> | Result;
};

// ==========================
// Overloads
// ==========================
export function defineEndpoint<
  Sources extends readonly ReactiveSource[],
  Input extends z.ZodTypeAny,
  Result
>(endpoint: EndpointInput<Sources, Input, Result>): EndpointWithInput<Sources, Input, Result>;

export function defineEndpoint<
  Sources extends readonly ReactiveSource[],
  Result
>(endpoint: EndpointInputWithoutInput<Sources, Result>): EndpointWithoutInput<Sources, Result>;

// ==========================
// Implementation
// ==========================
export function defineEndpoint(endpoint: any) {
  return { ...endpoint, type: "query" as const };
}
