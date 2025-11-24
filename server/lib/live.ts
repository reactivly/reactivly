
import { observable } from "@trpc/server/observable";
import { effect } from "alien-signals";

export function live<T>(compute: () => T) {
  return observable<T>((observer) => {
    const dispose = effect(async () => {
      console.log("Computing live value");
      return observer.next(await compute());
    });
    return () => {
      console.log("Disposing live subscription");
      dispose();
    };
  });
}
