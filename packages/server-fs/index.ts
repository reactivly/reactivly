import { watch } from "fs";
import type { ReactiveSource } from "@reactivly/server";

export function fsReactiveSource(path: string): ReactiveSource {
  return {
    id: `fs:${path}`,
    onChange(cb) {
      const watcher = watch(path, { recursive: false }, () => cb());
      return () => watcher.close();
    },
  };
}
