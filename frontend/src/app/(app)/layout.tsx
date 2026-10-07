"use client";

// Auth gate + the app's single WebSocket. Living in the (app) layout means the socket
// survives switching between chats. Store and sidebar join it in Phase 2.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { SessionContext } from "@/components/session";
import { ApiError, type User, getMe } from "@/lib/api";
import { clearToken, getToken, redirectToLogin } from "@/lib/auth";
import { openSocket } from "@/lib/ws";

type GateState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; me: User };

export default function AppLayout({ children }: LayoutProps<"/">) {
  const router = useRouter();
  const [state, setState] = useState<GateState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    getMe()
      .then((me) => {
        if (cancelled) return;
        if (!me.display_name) {
          router.replace("/login"); // resumes onboarding
          return;
        }
        socketRef.current = openSocket(token);
        setState({ status: "ready", me });
      })
      .catch((err: unknown) => {
        // 401 is handled in api.ts (token cleared, redirected to /login).
        if (cancelled || (err instanceof ApiError && err.status === 401)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Something went wrong" });
      });
    return () => {
      cancelled = true;
      socketRef.current?.close(1000);
      socketRef.current = null;
    };
  }, [router, attempt]);

  function logout() {
    clearToken();
    socketRef.current?.close(1000);
    socketRef.current = null;
    // Full page load (like the 401 path) so no client state, e.g. the login step, survives.
    redirectToLogin();
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm">
        <p className="text-gray-600">{state.message}</p>
        <button
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
          className="rounded-lg border border-gray-300 px-4 py-1.5 hover:bg-gray-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (state.status === "loading") {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  const { me } = state;
  return (
    <SessionContext.Provider value={{ me, logout }}>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
          <Avatar userId={me.id} name={me.display_name} avatar={me.avatar} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{me.display_name}</p>
            <p className="truncate text-xs text-gray-500">{me.phone}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-lg border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Log out
          </button>
        </header>
        <div className="flex flex-1">{children}</div>
      </div>
    </SessionContext.Provider>
  );
}
