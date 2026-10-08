/** Hints already shown this page load (the fallback when localStorage is unavailable). */
const shownThisLoad = new Set<string>();

/**
 * True the first time it's called for `key`, then false forever after: remembered in localStorage,
 * or (if storage is blocked or throws) at least for the rest of this page load.
 */
export function takeOnce(key: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeLocalStorage()): boolean {
  if (shownThisLoad.has(key)) return false;
  shownThisLoad.add(key);
  try {
    if (storage?.getItem(key)) return false;
    storage?.setItem(key, "1");
  } catch {
    // Storage unavailable: the in-memory set still limits it to once per page load.
  }
  return true;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
