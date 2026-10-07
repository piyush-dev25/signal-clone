// Initials-avatar colors: light tint background with a saturated foreground.
const AVATAR_COLORS = [
  { bg: "#E3E3FE", fg: "#3838F5" },
  { bg: "#DDE7FC", fg: "#1251D3" },
  { bg: "#D8E8F0", fg: "#086DA0" },
  { bg: "#CDE4CD", fg: "#067906" },
  { bg: "#EAE0FD", fg: "#661AFF" },
  { bg: "#F5E3FE", fg: "#9F00F0" },
  { bg: "#F6D8EC", fg: "#B8057C" },
  { bg: "#F5D7D7", fg: "#BE0404" },
  { bg: "#FEF5D0", fg: "#836B01" },
  { bg: "#EAE6D5", fg: "#7D6F40" },
  { bg: "#D2D2DC", fg: "#4F4F6D" },
  { bg: "#D7D7D9", fg: "#5C5C5C" },
];

export function colorForUser(userId: number) {
  return AVATAR_COLORS[Math.abs(userId) % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : "";
  return (first + last).toUpperCase();
}

// Must match PRESET_AVATARS in backend/app/services/users.py.
export const PRESETS: Record<string, { emoji: string; bg: string }> = {
  cat: { emoji: "🐱", bg: "#FEF5D0" },
  dog: { emoji: "🐶", bg: "#EAE6D5" },
  fox: { emoji: "🦊", bg: "#F5D7D7" },
  panda: { emoji: "🐼", bg: "#D7D7D9" },
  owl: { emoji: "🦉", bg: "#EAE0FD" },
  octopus: { emoji: "🐙", bg: "#F6D8EC" },
  rocket: { emoji: "🚀", bg: "#DDE7FC" },
  sunflower: { emoji: "🌻", bg: "#CDE4CD" },
};

export const PRESET_KEYS = Object.keys(PRESETS);

export function presetFor(avatar: string | null) {
  if (!avatar?.startsWith("preset:")) return null;
  return PRESETS[avatar.slice("preset:".length)] ?? null;
}
