import { clearToken, redirectToLogin } from "@/lib/auth";
import { WS_URL } from "@/lib/config";

export const WS_UNAUTHORIZED = 4401;

/** Opens the app socket. A 4401 close (bad token / deleted user) ends the session. */
export function openSocket(token: string): WebSocket {
  const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
  socket.addEventListener("close", (event) => {
    if (event.code === WS_UNAUTHORIZED) {
      clearToken();
      redirectToLogin();
    }
  });
  return socket;
}
