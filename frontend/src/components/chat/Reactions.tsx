"use client";

import { type KeyboardEvent, type RefObject, useEffect, useEffectEvent, useRef } from "react";
import type { Reaction } from "@/lib/api";
import { REACTIONS, groupReactions } from "@/lib/reactions";

type PickerProps = {
  /** My current reaction on this message (highlighted; picking it again removes it). */
  current: string | null;
  /** "above" normally; "below" when the message is near the top of the list. */
  placement: "above" | "below";
  /** Which edge of the bubble to anchor to, so the picker extends over the bubble, not off-screen. */
  align: "start" | "end";
  /** The button that opened the picker (clicks on it toggle rather than count as outside). */
  triggerRef: RefObject<HTMLButtonElement | null>;
  onPick: (emoji: string) => void;
  onClose: () => void;
};

/**
 * Small popover with the six reactions. Closes on pick, outside pointerdown and Esc.
 * Its Esc handler runs in the capture phase and stops the event, so the same keypress can't also
 * cancel a reply or clear the search (the global handler also skips while a role="menu" is open).
 */
export function ReactionPicker({ current, placement, align, triggerRef, onPick, onClose }: PickerProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    const start = current ? (REACTIONS as readonly string[]).indexOf(current) : 0;
    items?.[Math.max(0, start)]?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
      triggerRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
    // Focus the initial option once, when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Left/Right (and Home/End) move between the options, wrapping around. */
  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const move: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: items.length - 1 };
    if (!(event.key in move)) return;
    event.preventDefault();
    items[(move[event.key] + items.length) % items.length]?.focus();
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="React"
      aria-orientation="horizontal"
      onKeyDown={onMenuKeyDown}
      className={`absolute z-20 flex gap-0.5 rounded-menu bg-menu p-1 shadow-menu ${
        placement === "above" ? "bottom-full mb-1" : "top-full mt-1"
      } ${align === "end" ? "right-0" : "left-0"}`}
    >
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitemradio"
          aria-checked={current === emoji}
          aria-label={current === emoji ? `Remove ${emoji}` : `React ${emoji}`}
          onClick={() => onPick(emoji)}
          className={`flex size-reaction-option items-center justify-center rounded-full text-title transition-transform hover:scale-110 hover:bg-hover focus-visible:outline-2 focus-visible:outline-accent ${
            current === emoji ? "bg-reaction-mine" : ""
          }`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

type ChipsProps = {
  reactions: Reaction[];
  meId: number;
  /** "You", the viewer's name for a member, or a fallback for someone who has left. */
  nameOf: (userId: number) => string;
  /** My own message: chips align to the bubble's right edge. */
  mine: boolean;
  onToggle: (emoji: string) => void;
};

/** Chips under a bubble, one per emoji with a count; mine is highlighted and toggles. */
export function ReactionChips({ reactions, meId, nameOf, mine, onToggle }: ChipsProps) {
  const groups = groupReactions(reactions, meId);
  if (groups.length === 0) return null;
  return (
    <div className={`-mt-1 flex flex-wrap gap-1 px-2 ${mine ? "justify-end" : "justify-start"}`}>
      {groups.map((group) => {
        // Me first, then the others in the order they reacted.
        const names = [...group.userIds]
          .sort((a, b) => Number(b === meId) - Number(a === meId))
          .map(nameOf)
          .join(", ");
        return (
          <button
            key={group.emoji}
            type="button"
            aria-pressed={group.mine}
            aria-label={`${group.emoji} ${group.count}: ${names}. ${group.mine ? "Remove your reaction" : `React ${group.emoji}`}`}
            title={names}
            onClick={() => onToggle(group.emoji)}
            className={`inline-flex h-reaction-chip items-center gap-1 rounded-full border px-1.5 text-caption ring-2 ring-surface focus-visible:outline-2 focus-visible:outline-accent ${
              group.mine
                ? "border-reaction-mine-border bg-reaction-mine text-fg"
                : "border-reaction-border bg-reaction text-fg-secondary hover:bg-hover"
            }`}
          >
            <span aria-hidden>{group.emoji}</span>
            {group.count > 1 && <span aria-hidden>{group.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
