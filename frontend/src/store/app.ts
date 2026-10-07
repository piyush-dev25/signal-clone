import { create } from "zustand";
import { ApiError, type Contact, type Conversation, listContacts, listConversations } from "@/lib/api";
import { sortContacts, sortConversations } from "@/lib/conversations";

type Status = "idle" | "loading" | "ready" | "error";

type AppState = {
  status: Status;
  error: string | null;
  conversations: Conversation[];
  contacts: Contact[];
  activeConversationId: number | null;

  /** Fetch conversations and contacts (REST loads the store; the socket patches it from Phase 3). */
  load: () => Promise<void>;
  upsertConversation: (conversation: Conversation) => void;
  addContact: (contact: Contact) => void;
  setActiveConversation: (id: number | null) => void;
};

export const useAppStore = create<AppState>()((set) => ({
  status: "idle",
  error: null,
  conversations: [],
  contacts: [],
  activeConversationId: null,

  load: async () => {
    set({ status: "loading", error: null });
    try {
      const [conversations, contacts] = await Promise.all([listConversations(), listContacts()]);
      set({ status: "ready", conversations: sortConversations(conversations), contacts: sortContacts(contacts) });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // api.ts already redirects
      set({ status: "error", error: err instanceof ApiError ? err.message : "Couldn't load your chats" });
    }
  },

  upsertConversation: (conversation) =>
    set((state) => ({
      conversations: sortConversations([
        ...state.conversations.filter((c) => c.id !== conversation.id),
        conversation,
      ]),
    })),

  addContact: (contact) =>
    set((state) => ({
      contacts: sortContacts([...state.contacts.filter((c) => c.id !== contact.id), contact]),
    })),

  setActiveConversation: (id) => set({ activeConversationId: id }),
}));
