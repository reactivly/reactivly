import type z from "zod";

// ==========================
// Context type
// ==========================
export type MutationContext = {
  session?: any;
  ws?: any;
  [key: string]: any;
};

// ==========================
// Final mutation types
// ==========================
export type MutationWithInput<Input extends z.ZodTypeAny, Result> = {
  input: Input;
  mutate: (args: { ctx: MutationContext; params: z.infer<Input> }) => Promise<Result> | Result;
  type: "mutation";
};

export type MutationWithoutInput<Result> = {
  mutate: (args: { ctx: MutationContext }) => Promise<Result> | Result;
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
  mutate: (args: { ctx: MutationContext; params: z.infer<Input> }) => Promise<Result> | Result;
};

type MutationInputWithoutInput<Result> = {
  mutate: (args: { ctx: MutationContext }) => Promise<Result> | Result;
};

// ==========================
// Overloads with proper return types
// ==========================
export function defineMutation<Input extends z.ZodTypeAny, Result>(
  mutation: MutationInput<Input, Result>
): MutationWithInput<Input, Result>;

export function defineMutation<Result>(
  mutation: MutationInputWithoutInput<Result>
): MutationWithoutInput<Result>;

// ==========================
// Implementation
// ==========================
export function defineMutation(mutation: any) {
  return { ...mutation, type: "mutation" as const };
}
