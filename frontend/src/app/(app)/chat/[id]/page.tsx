import { Suspense } from "react";

export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Suspense fallback={null}>
        {params.then(({ id }) => (
          <p className="text-sm opacity-70">Chat {id} (Phase 3)</p>
        ))}
      </Suspense>
    </main>
  );
}
