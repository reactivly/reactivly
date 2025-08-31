import type z from "zod";

// ==========================
// Final mutation types (with type property)
// ==========================
export type MutationWithInput<Input extends z.ZodTypeAny, Result> = {
  input: Input;
  mutate: (params: z.infer<Input>) => Promise<Result> | Result;
  type: "mutation";
};

export type MutationWithoutInput<Result> = {
  mutate: () => Promise<Result> | Result;
  input?: undefined;
  type: "mutation";
};

export type AnyMutation =
  | MutationWithInput<any, any>
  | MutationWithoutInput<any>;

// ==========================
// Input types for defineMutation (without 'type')
// ==========================
type MutationInput<Input extends z.ZodTypeAny, Result> = {
  input: Input;
  mutate: (params: z.infer<Input>) => Promise<Result> | Result;
};

type MutationInputWithoutInput<Result> = {
  mutate: () => Promise<Result> | Result;
  input?: undefined;
};

// ==========================
// Overloads with proper return types
// ==========================
export function defineMutation<
  Input extends z.ZodTypeAny,
  Result
>(mutation: MutationInput<Input, Result>): MutationWithInput<Input, Result>;

export function defineMutation<Result>(
  mutation: MutationInputWithoutInput<Result>
): MutationWithoutInput<Result>;

export function defineMutation(mutation: any) {
  return { ...mutation, type: "mutation" as const };
}