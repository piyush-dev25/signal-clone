import type { Contact, Conversation, Member, Message } from "@/lib/api";
import { formatPhone } from "@/lib/phone";

type Named = Pick<Member, "nickname" | "display_name" | "phone">;

/** How a person is shown to the viewer: their nickname for them, else display name, else phone. */
export function memberName(person: Named): string {
  return person.nickname || person.display_name || formatPhone(person.phone);
}

export function contactName(contact: Contact): string {
  return memberName(contact);
}

/** The other person in a direct chat. */
export function otherMember(conversation: Conversation, meId: number): Member | null {
  return conversation.members.find((m) => m.user_id !== meId) ?? null;
}

export function conversationTitle(conversation: Conversation, meId: number): string {
  if (conversation.type === "group") return conversation.name || "Unnamed group";
  const other = otherMember(conversation, meId);
  return other ? memberName(other) : "Unknown";
}

/** Per-viewer text for a system message, e.g. "You added Rahul." / "Priya added you." */
export function systemMessageText(message: Message, conversation: Conversation, meId: number): string {
  const meta = message.meta;
  if (!meta) return "";
  const who = (userId: number | undefined, subject: boolean) => {
    if (userId === meId) return subject ? "You" : "you";
    const member = conversation.members.find((m) => m.user_id === userId);
    if (member) return memberName(member);
    return subject ? "Someone" : "someone";
  };
  const actor = who(meta.actor_id, true);
  const target = who(meta.target_id, false);
  switch (meta.action) {
    case "group_created":
      return `${actor} created the group.`;
    case "member_added":
      return `${actor} added ${target}.`;
    case "member_removed":
      return `${actor} removed ${target}.`;
    case "member_left":
      return `${actor} left the group.`;
    case "renamed":
      return `${actor} changed the group name to “${meta.name ?? ""}”.`;
    case "role_changed":
      return meta.role === "admin"
        ? `${actor} made ${target} an admin.`
        : `${actor} revoked admin privileges from ${target}.`;
    default:
      return "";
  }
}

/** Second line of a conversation list row. */
export function previewText(conversation: Conversation, meId: number): string {
  const message = conversation.last_message;
  if (!message) return "";
  if (message.type === "system") return systemMessageText(message, conversation, meId);
  const body = message.body ?? "";
  if (message.sender_id === meId) return `You: ${body}`;
  if (conversation.type === "group") {
    const sender = conversation.members.find((m) => m.user_id === message.sender_id);
    return sender ? `${memberName(sender)}: ${body}` : body;
  }
  return body;
}

function activityTime(conversation: Conversation): number {
  return Date.parse(conversation.last_message?.created_at ?? conversation.created_at);
}

/** Same rule as the backend: latest message first; empty chats by creation time. */
export function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort(
    (a, b) =>
      activityTime(b) - activityTime(a) || (b.last_message?.id ?? 0) - (a.last_message?.id ?? 0),
  );
}

export function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) => contactName(a).localeCompare(contactName(b), undefined, { sensitivity: "base" }));
}
