import type { Conversation, Message } from "@/lib/api";

/** A message as the client holds it: server messages, plus optimistic ones (id 0) not yet saved. */
export type ChatMessage = Message & { local?: "sending" | "failed" };

export type MessageStatus = "sending" | "failed" | "sent" | "delivered" | "read";

/**
 * Status of one of my messages, derived (never stored) from the other members' cursors:
 * the least-advanced member decides, so in groups "read" means read by everyone.
 */
export function messageStatus(message: ChatMessage, conversation: Conversation, meId: number): MessageStatus {
  if (message.local) return message.local;
  const others = conversation.members.filter((m) => m.user_id !== meId);
  if (others.length === 0) return "sent";
  const read = Math.min(...others.map((m) => m.last_read));
  const delivered = Math.min(...others.map((m) => m.last_delivered));
  if (message.id <= read) return "read";
  if (message.id <= delivered) return "delivered";
  return "sent";
}
