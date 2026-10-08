export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "signal.theme";
const CHANGE_EVENT = "signal:theme-change";

/**
 * Runs inline in <head> before first paint (see app/layout.tsx), so there is no flash.
 * Kept as a plain-JS string; it re-reads the preference on every OS change so the OS is only
 * followed while the preference is "system".
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var m=window.matchMedia("(prefers-color-scheme: dark)");var p=function(){try{var v=localStorage.getItem(k);return v==="light"||v==="dark"?v:"system"}catch(e){return "system"}};var a=function(){var v=p();document.documentElement.classList.toggle("dark",v==="dark"||(v==="system"&&m.matches))};a();m.addEventListener("change",a)}catch(e){}})();`;

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(preference: ThemePreference): void {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Not persisted (private mode); still applied for this page.
  }
  applyTheme(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For useSyncExternalStore: this tab's changes and other tabs' (storage event). */
export function subscribeTheme(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    applyTheme(getThemePreference()); // keep this tab in sync with the other one
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
