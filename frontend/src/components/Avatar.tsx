import { colorForUser, initials, presetFor } from "@/lib/avatars";

type Props = {
  userId: number;
  name: string;
  avatar: string | null;
  size?: number;
};

export function Avatar({ userId, name, avatar, size = 40 }: Props) {
  const preset = presetFor(avatar);
  const color = colorForUser(userId);
  const letters = initials(name);

  return (
    <div
      aria-hidden
      className="flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium"
      style={{
        width: size,
        height: size,
        background: preset ? preset.bg : color.bg,
        color: color.fg,
        fontSize: preset ? size * 0.55 : size * 0.4,
      }}
    >
      {preset ? (
        preset.emoji
      ) : letters ? (
        letters
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="currentColor">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
        </svg>
      )}
    </div>
  );
}
