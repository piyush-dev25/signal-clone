"use client";

import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CloseIcon, SendIcon } from "@/components/icons";
import { IconButton } from "@/components/ui";
import type { Conversation } from "@/lib/api";
import { memberName } from "@/lib/conversations";
import type { ChatMessage } from "@/lib/receipts";
import { createTypingNotifier } from "@/lib/typing";
import { useAppStore } from "@/store/app";

const MAX_LENGTH = 4000; // matches the backend limit

type Props = {
  conversation: Conversation;
  meId: number;
  onSend: (body: string, replyTo: ChatMessage | null) => void;
};

/** Keyed by conversation in ChatView, so each chat gets a fresh composer and typing notifier. */
export function Composer({ conversation, meId, onSend }: Props) {
  const conversationId = conversation.id;
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [typing] = useState(() =>
    createTypingNotifier((isTyping) => useAppStore.getState().sendTyping(conversationId, isTyping)),
  );
  const replyingTo = useAppStore((s) => s.replyingTo);
  const setReplyingTo = useAppStore((s) => s.setReplyingTo);
  const reply = replyingTo?.conversationId === conversationId ? replyingTo.message : null;
  const canSend = text.trim().length > 0;

  const replyAuthor = reply
    ? reply.sender_id === meId
      ? "yourself"
      : (() => {
          const member = conversation.members.find((m) => m.user_id === reply.sender_id);
          return member ? memberName(member) : "a message";
        })()
    : null;

  // Choosing Reply puts the cursor in the composer.
  useEffect(() => {
    if (reply) inputRef.current?.focus();
  }, [reply]);

  useEffect(() => () => typing.stop(), [typing]); // leaving the chat stops "typing"

  // Grow with the content; CSS caps it at --spacing-composer-max, after which it scrolls.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  function submit() {
    const body = text.trim();
    if (!body) return;
    typing.stop();
    onSend(body, reply);
    setReplyingTo(null);
    setText("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a newline; ignore Enter that confirms an IME composition.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        submit();
      }}
      className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-pane-x py-2"
    >
      {reply && (
        <div className="flex items-start gap-2 rounded-quote border-l-4 border-quote-bar-in bg-quote-in py-1.5 pr-1 pl-3">
          <div className="min-w-0 flex-1">
            <p className="text-caption font-semibold text-fg">Replying to {replyAuthor}</p>
            <p className="line-clamp-2 text-body-sm wrap-break-word whitespace-pre-wrap text-fg-secondary">{reply.body}</p>
          </div>
          <IconButton label="Cancel reply (Esc)" onClick={() => setReplyingTo(null)} className="size-7">
            <CloseIcon className="size-4" />
          </IconButton>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          rows={1}
          autoFocus
          aria-label="Message"
          placeholder="Message"
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            typing.input(e.target.value);
          }}
          onBlur={() => typing.stop()}
          onKeyDown={onKeyDown}
          className="max-h-composer-max min-h-button flex-1 resize-none overflow-y-auto rounded-bubble bg-input px-4 py-2 text-body text-fg placeholder:text-fg-tertiary focus:outline-2 focus:outline-accent"
        />
        <button
          type="submit"
          aria-label="Send"
          title="Send"
          disabled={!canSend}
          className="inline-flex size-button shrink-0 items-center justify-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-hover disabled:bg-input disabled:text-fg-tertiary"
        >
          <SendIcon className="size-icon" />
        </button>
      </div>
    </form>
  );
}
