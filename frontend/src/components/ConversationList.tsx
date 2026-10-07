"use client";

import { ConversationListItem } from "@/components/ConversationListItem";
import { ChatIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { useAppStore } from "@/store/app";

type Props = { meId: number; onNewChat: () => void };

export function ConversationList({ meId, onNewChat }: Props) {
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);
  const conversations = useAppStore((s) => s.conversations);
  const activeId = useAppStore((s) => s.activeConversationId);
  const load = useAppStore((s) => s.load);

  if (status === "idle" || status === "loading") {
    return <p className="px-pane-x py-3 text-body-sm text-fg-tertiary">Loading chats…</p>;
  }
  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 px-pane-x py-8 text-center">
        <p className="text-body-sm text-fg-secondary">{error}</p>
        <Button variant="secondary" onClick={() => load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-pane-x py-12 text-center">
        <ChatIcon className="size-10 text-fg-tertiary" />
        <p className="text-body font-medium text-fg">No conversations yet</p>
        <p className="text-body-sm text-fg-secondary">Start a chat with one of your contacts.</p>
        <Button onClick={onNewChat}>Start a new chat</Button>
      </div>
    );
  }

  return (
    <nav aria-label="Conversations" className="flex flex-col pb-2">
      {conversations.map((c) => (
        <ConversationListItem key={c.id} conversation={c} meId={meId} selected={c.id === activeId} />
      ))}
    </nav>
  );
}
