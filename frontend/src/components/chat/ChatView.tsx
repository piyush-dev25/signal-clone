"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ConversationAvatar } from "@/components/Avatar";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { ArrowLeftIcon } from "@/components/icons";
import { useSession } from "@/components/session";
import type { Conversation } from "@/lib/api";
import { conversationTitle, otherMember } from "@/lib/conversations";
import { lastSeenText } from "@/lib/time";
import { useAppStore } from "@/store/app";

function subtitle(conversation: Conversation, meId: number): string | null {
  if (conversation.type === "group") {
    const n = conversation.members.length;
    return `${n} member${n === 1 ? "" : "s"}`;
  }
  return lastSeenText(otherMember(conversation, meId)?.last_seen ?? null);
}

export function ChatView({ id }: { id: string }) {
  const { me } = useSession();
  const conversationId = /^\d+$/.test(id) ? Number(id) : null;
  const status = useAppStore((s) => s.status);
  const conversation = useAppStore((s) => s.conversations.find((c) => c.id === conversationId));
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const sendMessage = useAppStore((s) => s.sendMessage);

  // Highlights this chat in the sidebar while it is open (and tells resync which chat to refresh).
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  if (!conversation) {
    if (conversationId !== null && status !== "ready" && status !== "error") return null; // still loading
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-header font-semibold text-fg">Chat not found</p>
        <p className="text-body-sm text-fg-secondary">It doesn&apos;t exist or you&apos;re not a member.</p>
        <Link href="/" className="mt-2 text-body-sm font-medium text-accent hover:underline">
          Back to chats
        </Link>
      </div>
    );
  }

  const sub = subtitle(conversation, me.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-header shrink-0 items-center gap-3 border-b border-border px-pane-x">
        <Link
          href="/"
          aria-label="Back to chats"
          className="-ml-2 inline-flex size-icon-button shrink-0 items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg md:hidden"
        >
          <ArrowLeftIcon className="size-icon" />
        </Link>
        <ConversationAvatar conversation={conversation} meId={me.id} size="header" />
        <div className="min-w-0">
          <h2 className="truncate text-header font-semibold text-fg">{conversationTitle(conversation, me.id)}</h2>
          {sub && <p className="truncate text-caption text-fg-secondary">{sub}</p>}
        </div>
      </header>
      <MessageList key={conversation.id} conversation={conversation} meId={me.id} />
      <Composer key={`composer-${conversation.id}`} onSend={(body) => sendMessage(conversation.id, body, me.id)} />
    </div>
  );
}
