"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Avatar } from "@/components/Avatar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { Button } from "@/components/ui";
import type { Conversation } from "@/lib/api";
import { memberName, systemMessageText } from "@/lib/conversations";
import { type ChatMessage, messageStatus } from "@/lib/receipts";
import { dayKey, dayLabel } from "@/lib/time";
import { useAppStore } from "@/store/app";

const RUN_WINDOW_MS = 5 * 60_000; // consecutive messages within 5 minutes form one run
const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 150;
const NO_MESSAGES: ChatMessage[] = [];

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; key: string; text: string }
  | { kind: "message"; key: string; message: ChatMessage; firstInRun: boolean; lastInRun: boolean };

/** Stable across the optimistic → saved swap, so React keeps the same element. */
function messageKey(m: ChatMessage): string {
  return m.client_id ? `c:${m.sender_id}:${m.client_id}` : `i:${m.id}`;
}

function continuesRun(prev: ChatMessage | undefined, next: ChatMessage): boolean {
  return (
    prev !== undefined &&
    prev.type === "text" &&
    next.type === "text" &&
    prev.sender_id === next.sender_id &&
    dayKey(prev.created_at) === dayKey(next.created_at) &&
    Date.parse(next.created_at) - Date.parse(prev.created_at) < RUN_WINDOW_MS
  );
}

function buildRows(messages: ChatMessage[], conversation: Conversation, meId: number): Row[] {
  const rows: Row[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) {
      rows.push({ kind: "day", key: `d:${dayKey(m.created_at)}`, label: dayLabel(m.created_at) });
    }
    if (m.type === "system") {
      rows.push({ kind: "system", key: messageKey(m), text: systemMessageText(m, conversation, meId) });
    } else {
      rows.push({
        kind: "message",
        key: messageKey(m),
        message: m,
        firstInRun: !continuesRun(prev, m),
        lastInRun: !next || !continuesRun(m, next),
      });
    }
  });
  return rows;
}

type ScrollSnapshot = {
  conversationId: number;
  first: string | null;
  last: string | null;
  typing: number;
  height: number;
  top: number;
};

/** Incoming-style bubble with three pulsing dots while someone else is typing. */
function TypingBubble({ conversation, userId }: { conversation: Conversation; userId: number }) {
  const sender = conversation.members.find((m) => m.user_id === userId);
  const isGroup = conversation.type === "group";
  return (
    <div className="mt-2 flex justify-start px-pane-x" role="status" aria-label="Typing">
      {isGroup && (
        <div className="mr-2 flex w-avatar-message shrink-0 items-end">
          {sender && (
            <Avatar colorId={sender.user_id} name={sender.display_name} avatar={sender.avatar} size="message" />
          )}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-bubble bg-bubble-in px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-typing-dot animate-typing rounded-full bg-on-bubble-in"
            style={{ animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export function MessageList({ conversation, meId }: { conversation: Conversation; meId: number }) {
  const chat = useAppStore((s) => s.messagesByConversation[conversation.id]);
  const loadLatest = useAppStore((s) => s.loadLatest);
  const loadOlder = useAppStore((s) => s.loadOlder);
  const retryMessage = useAppStore((s) => s.retryMessage);
  const typingMap = useAppStore((s) => s.typing[conversation.id]);
  const typingIds = Object.keys(typingMap ?? {}).map(Number);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const snapshot = useRef<ScrollSnapshot | null>(null);

  const loaded = chat?.loaded ?? false;
  const messages = chat?.messages ?? NO_MESSAGES;
  const isGroup = conversation.type === "group";

  useEffect(() => {
    if (!loaded) void loadLatest(conversation.id);
  }, [conversation.id, loaded, loadLatest]);

  // Scroll management runs after the DOM updates but before paint, so there is no visible jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const first = messages[0] ? messageKey(messages[0]) : null;
    const lastMessage = messages.at(-1);
    const last = lastMessage ? messageKey(lastMessage) : null;
    const prev = snapshot.current;

    if (!prev || prev.conversationId !== conversation.id || prev.last === null) {
      el.scrollTop = el.scrollHeight; // opened (or first messages arrived): start at the bottom
    } else if (first !== prev.first && last === prev.last) {
      el.scrollTop = prev.top + (el.scrollHeight - prev.height); // older page prepended: stay put
    } else if (last !== prev.last && (nearBottom.current || lastMessage?.sender_id === meId)) {
      el.scrollTop = el.scrollHeight; // new message: follow if we were at the bottom or it's ours
    } else if (typingIds.length !== prev.typing && nearBottom.current) {
      el.scrollTop = el.scrollHeight; // keep the typing bubble in view
    }
    snapshot.current = {
      conversationId: conversation.id,
      first,
      last,
      typing: typingIds.length,
      height: el.scrollHeight,
      top: el.scrollTop,
    };
  }, [messages, conversation.id, meId, typingIds.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (snapshot.current) {
      snapshot.current.top = el.scrollTop;
      snapshot.current.height = el.scrollHeight;
    }
    if (el.scrollTop < LOAD_OLDER_PX && chat?.hasMore && !chat.loadingOlder) void loadOlder(conversation.id);
  }

  const rows = buildRows(messages, conversation, meId);
  const memberById = new Map(conversation.members.map((m) => [m.user_id, m]));

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pb-3">
      {chat?.hasMore && (
        <div className="flex justify-center pt-3">
          <Button variant="ghost" disabled={chat.loadingOlder} onClick={() => void loadOlder(conversation.id)}>
            {chat.loadingOlder ? "Loading…" : "Load older messages"}
          </Button>
        </div>
      )}
      {!loaded && !chat?.error && <p className="py-6 text-center text-body-sm text-fg-tertiary">Loading messages…</p>}
      {chat?.error && !loaded && <p className="py-6 text-center text-body-sm text-danger">{chat.error}</p>}
      {loaded && messages.length === 0 && (
        <p className="py-6 text-center text-body-sm text-fg-tertiary">No messages yet. Say hi!</p>
      )}

      {rows.map((row) => {
        if (row.kind === "day") {
          return (
            <div key={row.key} className="flex justify-center pt-4 pb-1">
              <span className="text-caption font-medium text-fg-secondary">{row.label}</span>
            </div>
          );
        }
        if (row.kind === "system") {
          return (
            <p key={row.key} className="px-pane-x py-2 text-center text-caption text-fg-secondary">
              {row.text}
            </p>
          );
        }
        const { message } = row;
        const mine = message.sender_id === meId;
        const quoted = message.reply_to;
        const quotedMember = quoted ? memberById.get(quoted.sender_id) : undefined;
        return (
          <MessageBubble
            key={row.key}
            message={message}
            mine={mine}
            firstInRun={row.firstInRun}
            lastInRun={row.lastInRun}
            isGroup={isGroup}
            sender={memberById.get(message.sender_id)}
            quotedAuthor={quoted ? (quoted.sender_id === meId ? "You" : quotedMember ? memberName(quotedMember) : "") : null}
            status={mine ? messageStatus(message, conversation, meId) : null}
            onRetry={() => message.client_id && retryMessage(conversation.id, message.client_id)}
          />
        );
      })}
      {typingIds.length > 0 && <TypingBubble conversation={conversation} userId={typingIds[0]} />}
    </div>
  );
}
