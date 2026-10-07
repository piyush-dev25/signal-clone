const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Conversation list timestamp: "Now", "5m", "3:45 PM", "Tue", "Mar 4", "Mar 4, 2025". */
export function listTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "Now";
  if (diff < 60 * MINUTE) return `${Math.floor(diff / MINUTE)}m`;
  if (startOfDay(date) === startOfDay(now)) return clock(date);
  if (startOfDay(now) - startOfDay(date) < 7 * DAY) {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Chat header subtitle for a direct chat; null when the person has never been seen. */
export function lastSeenText(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return "last seen just now";
  if (diff < 60 * MINUTE) {
    const minutes = Math.floor(diff / MINUTE);
    return `last seen ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days === 0) return `last seen today at ${clock(date)}`;
  if (days === 1) return `last seen yesterday at ${clock(date)}`;
  return `last seen ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
