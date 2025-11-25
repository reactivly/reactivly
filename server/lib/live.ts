import { observable } from "@trpc/server/observable";
import { signal, effect } from "alien-signals";

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

export function debounceComputed<T>(compute: () => T, delay: number) {
  const out = signal<T>(compute());
  let timeout: ReturnType<typeof setTimeout> | null = null;

  // Track dependency changes WITHOUT running compute immediately
  const trigger = signal(0);

  effect(() => {
    // whenever compute() dependencies change
    compute(); // we don't use the value — this only tracks deps

    trigger(trigger() + 1); // bump trigger
  });

  // run compute AFTER debounce window
  effect(() => {
    const _ = trigger(); // react to bump

    if (timeout) clearTimeout(timeout);

    timeout = setTimeout(() => {
      const value = compute();
      out(value);
    }, delay);
  });

  return out;
}
