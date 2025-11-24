import { computed, trigger } from "alien-signals";
import { watch } from "fs";
import fs from "fs/promises";

export function fileToSignal(filePath: string) {
  const reader = () => fs.readFile(filePath, "utf-8");
  const compute = computed(() => reader);

  watch(filePath, () => {
    trigger(compute);
  });

  return compute;
}
