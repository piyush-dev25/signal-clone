import type { ChatMessage } from "@/lib/receipts";

/** Same message: same server id, or the same sender's client_id (optimistic copy vs saved copy). */
export function sameMessage(a: ChatMessage, b: ChatMessage): boolean {
  if (a.id !== 0 && a.id === b.id) return true;
  return a.client_id !== null && a.client_id === b.client_id && a.sender_id === b.sender_id;
}

/** Saved messages in id order; optimistic (unsaved, id 0) ones after them in creation order. */
function compare(a: ChatMessage, b: ChatMessage): number {
  const aPending = a.id === 0;
  const bPending = b.id === 0;
  if (aPending !== bPending) return aPending ? 1 : -1;
  if (aPending) return a.created_at.localeCompare(b.created_at);
  return a.id - b.id;
}

/** Insert/replace messages, deduped by id and client_id. Incoming copies win. */
export function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const kept = existing.filter((e) => !incoming.some((i) => sameMessage(e, i)));
  return [...kept, ...incoming].sort(compare);
}

/** Should `message` replace `current` as a conversation's last_message? */
export function isNewer(message: ChatMessage, current: ChatMessage | null): boolean {
  if (!current) return true;
  if (sameMessage(message, current)) return true; // e.g. the saved copy of my pending message
  if (message.id === 0) return true; // just typed
  if (current.id === 0) return false; // my pending message stays on top until it's saved
  return message.id > current.id;
}
