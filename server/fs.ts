import { BehaviorSubject } from "rxjs";
import { watch } from "fs";
import fs from "fs/promises";

export function fileToObservable(filePath: string): BehaviorSubject<() => Promise<string>> {
  const subject = new BehaviorSubject<() => Promise<string>>(() => fs.readFile(filePath, "utf-8"));

  // Watch for changes and update the subject with the same reader function
  const watcher = watch(filePath, () => {
    subject.next(() => fs.readFile(filePath, "utf-8"));
  });

  // Cleanup the watcher when the subject is unsubscribed
  subject.subscribe({
    complete: () => {
      watcher.close();
    },
  });

  return subject;
}
