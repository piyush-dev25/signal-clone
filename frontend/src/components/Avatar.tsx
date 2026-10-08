import { GroupGlyph, PersonGlyph } from "@/components/icons";
import type { Conversation } from "@/lib/api";
import { colorForUser, initials, presetFor } from "@/lib/avatars";
import { conversationTitle, otherMember } from "@/lib/conversations";

/** Sizes map to the --spacing-avatar-* tokens in globals.css. */
export type AvatarSize = "list" | "contact" | "header" | "profile" | "picker" | "hero" | "message";

type Props = {
  /** Picks the default color: user id for people, conversation id for groups. */
  colorId: number;
  name: string;
  avatar: string | null;
  size?: AvatarSize;
  group?: boolean;
};

export function Avatar({ colorId, name, avatar, size = "list", group = false }: Props) {
  const preset = presetFor(avatar);
  const color = colorForUser(colorId);
  const letters = group ? "" : initials(name);
  const dimension = `var(--spacing-avatar-${size})`;

  return (
    <div
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium"
      style={{
        width: dimension,
        height: dimension,
        background: preset ? preset.bg : color.bg,
        color: color.fg,
        fontSize: `calc(${dimension} * ${preset ? 0.55 : 0.4})`,
      }}
    >
      {preset ? (
        preset.emoji
      ) : letters ? (
        letters
      ) : group ? (
        <GroupGlyph width="60%" height="60%" />
      ) : (
        <PersonGlyph width="55%" height="55%" />
      )}
    </div>
  );
}

/** Group avatar for groups, the other person's avatar for direct chats. */
export function ConversationAvatar({
  conversation,
  meId,
  size = "list",
}: {
  conversation: Conversation;
  meId: number;
  size?: AvatarSize;
}) {
  if (conversation.type === "group") {
    return (
      <Avatar
        colorId={conversation.id}
        name={conversation.name ?? ""}
        avatar={conversation.avatar}
        size={size}
        group
      />
    );
  }
  const other = otherMember(conversation, meId);
  return (
    <Avatar
      colorId={other?.user_id ?? conversation.id}
      name={conversationTitle(conversation, meId)}
      avatar={other?.avatar ?? null}
      size={size}
    />
  );
}
