// Phase 1+: auth gate, WebSocket connection, Zustand store and sidebar live here,
// so the socket survives switching between chats.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <div className="flex flex-1">{children}</div>;
}
