import { watch } from "fs";
import { collectDependency, type NotifierReactiveSource } from "@reactivly/server";

export function createFsNotifier() {
  const sources = new Map<string, NotifierReactiveSource>();

  return {
    proxy(path: string) {
      if (!sources.has(path)) {
        const subscribers = new Set<() => void>();

        const src: NotifierReactiveSource = {
          scope: "global",
          kind: "stateless",
          subscribe(fn) {
            fn(); // initial trigger
            subscribers.add(fn);
            const watcher = watch(path, () => {
              for (const sub of subscribers) sub();
            });
            return {
              unsubscribe: () => {
                subscribers.delete(fn);
                if (subscribers.size === 0) watcher.close();
              },
            };
          },
          notifyChanges() {
            for (const fn of subscribers) fn();
          },
        };

        sources.set(path, src);
      }

      const src = sources.get(path)!;
      collectDependency(src); // register dependency for queries
      return path; // return path so query can read file
    },
  };
}
