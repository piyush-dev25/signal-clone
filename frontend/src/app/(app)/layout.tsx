"use client";

// Auth gate, the app's single WebSocket, the store load and the sidebar. Living in the (app)
// layout means all of them survive switching between chats.
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { SessionContext } from "@/components/session";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui";
import { useShortcuts } from "@/components/useShortcuts";
import { ApiError, type User, getMe } from "@/lib/api";
import { clearToken, getToken, redirectToLogin } from "@/lib/auth";
import { type RealtimeConnection, connectRealtime } from "@/lib/ws";
import { useAppStore } from "@/store/app";
import { toast } from "@/store/toasts";

type GateState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; me: User };

export default function AppLayout({ children }: LayoutProps<"/">) {
  const router = useRouter();
  const [state, setState] = useState<GateState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const socketRef = useRef<RealtimeConnection | null>(null);

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
        const store = useAppStore.getState();
        store.load();
        // Every (re)connect also resyncs: it covers anything sent while we were disconnected,
        // including the gap between the REST load above and the first connect.
        let lost = false; // one "connection lost" toast per drop, "back online" when it returns
        socketRef.current = connectRealtime(token, {
          onOpen: () => {
            if (lost) {
              lost = false;
              toast("Back online");
            }
            void store.resync();
          },
          onDisconnect: () => {
            if (lost) return;
            lost = true;
            toast("Connection lost. Reconnecting…");
          },
          onEvent: store.handleEvent,
        });
        store.setSession(me.id, socketRef.current);
        setState({ status: "ready", me });
      })
      .catch((err: unknown) => {
        // 401 is handled in api.ts (token cleared, redirected to /login).
        if (cancelled || (err instanceof ApiError && err.status === 401)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Something went wrong" });
      });
    return () => {
      cancelled = true;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [router, attempt]);

  function logout() {
    clearToken();
    socketRef.current?.close();
    socketRef.current = null;
    // Full page load (like the 401 path) so no client state, e.g. the login step, survives.
    redirectToLogin();
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <p className="text-body text-fg-secondary">{state.message}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (state.status === "loading") {
    return <div className="flex flex-1 items-center justify-center text-body-sm text-fg-tertiary">Loading…</div>;
  }

  const { me } = state;
  return (
    <SessionContext.Provider value={{ me, logout, setMe: (user) => setState({ status: "ready", me: user }) }}>
      {/* Reading the URL needs a Suspense boundary under Cache Components. */}
      <Suspense fallback={null}>
        <Panes>{children}</Panes>
      </Suspense>
    </SessionContext.Provider>
  );
}

/** Two panes from md up; below md one at a time: the list on "/", the chat on "/chat/[id]". */
function Panes({ children }: { children: ReactNode }) {
  const inChat = usePathname().startsWith("/chat/");
  useShortcuts();
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface text-fg">
      <Sidebar className={`${inChat ? "hidden md:flex" : "flex"} w-full md:w-sidebar`} />
      <main className={`${inChat ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>{children}</main>
      <Toaster />
    </div>
  );
}
