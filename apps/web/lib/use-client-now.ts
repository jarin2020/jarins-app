"use client";

import { useSyncExternalStore } from "react";

const browserNow = typeof window === "undefined" ? null : new Date();
const subscribe = () => () => undefined;

/**
 * Dates rendered during SSR must not depend on the server clock or timezone.
 * Consumers render a stable placeholder first, then calculate local dates once
 * hydration has completed.
 */
export function useClientNow() {
  return useSyncExternalStore(
    subscribe,
    () => browserNow,
    () => null,
  );
}
