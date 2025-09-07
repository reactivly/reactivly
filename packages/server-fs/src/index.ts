import { watch } from "fs";
import type { NotifierReactiveSource } from "@reactivly/server";

export function createFsNotifier() {
  const sources = new Map<string, NotifierReactiveSource>();

  function notifierFor(path: string): NotifierReactiveSource {
    if (!sources.has(path)) {
      const subs = new Set<() => void>();
      let watcher: ReturnType<typeof watch> | null = null;

      const src: NotifierReactiveSource = {
        scope: "global",
        kind: "stateless",
        subscribe(fn) {
          subs.add(fn);
          fn(); // initial trigger

          if (!watcher) {
            watcher = watch(path, () => {
              subs.forEach((f) => {
                Promise.resolve(f()).catch(console.error);
              });
            });
          }

          return {
            unsubscribe: () => {
              subs.delete(fn);
              if (subs.size === 0 && watcher) {
                watcher.close();
                watcher = null;
              }
            },
          };
        },
        notifyChanges() {
          subs.forEach((f) => {
            Promise.resolve(f()).catch(console.error);
          });
        },
      };

      sources.set(path, src);
    }

    return sources.get(path)!;
  }

  return { notifierFor };
}
