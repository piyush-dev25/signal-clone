const RESEND_MS = 3_000; // re-announce "typing" at most this often (receivers expire it after ~5s)
const IDLE_MS = 1_500; // no keystrokes for this long counts as stopped

/**
 * Turns keystrokes into a sparse stream of typing true/false events:
 * true at most every 3s while typing; false once the input is empty, after 1.5s idle, or on stop().
 * false is only sent if true was.
 */
export function createTypingNotifier(send: (isTyping: boolean) => void) {
  let announcedAt = 0; // 0 = we have not told anyone we're typing
  let idle: ReturnType<typeof setTimeout> | undefined;

  function stop() {
    clearTimeout(idle);
    if (announcedAt) {
      announcedAt = 0;
      send(false);
    }
  }

  function input(value: string) {
    if (!value.trim()) {
      stop();
      return;
    }
    const now = Date.now();
    if (now - announcedAt >= RESEND_MS) {
      announcedAt = now;
      send(true);
    }
    clearTimeout(idle);
    idle = setTimeout(stop, IDLE_MS);
  }

  return { input, stop };
}
