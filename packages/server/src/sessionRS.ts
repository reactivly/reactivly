// Session-RS factory
let _nextSessionRSId = 1;

export function createSessionRS<T>(initial: T) {
  const id = `sessionRS-${_nextSessionRSId++}`; // unique per WS/session
  let value = initial;
  const listeners = new Set<(v: T) => void>();

  return {
    id, // required by defineEndpoint
    get value() {
      return value;
    },
    set value(v: T) {
      value = v;
      listeners.forEach((cb) => cb(value));
    },
    onChange(cb: (v: T) => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
  };
}