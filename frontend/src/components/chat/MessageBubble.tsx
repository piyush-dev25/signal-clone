"use client";

import { type MouseEvent, type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { MessageStatus } from "@/components/chat/MessageStatus";
import { ReactionChips, ReactionPicker } from "@/components/chat/Reactions";
import { CopyIcon, ReplyIcon, SmileIcon } from "@/components/icons";
import type { Member } from "@/lib/api";
import { colorIndex } from "@/lib/avatars";
import { memberName } from "@/lib/conversations";
import { myReaction } from "@/lib/reactions";
import type { ChatMessage, MessageStatus as Status } from "@/lib/receipts";
import { messageTime } from "@/lib/time";

type Props = {
  message: ChatMessage;
  mine: boolean;
  /** Position in a run of consecutive messages from one sender (shapes corners, avatar, name). */
  firstInRun: boolean;
  lastInRun: boolean;
  isGroup: boolean;
  sender: Member | undefined;
  /** Name for the quoted message's author ("You" or how the viewer sees them). */
  quotedAuthor: string | null;
  status: Status | null;
  /** Briefly ringed after jumping here from a quote. */
  highlighted: boolean;
  onRetry: () => void;
  onReply: () => void;
  onCopy: () => void;
  onQuoteClick: (messageId: number) => void;
  meId: number;
  /** Who reacted, for chip tooltips ("You", the viewer's name for them, or a fallback). */
  nameOf: (userId: number) => string;
  /** Set my reaction to `emoji`, or remove it if it's already mine. */
  onReact: (emoji: string) => void;
  /** Touch device: actions live in a row beneath the message, revealed by tapping the bubble. */
  coarse: boolean;
  actionsOpen: boolean;
  onToggleActions: () => void;
};

/** Picker opens downward when the message is this close to the top of the scroll area. */
const PICKER_FLIP_PX = 56;

/** Corner shape: the corners facing a neighbouring bubble of the same run are tightened. */
function corners(mine: boolean, first: boolean, last: boolean): string {
  if (first && last) return "";
  if (mine) return first ? "rounded-br-bubble-joined" : last ? "rounded-tr-bubble-joined" : "rounded-r-bubble-joined";
  return first ? "rounded-bl-bubble-joined" : last ? "rounded-tl-bubble-joined" : "rounded-l-bubble-joined";
}

type ActionButtonProps = {
  label: string;
  onClick: () => void;
  children: ReactNode;
  buttonRef?: Ref<HTMLButtonElement>;
  /** For a button that opens a menu (the reaction picker). */
  expanded?: boolean;
  /** Bigger hit area for the touch row. */
  touch?: boolean;
};

function ActionButton({ label, onClick, children, buttonRef, expanded, touch = false }: ActionButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-haspopup={expanded === undefined ? undefined : "menu"}
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent ${
        touch ? "size-touch-action" : "size-message-action"
      }`}
    >
      {children}
    </button>
  );
}

export function MessageBubble({
  message,
  mine,
  firstInRun,
  lastInRun,
  isGroup,
  sender,
  quotedAuthor,
  status,
  highlighted,
  onRetry,
  onReply,
  onCopy,
  onQuoteClick,
  meId,
  nameOf,
  onReact,
  coarse,
  actionsOpen,
  onToggleActions,
}: Props) {
  const [picker, setPicker] = useState<"above" | "below" | null>(null);
  const reactButton = useRef<HTMLButtonElement>(null);
  const actionRow = useRef<HTMLDivElement>(null);
  const showAvatarColumn = isGroup && !mine;
  const showMeta = lastInRun || message.local !== undefined;
  const reply = message.reply_to;
  // Only saved messages can be quoted or reacted to (the server needs their id); unsent ones can
  // still be copied.
  const canReply = message.id !== 0 && message.local === undefined;
  const mineReaction = myReaction(message.reactions, meId);
  const rowVisible = actionsOpen || picker !== null;

  // A freshly revealed row (e.g. under the last message) must not hide behind the composer.
  useEffect(() => {
    if (actionsOpen) actionRow.current?.scrollIntoView({ block: "nearest" });
  }, [actionsOpen]);

  /** Touch: tapping the bubble toggles its action row, except taps on its own controls (quote)
   * and taps that end a text selection. */
  function onBubbleClick(event: MouseEvent<HTMLDivElement>) {
    if (!coarse || !canReply) return;
    if ((event.target as HTMLElement).closest("button, a, [role='menu']")) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    onToggleActions();
  }

  function togglePicker() {
    if (picker) {
      setPicker(null);
      return;
    }
    // Open downward near the top of the list so the picker isn't clipped by the scroll area.
    const button = reactButton.current;
    const scroller = button?.closest("[data-message-scroller]");
    const gap = button && scroller ? button.getBoundingClientRect().top - scroller.getBoundingClientRect().top : Infinity;
    setPicker(gap < PICKER_FLIP_PX ? "below" : "above");
  }

  return (
    <div
      data-message-id={message.id || undefined}
      className={`group flex px-pane-x ${mine ? "justify-end" : "justify-start"} ${firstInRun ? "mt-2" : "mt-0.5"}`}
    >
      {showAvatarColumn && (
        <div className="mr-2 flex w-avatar-message shrink-0 items-end">
          {lastInRun && sender && (
            <Avatar colorId={sender.user_id} name={sender.display_name} avatar={sender.avatar} size="message" />
          )}
        </div>
      )}
      <div
        className={`relative flex max-w-[min(var(--spacing-bubble-max),var(--spacing-bubble-cap))] min-w-0 items-center gap-1 ${
          mine ? "flex-row-reverse" : ""
        }`}
      >
        {picker && !coarse && (
          // Anchored to the bubble's outer edge so it extends over the bubble, never off-screen.
          <ReactionPicker
            current={mineReaction}
            placement={picker}
            align={mine ? "end" : "start"}
            triggerRef={reactButton}
            onPick={(emoji) => {
              setPicker(null);
              onReact(emoji);
            }}
            onClose={() => setPicker(null)}
          />
        )}
        <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
          <div
            onClick={onBubbleClick}
            className={`max-w-full rounded-bubble px-3 py-1.5 transition-shadow duration-300 ${corners(mine, firstInRun, lastInRun)} ${
              mine ? "bg-bubble-out text-on-bubble-out" : "bg-bubble-in text-on-bubble-in"
            } ${message.local === "sending" ? "opacity-80" : ""} ${highlighted ? "ring-4 ring-highlight" : ""}`}
          >
            {/* Name color: per-theme --sg-sender-N token (>= 4.5:1 on the incoming bubble). */}
            {isGroup && !mine && firstInRun && sender && (
              <p className="text-caption font-semibold" style={{ color: `var(--sg-sender-${colorIndex(sender.user_id)})` }}>
                {memberName(sender)}
              </p>
            )}
            {reply && (
              <button
                type="button"
                onClick={() => onQuoteClick(reply.id)}
                aria-label={`Go to the message from ${quotedAuthor}`}
                className={`my-1 block w-full rounded-quote border-l-4 px-2 py-1 text-left ${
                  mine ? "border-quote-bar-out bg-quote-out" : "border-quote-bar-in bg-quote-in"
                }`}
              >
                <span className="block text-caption font-semibold">{quotedAuthor}</span>
                <span className="line-clamp-2 text-body-sm wrap-break-word whitespace-pre-wrap">{reply.body ?? "Message"}</span>
              </button>
            )}
            <p className="text-body wrap-break-word whitespace-pre-wrap">{message.body}</p>
            {showMeta && (
              <div
                className={`mt-0.5 flex items-center justify-end gap-1 text-caption ${mine ? "text-meta-out" : "text-meta-in"}`}
              >
                <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
                {status && <MessageStatus status={status} />}
              </div>
            )}
          </div>
          <ReactionChips reactions={message.reactions} meId={meId} nameOf={nameOf} mine={mine} onToggle={onReact} />
          {coarse && canReply && (
            // Touch: the actions sit beneath the message. When hidden the row stays in the DOM
            // (screen-reader only) so keyboard and assistive-tech users can still reach it.
            <div
              ref={actionRow}
              className={
                rowVisible
                  ? "relative mt-1.5 flex gap-1 rounded-full bg-input p-1"
                  : "sr-only focus-within:not-sr-only focus-within:mt-1.5 focus-within:flex focus-within:gap-1 focus-within:rounded-full focus-within:bg-input focus-within:p-1"
              }
            >
              {picker && (
                <ReactionPicker
                  current={mineReaction}
                  placement={picker}
                  align={mine ? "end" : "start"}
                  triggerRef={reactButton}
                  onPick={(emoji) => {
                    setPicker(null);
                    onReact(emoji);
                    if (actionsOpen) onToggleActions(); // done: hide the row, like Reply / Copy
                  }}
                  onClose={() => setPicker(null)}
                />
              )}
              <ActionButton label="React" onClick={togglePicker} buttonRef={reactButton} expanded={picker !== null} touch>
                <SmileIcon className="size-5" />
              </ActionButton>
              <ActionButton label="Reply" onClick={onReply} touch>
                <ReplyIcon className="size-5" />
              </ActionButton>
              <ActionButton label="Copy text" onClick={onCopy} touch>
                <CopyIcon className="size-5" />
              </ActionButton>
            </div>
          )}
          {message.local === "failed" && (
            <button type="button" onClick={onRetry} className="mt-1 text-caption font-medium text-danger hover:underline">
              Not sent. Tap to retry
            </button>
          )}
        </div>
        {/* Mouse/keyboard: hover or focus reveals the actions beside the bubble. (Touch devices use
            the tap-to-reveal row beneath the message instead.) */}
        {!coarse && (
          <div
            className={`flex shrink-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 ${
              picker ? "opacity-100" : "opacity-0"
            }`}
          >
            {canReply && (
              <ActionButton label="React" onClick={togglePicker} buttonRef={reactButton} expanded={picker !== null}>
                <SmileIcon className="size-4" />
              </ActionButton>
            )}
            {canReply && (
              <ActionButton label="Reply" onClick={onReply}>
                <ReplyIcon className="size-4" />
              </ActionButton>
            )}
            <ActionButton label="Copy text" onClick={onCopy}>
              <CopyIcon className="size-4" />
            </ActionButton>
          </div>
        )}
      </div>
    </div>
  );
}
