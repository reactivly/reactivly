import type z from "zod";
import type { ReactiveSource } from "./reactivity.js";

// ==========================
// Single set of types (final endpoint types)
// ==========================
export type EndpointWithInput<
  Sources extends readonly ReactiveSource[],
  Input extends z.ZodTypeAny,
  Result
> = {
  sources: Sources;
  input: Input;
  fetch: (params: z.infer<Input>) => Promise<Result> | Result;
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
  fetch: (params: z.infer<Input>) => Promise<Result> | Result;
};

type EndpointInputWithoutInput<
  Sources extends readonly ReactiveSource[],
  Result
> = {
  sources: Sources;
  fetch: () => Promise<Result> | Result;
};

// ==========================
// Simple overloads
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

export function defineEndpoint(endpoint: any) {
  return { ...endpoint, type: "query" as const };
}