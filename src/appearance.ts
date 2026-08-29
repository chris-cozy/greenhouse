import { useSyncExternalStore } from "react";

export const FOREST_AESTHETIC_KEY = "greenhouse-forest-aesthetic";
const attribute = "data-forest-aesthetic";
type Appearance = { enabled: boolean; remembered: boolean };
let appearance: Appearance = { enabled: true, remembered: true };
let initialized = false;
const listeners = new Set<() => void>();

// Keep this default consistent with the small, pre-paint bootstrap in index.html.
const enabledFrom = (value: string | null) => value !== "false";
function publish(enabled: boolean, remembered: boolean) {
  document.documentElement.setAttribute(attribute, String(enabled));
  if (appearance.enabled === enabled && appearance.remembered === remembered) return;
  appearance = { enabled, remembered };
  listeners.forEach(listener => listener());
}

function storageChanged(event: StorageEvent) {
  if (event.key !== FOREST_AESTHETIC_KEY && event.key !== null) return;
  try {
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    publish(enabledFrom(event.newValue), true);
  } catch {
    // A blocked storage area must not discard the current session's choice.
    publish(appearance.enabled, false);
  }
}

/** Installed once by the shell entry point, including when Settings is not mounted. */
export function initializeAppearance() {
  if (!initialized) {
    initialized = true;
    try { publish(enabledFrom(window.localStorage.getItem(FOREST_AESTHETIC_KEY)), true); }
    catch { publish(true, false); }
    window.addEventListener("storage", storageChanged);
  }
  return () => {
    window.removeEventListener("storage", storageChanged);
    initialized = false;
  };
}

export function setForestAesthetic(enabled: boolean) {
  initializeAppearance();
  let remembered = true;
  try { window.localStorage.setItem(FOREST_AESTHETIC_KEY, String(enabled)); }
  catch { remembered = false; }
  publish(enabled, remembered);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSnapshot = () => appearance;

export function useForestAesthetic() {
  initializeAppearance();
  return useSyncExternalStore(subscribe, getSnapshot);
}
