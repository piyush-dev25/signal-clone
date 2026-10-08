import { Suspense } from "react";
import { ChatView } from "@/components/chat/ChatView";

// Client-rendered behind the auth gate in the (app) layout; nothing to prerender as an instant shell.
export const instant = false;

export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => (
        <ChatView id={id} />
      ))}
    </Suspense>
  );
}
