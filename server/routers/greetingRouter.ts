import z from "zod";
import { t } from "./trpc";
import { fileToObservable } from "../fs";
import { switchMap } from "rxjs/operators";

const fileSignal = fileToObservable("data.txt");

export const greetingRouter = t.router({
  get: t.procedure.subscription(({ ctx }) => ctx.userName),
  logout: t.procedure.mutation(({ ctx }) => {
    ctx.userName.next(undefined);
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
      ctx.userName.next(input.name);
      return {
        success: true,
      };
    }),
  file: t.procedure.subscription(() =>
    fileSignal.pipe(
      switchMap((readFile) => readFile())
    )
  ),
});
