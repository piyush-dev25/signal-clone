import type { ServerEvent } from "@/lib/api";
import { clearToken, redirectToLogin } from "@/lib/auth";
import { WS_URL } from "@/lib/config";

export const WS_UNAUTHORIZED = 4401;

const HEARTBEAT_MS = 25_000;
/** A connect attempt can hang instead of failing (seen while the backend restarts); give up and retry. */
const CONNECT_TIMEOUT_MS = 10_000;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

type Handlers = {
  /** Every successful (re)connect: the caller refetches whatever it may have missed. */
  onOpen: () => void;
  onEvent: (event: ServerEvent) => void;
  /** An open connection dropped (not called for failed reconnect attempts, close(), or 4401). */
  onDisconnect?: () => void;
};

export type RealtimeConnection = {
  /** Send a client event; returns false (and drops it) when not connected. */
  send: (type: string, data: Record<string, unknown>) => boolean;
  close: () => void;
};

/**
 * The app's one socket. Reconnects with exponential backoff (0.5s doubling, capped at 15s, ±20%
 * jitter) and pings every 25s. A 4401 close (bad token / deleted user) ends the session instead.
 */
export function connectRealtime(token: string, handlers: Handlers): RealtimeConnection {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let connectTimeout: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    if (stopped) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
    socket = ws;
    connectTimeout = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) abandon(ws);
    }, CONNECT_TIMEOUT_MS);

    ws.onopen = () => {
      clearTimeout(connectTimeout);
      attempt = 0;
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping", data: {} }));
      }, HEARTBEAT_MS);
      handlers.onOpen();
    };

    ws.onmessage = (message) => {
      let event: unknown;
      try {
        event = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (event && typeof (event as { type?: unknown }).type === "string") handlers.onEvent(event as ServerEvent);
    };

    ws.onclose = (event) => {
      if (socket !== ws) return; // an abandoned attempt; its replacement is already scheduled
      if (event.code === WS_UNAUTHORIZED) {
        stopped = true;
        cleanup();
        clearToken();
        redirectToLogin();
        return;
      }
      const wasOpen = heartbeat !== undefined; // the heartbeat only starts once open
      abandon(ws);
      if (wasOpen) handlers.onDisconnect?.();
    };
  }

  function cleanup() {
    clearTimeout(connectTimeout);
    clearInterval(heartbeat);
    heartbeat = undefined;
    socket = null;
  }

  /** Drop this socket and schedule the next attempt with backoff. */
  function abandon(ws: WebSocket) {
    if (socket !== ws) return;
    cleanup();
    ws.onopen = ws.onmessage = ws.onclose = null;
    if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN) ws.close();
    if (stopped) return;
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt) * (0.8 + Math.random() * 0.4);
    attempt += 1;
    retry = setTimeout(connect, delay);
  }

  // Coming back online: don't sit out the rest of a long backoff.
  function onOnline() {
    if (stopped || socket) return;
    clearTimeout(retry);
    attempt = 0;
    connect();
  }

  window.addEventListener("online", onOnline);
  connect();

  return {
    send(type, data) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify({ type, data }));
      return true;
    },
    close() {
      stopped = true;
      window.removeEventListener("online", onOnline);
      clearTimeout(retry);
      const ws = socket;
      cleanup();
      ws?.close(1000);
    },
  };
}
