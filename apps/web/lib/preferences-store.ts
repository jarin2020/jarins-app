"use client";

import { useCallback, useEffect, useState } from "react";

export type Preferences = {
  name: string;
  timezone: string;
  locale: string;
  household: string;
  reminders: boolean;
  minimalAnalytics: boolean;
  aiFeatures: boolean;
};

export const preferenceDefaults: Preferences = {
  name: "Faria",
  timezone: "Europe/Berlin",
  locale: "en",
  household: "Jarin household",
  reminders: true,
  minimalAnalytics: false,
  aiFeatures: false,
};

export const PREFERENCES_KEY = "jarins-preferences-v1";
const EVENT_NAME = "jarins-preferences-changed";

export function readPreferences(): Preferences {
  if (typeof window === "undefined") return preferenceDefaults;
  try {
    return { ...preferenceDefaults, ...JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "{}") };
  } catch {
    return preferenceDefaults;
  }
}

export function writePreferences(preferences: Preferences) {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function usePreferences() {
  const [preferences, setPreferences] = useState(preferenceDefaults);
  useEffect(() => {
    const load = () => setPreferences(readPreferences());
    queueMicrotask(load);
    window.addEventListener(EVENT_NAME, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(EVENT_NAME, load); window.removeEventListener("storage", load); };
  }, []);
  const save = useCallback((next: Preferences) => writePreferences(next), []);
  return { preferences, save };
}
