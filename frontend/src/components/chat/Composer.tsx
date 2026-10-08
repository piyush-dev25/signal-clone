"use client";

import { type FormEvent, type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { SendIcon } from "@/components/icons";

const MAX_LENGTH = 4000; // matches the backend limit

export function Composer({ onSend }: { onSend: (body: string) => void }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0;

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
    onSend(body);
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
      className="flex shrink-0 items-end gap-2 border-t border-border bg-surface px-pane-x py-2"
    >
      <textarea
        ref={inputRef}
        rows={1}
        autoFocus
        aria-label="Message"
        placeholder="Message"
        maxLength={MAX_LENGTH}
        value={text}
        onChange={(e) => setText(e.target.value)}
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
    </form>
  );
}
