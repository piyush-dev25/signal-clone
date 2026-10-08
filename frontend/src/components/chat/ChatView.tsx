"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ConversationAvatar } from "@/components/Avatar";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { GroupInfoDialog } from "@/components/GroupInfoDialog";
import { ArrowLeftIcon, PhoneIcon, VideoIcon } from "@/components/icons";
import { useSession } from "@/components/session";
import { IconButton } from "@/components/ui";
import type { Conversation } from "@/lib/api";
import { conversationTitle, otherMember, typingText } from "@/lib/conversations";
import { lastSeenText } from "@/lib/time";
import { useDocumentVisible } from "@/lib/useDocumentVisible";
import { useAppStore } from "@/store/app";
import { toast } from "@/store/toasts";

const NOBODY_TYPING: Record<number, true> = {};

function subtitle(conversation: Conversation, meId: number, typingIds: number[]): string | null {
  if (typingIds.length > 0) return typingText(conversation, typingIds);
  if (conversation.type === "group") {
    const n = conversation.members.length;
    return `${n} member${n === 1 ? "" : "s"}`;
  }
  const other = otherMember(conversation, meId);
  return other?.online ? "Online" : lastSeenText(other?.last_seen ?? null);
}

export function ChatView({ id }: { id: string }) {
  const { me } = useSession();
  const router = useRouter();
  const [infoOpen, setInfoOpen] = useState(false);
  const removedConversationId = useAppStore((s) => s.removedConversationId);
  const conversationId = /^\d+$/.test(id) ? Number(id) : null;
  const status = useAppStore((s) => s.status);
  const conversation = useAppStore((s) => s.conversations.find((c) => c.id === conversationId));
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const sendMessage = useAppStore((s) => s.sendMessage);
  const markRead = useAppStore((s) => s.markRead);
  const typing = useAppStore((s) => (conversationId !== null ? s.typing[conversationId] : undefined)) ?? NOBODY_TYPING;
  const newestLoadedId = useAppStore((s) =>
    conversationId !== null ? (s.messagesByConversation[conversationId]?.messages.findLast((m) => m.id !== 0)?.id ?? 0) : 0,
  );
  const visible = useDocumentVisible();

  const latestId = Math.max(conversation?.last_message?.id ?? 0, newestLoadedId);
  const myLastRead = conversation?.members.find((m) => m.user_id === me.id)?.last_read ?? 0;
  const unread = conversation?.unread_count ?? 0;

  // Highlights this chat in the sidebar while it is open (and tells resync which chat to refresh).
  useEffect(() => {
    setActiveConversation(conversationId);
    return () => setActiveConversation(null);
  }, [conversationId, setActiveConversation]);

  // Removed from this group, left it, or it was deleted: go back to the chat list.
  useEffect(() => {
    if (conversationId !== null && removedConversationId === conversationId) router.replace("/");
  }, [conversationId, removedConversationId, router]);

  // Read while open and visible: on open, on each new message, and when the tab becomes visible.
  useEffect(() => {
    if (conversationId !== null && visible && (latestId > myLastRead || unread > 0)) markRead(conversationId);
  }, [conversationId, visible, latestId, myLastRead, unread, markRead]);

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

  const sub = subtitle(conversation, me.id, Object.keys(typing).map(Number));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-header shrink-0 items-center gap-3 border-b border-border px-pane-x [--dot-ring:var(--color-surface)]">
        <Link
          href="/"
          aria-label="Back to chats"
          className="-ml-2 inline-flex size-icon-button shrink-0 items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg md:hidden"
        >
          <ArrowLeftIcon className="size-icon" />
        </Link>
        {conversation.type === "group" ? (
          // The whole avatar + title area opens Group info.
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label="Group info"
            className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-1 text-left hover:bg-hover"
          >
            <ConversationAvatar conversation={conversation} meId={me.id} size="header" />
            <div className="min-w-0">
              <h2 className="truncate text-header font-semibold text-fg">{conversationTitle(conversation, me.id)}</h2>
              {sub && <p className="truncate text-caption text-fg-secondary">{sub}</p>}
            </div>
          </button>
        ) : (
          <>
            <ConversationAvatar conversation={conversation} meId={me.id} size="header" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-header font-semibold text-fg">{conversationTitle(conversation, me.id)}</h2>
              {sub && <p className="truncate text-caption text-fg-secondary">{sub}</p>}
            </div>
            <IconButton label="Video call" onClick={() => toast("Video calls are coming soon")}>
              <VideoIcon className="size-icon" />
            </IconButton>
            <IconButton label="Voice call" onClick={() => toast("Voice calls are coming soon")}>
              <PhoneIcon className="size-icon" />
            </IconButton>
          </>
        )}
      </header>
      {conversation.type === "group" && (
        <GroupInfoDialog conversation={conversation} open={infoOpen} onOpenChange={setInfoOpen} />
      )}
      <MessageList key={conversation.id} conversation={conversation} meId={me.id} />
      <Composer
        key={`composer-${conversation.id}`}
        conversation={conversation}
        meId={me.id}
        onSend={(body, replyTo) => sendMessage(conversation.id, body, me.id, replyTo)}
      />
    </div>
  );
}
