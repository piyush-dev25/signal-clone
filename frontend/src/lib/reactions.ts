import type { Reaction } from "@/lib/api";

/** The only frontend copy; must match ALLOWED_REACTIONS in backend/app/services/reactions.py. */
export const REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"] as const;

export type ReactionGroup = { emoji: string; count: number; userIds: number[]; mine: boolean };

/** Chips under a bubble: one per emoji (in REACTIONS order), with who reacted. */
export function groupReactions(reactions: Reaction[], meId: number): ReactionGroup[] {
  const order = (emoji: string) => {
    const index = (REACTIONS as readonly string[]).indexOf(emoji);
    return index === -1 ? REACTIONS.length : index;
  };
  const groups = new Map<string, ReactionGroup>();
  for (const { user_id, emoji } of reactions) {
    const group = groups.get(emoji) ?? { emoji, count: 0, userIds: [], mine: false };
    group.count += 1;
    group.userIds.push(user_id);
    group.mine ||= user_id === meId;
    groups.set(emoji, group);
  }
  return [...groups.values()].sort((a, b) => order(a.emoji) - order(b.emoji));
}

export function myReaction(reactions: Reaction[], meId: number): string | null {
  return reactions.find((r) => r.user_id === meId)?.emoji ?? null;
}

/** The list with my reaction set to `emoji` (replacing any other), or removed when null. */
export function withMine(reactions: Reaction[], meId: number, emoji: string | null): Reaction[] {
  const others = reactions.filter((r) => r.user_id !== meId);
  return emoji === null ? others : [...others, { user_id: meId, emoji }];
}

/** Picking my current emoji removes it; any other emoji replaces mine (one per person). */
export function toggleReaction(
  reactions: Reaction[],
  meId: number,
  emoji: string,
): { next: Reaction[]; action: "set" | "remove" } {
  const remove = myReaction(reactions, meId) === emoji;
  return { next: withMine(reactions, meId, remove ? null : emoji), action: remove ? "remove" : "set" };
}
