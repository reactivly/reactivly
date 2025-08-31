export interface ReactiveSource {
  id: string; // Unique ID (e.g. "pg:tableName")
  onChange(cb: () => void): void;
}

export type BaseEndpoint = {
  type: "query" | "mutation";
  handler: (...args: any[]) => any;
};