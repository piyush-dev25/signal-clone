"use client";

import { createContext, useContext } from "react";
import type { User } from "@/lib/api";

export type Session = { me: User; logout: () => void };

export const SessionContext = createContext<Session | null>(null);

/** The signed-in user; only usable below the (app) layout's auth gate. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside the (app) layout");
  return session;
}
