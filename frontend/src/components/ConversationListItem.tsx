import Link from "next/link";
import { ConversationAvatar } from "@/components/Avatar";
import type { Conversation } from "@/lib/api";
import { conversationTitle, previewText } from "@/lib/conversations";
import { listTime } from "@/lib/time";

type Props = {
  conversation: Conversation;
  meId: number;
  selected: boolean;
  onSelect?: () => void;
};

/** Signal list row: avatar | name + time / preview + unread badge. */
export function ConversationListItem({ conversation, meId, selected, onSelect }: Props) {
  const unread = conversation.unread_count;
  const time = conversation.last_message?.created_at ?? null;

  return (
    <Link
      href={`/chat/${conversation.id}`}
      onClick={onSelect}
      aria-current={selected ? "page" : undefined}
      className={`mx-list-inset flex h-list-item items-center gap-3 rounded-list-item px-row-x transition-colors ${
        selected ? "bg-selected" : "hover:bg-hover"
      }`}
    >
      <ConversationAvatar conversation={conversation} meId={meId} size="list" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="flex-1 truncate text-body font-semibold text-fg">
            {conversationTitle(conversation, meId)}
          </span>
          {time && (
            <time dateTime={time} className="shrink-0 text-caption text-fg-secondary">
              {listTime(time)}
            </time>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className={`flex-1 truncate text-body-sm ${unread ? "font-medium text-fg" : "text-fg-secondary"}`}>
            {previewText(conversation, meId)}
          </p>
          {unread > 0 && (
            <span
              aria-label={`${unread} unread`}
              className="inline-flex h-badge min-w-badge shrink-0 items-center justify-center rounded-full bg-badge px-1.5 text-badge font-semibold text-on-badge"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
