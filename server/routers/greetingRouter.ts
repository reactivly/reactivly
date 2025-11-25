
import z from "zod";
import { live } from "../lib/live";
import { t } from "./trpc";
import { fileToSignal } from "../fs";
import { effect } from "alien-signals";

const fileSignal = fileToSignal("data.txt");

effect(() => {
  console.log("fileSignal changed:", fileSignal());
});

export const greetingRouter = t.router({
  get: t.procedure.subscription(({ ctx }) => live(ctx.userName)),
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
  file: t.procedure.subscription(() => live(fileSignal())),
});
