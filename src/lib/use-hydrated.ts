import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** true setelah hidrasi di browser; false saat render server. Tanpa hydration mismatch. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
