/**
 * Keyboard shortcuts: one table for both the handler (components/useShortcuts.ts) and the list in
 * Settings.
 *
 * Chosen to work in Chrome, Edge and Firefox without fighting the browser:
 * - no Ctrl+N / Ctrl+Shift+N / Ctrl+T / Ctrl+W (reserved by browsers);
 * - Alt+N / Alt+G / Alt+, open no browser menu (Firefox's Alt menus are F/E/V/S/B/T/H,
 *   Chrome's F/E/D); Alt+Up/Down have no default; Ctrl/Cmd+K is overridable everywhere;
 * - not Cmd+, : that is the browser's own Preferences on macOS;
 * - keys match on event.code, so macOS Option+letter (which types a symbol) still works;
 * - Alt shortcuts require Ctrl to be up, so AltGr (Ctrl+Alt) typing on non-US layouts is untouched.
 */

export type ShortcutId = "newChat" | "newGroup" | "focusSearch" | "previousChat" | "nextChat" | "settings";

type KeyInfo = Pick<KeyboardEvent, "code" | "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

type Shortcut = {
  id: ShortcutId;
  description: string;
  /** Display labels: [windows/linux, mac]. */
  labels: [string, string][];
  /** Plain (unmodified) keys must not fire while the user is typing. */
  plain?: boolean;
  matches: (e: KeyInfo, mac: boolean) => boolean;
};

const altOnly = (e: KeyInfo) => e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
const modOnly = (e: KeyInfo, mac: boolean) =>
  (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) && !e.altKey && !e.shiftKey;
const noModifiers = (e: KeyInfo) => !e.altKey && !e.ctrlKey && !e.metaKey;

export const SHORTCUTS: Shortcut[] = [
  {
    id: "newChat",
    description: "New chat",
    labels: [["Alt+N", "⌥N"]],
    matches: (e) => altOnly(e) && e.code === "KeyN",
  },
  {
    id: "newGroup",
    description: "New group",
    labels: [["Alt+G", "⌥G"]],
    matches: (e) => altOnly(e) && e.code === "KeyG",
  },
  {
    id: "focusSearch",
    description: "Search chats and contacts",
    labels: [
      ["Ctrl+K", "⌘K"],
      ["/", "/"],
    ],
    matches: (e, mac) => modOnly(e, mac) && e.code === "KeyK",
  },
  {
    id: "focusSearch",
    description: "Search chats and contacts",
    labels: [],
    plain: true,
    matches: (e) => noModifiers(e) && e.key === "/",
  },
  {
    id: "previousChat",
    description: "Previous chat",
    labels: [["Alt+↑", "⌥↑"]],
    matches: (e) => altOnly(e) && e.code === "ArrowUp",
  },
  {
    id: "nextChat",
    description: "Next chat",
    labels: [["Alt+↓", "⌥↓"]],
    matches: (e) => altOnly(e) && e.code === "ArrowDown",
  },
  {
    id: "settings",
    description: "Settings",
    labels: [["Alt+,", "⌥,"]],
    matches: (e) => altOnly(e) && e.code === "Comma",
  },
];

/** Shown in Settings; Esc is handled separately (dialogs/menus, then reply, then search). */
export const ESCAPE_HELP = "Close a dialog or menu, else cancel the reply, else clear the search";

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** The shortcut for a key event, or null. `typing` = focus is in an editable field. */
export function matchShortcut(e: KeyInfo, mac: boolean, typing: boolean): ShortcutId | null {
  for (const shortcut of SHORTCUTS) {
    if (shortcut.plain && typing) continue;
    if (shortcut.matches(e, mac)) return shortcut.id;
  }
  return null;
}

/** Rows for the Settings list: description + key labels for this platform. */
export function shortcutRows(mac: boolean): { description: string; keys: string[] }[] {
  const rows = SHORTCUTS.filter((s) => s.labels.length > 0).map((s) => ({
    description: s.description,
    keys: s.labels.map(([other, macLabel]) => (mac ? macLabel : other)),
  }));
  return [...rows, { description: ESCAPE_HELP, keys: ["Esc"] }];
}
