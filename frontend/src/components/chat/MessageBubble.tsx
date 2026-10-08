import type { ReactNode } from "react";
import { Avatar } from "@/components/Avatar";
import { MessageStatus } from "@/components/chat/MessageStatus";
import { CopyIcon, ReplyIcon } from "@/components/icons";
import type { Member } from "@/lib/api";
import { colorIndex } from "@/lib/avatars";
import { memberName } from "@/lib/conversations";
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
};

/** Corner shape: the corners facing a neighbouring bubble of the same run are tightened. */
function corners(mine: boolean, first: boolean, last: boolean): string {
  if (first && last) return "";
  if (mine) return first ? "rounded-br-bubble-joined" : last ? "rounded-tr-bubble-joined" : "rounded-r-bubble-joined";
  return first ? "rounded-bl-bubble-joined" : last ? "rounded-tl-bubble-joined" : "rounded-l-bubble-joined";
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-message-action items-center justify-center rounded-full text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
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
}: Props) {
  const showAvatarColumn = isGroup && !mine;
  const showMeta = lastInRun || message.local !== undefined;
  const reply = message.reply_to;
  // Only saved messages can be quoted (the server needs their id); unsent ones can still be copied.
  const canReply = message.id !== 0 && message.local === undefined;

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
        className={`flex max-w-[min(var(--spacing-bubble-max),var(--spacing-bubble-cap))] min-w-0 items-center gap-1 ${
          mine ? "flex-row-reverse" : ""
        }`}
      >
        <div className={`flex min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
          <div
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
          {message.local === "failed" && (
            <button type="button" onClick={onRetry} className="mt-1 text-caption font-medium text-danger hover:underline">
              Not sent. Tap to retry
            </button>
          )}
        </div>
        {/* Hover/focus reveals the actions with a mouse; touch screens always show them. */}
        <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          {canReply && (
            <ActionButton label="Reply" onClick={onReply}>
              <ReplyIcon className="size-4" />
            </ActionButton>
          )}
          <ActionButton label="Copy text" onClick={onCopy}>
            <CopyIcon className="size-4" />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
