"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isMac, matchShortcut } from "@/lib/shortcuts";
import { useAppStore } from "@/store/app";

const SEARCH_INPUT_ID = "sidebar-search";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Radix renders dialogs/menus only while open, so presence in the DOM means "open". */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}

/** App-wide keyboard shortcuts (see lib/shortcuts.ts for the table and the reasoning). */
export function useShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const mac = isMac();

    function focusSearch() {
      const input = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null;
      if (input && input.offsetParent !== null) {
        input.focus();
        input.select();
        return;
      }
      // Phone width with a chat open: the sidebar is hidden, so go back to the list first.
      router.push("/");
      setTimeout(() => document.getElementById(SEARCH_INPUT_ID)?.focus(), 50);
    }

    function stepConversation(delta: 1 | -1) {
      const { conversations, activeConversationId } = useAppStore.getState();
      if (conversations.length === 0) return;
      const index = conversations.findIndex((c) => c.id === activeConversationId);
      const next =
        index === -1 ? (delta === 1 ? 0 : conversations.length - 1) : Math.min(conversations.length - 1, Math.max(0, index + delta));
      if (next !== index) router.push(`/chat/${conversations[next].id}`);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      const store = useAppStore.getState();

      if (event.key === "Escape") {
        // Exactly one action per keypress: Radix closes an open dialog/menu itself, so do
        // nothing then; otherwise cancel the reply, otherwise clear the search.
        if (overlayOpen()) return;
        if (store.replyingTo) {
          store.setReplyingTo(null);
          event.preventDefault();
        } else if (store.searchQuery) {
          store.setSearchQuery("");
          event.preventDefault();
        }
        return;
      }

      // Shortcuts don't fire behind an open dialog or menu.
      if (overlayOpen()) return;
      const shortcut = matchShortcut(event, mac, isTyping(event.target));
      if (!shortcut) return;
      event.preventDefault();
      switch (shortcut) {
        case "newChat":
          store.openDialog("newChat");
          break;
        case "newGroup":
          store.openDialog("newGroup");
          break;
        case "settings":
          store.openDialog("settings");
          break;
        case "focusSearch":
          focusSearch();
          break;
        case "previousChat":
          stepConversation(-1);
          break;
        case "nextChat":
          stepConversation(1);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);
}
