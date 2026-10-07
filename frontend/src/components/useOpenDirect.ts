"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, openDirect } from "@/lib/api";
import { useAppStore } from "@/store/app";

/** Get-or-create the direct chat with a user, put it in the store and open it. */
export function useOpenDirect() {
  const router = useRouter();
  const upsertConversation = useAppStore((s) => s.upsertConversation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open(userId: number): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const conversation = await openDirect(userId);
      upsertConversation(conversation);
      router.push(`/chat/${conversation.id}`);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open the chat");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { open, pending, error };
}
