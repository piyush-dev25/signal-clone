import { Suspense } from "react";
import { ChatView } from "@/components/ChatView";

export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <Suspense fallback={null}>
      {params.then(({ id }) => (
        <ChatView id={id} />
      ))}
    </Suspense>
  );
}
