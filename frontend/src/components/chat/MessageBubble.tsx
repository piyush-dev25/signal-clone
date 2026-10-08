import { Avatar } from "@/components/Avatar";
import { MessageStatus } from "@/components/chat/MessageStatus";
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
  onRetry: () => void;
};

/** Corner shape: the corners facing a neighbouring bubble of the same run are tightened. */
function corners(mine: boolean, first: boolean, last: boolean): string {
  if (first && last) return "";
  if (mine) return first ? "rounded-br-bubble-joined" : last ? "rounded-tr-bubble-joined" : "rounded-r-bubble-joined";
  return first ? "rounded-bl-bubble-joined" : last ? "rounded-tl-bubble-joined" : "rounded-l-bubble-joined";
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
  onRetry,
}: Props) {
  const showAvatarColumn = isGroup && !mine;
  const showMeta = lastInRun || message.local !== undefined;
  const reply = message.reply_to;

  return (
    <div className={`flex px-pane-x ${mine ? "justify-end" : "justify-start"} ${firstInRun ? "mt-2" : "mt-0.5"}`}>
      {showAvatarColumn && (
        <div className="mr-2 flex w-avatar-message shrink-0 items-end">
          {lastInRun && sender && (
            <Avatar colorId={sender.user_id} name={sender.display_name} avatar={sender.avatar} size="message" />
          )}
        </div>
      )}
      <div className={`flex max-w-[min(var(--spacing-bubble-max),var(--spacing-bubble-cap))] min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
        <div
          className={`max-w-full rounded-bubble px-3 py-1.5 ${corners(mine, firstInRun, lastInRun)} ${
            mine ? "bg-bubble-out text-on-bubble-out" : "bg-bubble-in text-on-bubble-in"
          } ${message.local === "sending" ? "opacity-80" : ""}`}
        >
          {/* Name color: per-theme --sg-sender-N token (>= 4.5:1 on the incoming bubble). */}
          {isGroup && !mine && firstInRun && sender && (
            <p className="text-caption font-semibold" style={{ color: `var(--sg-sender-${colorIndex(sender.user_id)})` }}>
              {memberName(sender)}
            </p>
          )}
          {reply && (
            <div
              className={`my-1 rounded-quote border-l-4 px-2 py-1 ${
                mine ? "border-quote-bar-out bg-quote-out" : "border-quote-bar-in bg-quote-in"
              }`}
            >
              <p className="text-caption font-semibold">{quotedAuthor}</p>
              <p className="line-clamp-2 text-body-sm break-words whitespace-pre-wrap">{reply.body ?? "Message"}</p>
            </div>
          )}
          <p className="text-body break-words whitespace-pre-wrap">{message.body}</p>
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
    </div>
  );
}
