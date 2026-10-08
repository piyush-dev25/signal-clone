import { create } from "zustand";
import {
  ApiError,
  type Contact,
  type Conversation,
  MESSAGE_PAGE_SIZE,
  type Message,
  type ReceiptUpdate,
  type ServerEvent,
  listContacts,
  listConversations,
  listMessages,
  postMessage,
} from "@/lib/api";
import { sortContacts, sortConversations } from "@/lib/conversations";
import { newClientId } from "@/lib/ids";
import { isNewer, mergeMessages } from "@/lib/messages";
import type { ChatMessage } from "@/lib/receipts";

type Status = "idle" | "loading" | "ready" | "error";

export type ChatState = {
  messages: ChatMessage[];
  /** False until the latest page has loaded once. */
  loaded: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  error: string | null;
};

const EMPTY_CHAT: ChatState = { messages: [], loaded: false, hasMore: false, loadingOlder: false, error: null };

type AppState = {
  status: Status;
  error: string | null;
  conversations: Conversation[];
  contacts: Contact[];
  activeConversationId: number | null;
  messagesByConversation: Record<number, ChatState>;

  /** First load after login (shows loading/error states in the sidebar). */
  load: () => Promise<void>;
  /** Silent catch-up after every socket (re)connect: conversations + the open chat's latest page. */
  resync: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  upsertConversation: (conversation: Conversation) => void;
  addContact: (contact: Contact) => void;
  setActiveConversation: (id: number | null) => void;

  loadLatest: (conversationId: number) => Promise<void>;
  loadOlder: (conversationId: number) => Promise<void>;
  sendMessage: (conversationId: number, body: string, meId: number) => void;
  retryMessage: (conversationId: number, clientId: string) => void;
  receiveMessage: (message: ChatMessage) => void;
  applyReceipt: (update: ReceiptUpdate) => void;
  handleEvent: (event: ServerEvent) => void;
};

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

let conversationsInFlight: Promise<void> | null = null;

export const useAppStore = create<AppState>()((set, get) => {
  function patchChat(conversationId: number, patch: (chat: ChatState) => Partial<ChatState>) {
    set((state) => {
      const chat = state.messagesByConversation[conversationId] ?? EMPTY_CHAT;
      return {
        messagesByConversation: { ...state.messagesByConversation, [conversationId]: { ...chat, ...patch(chat) } },
      };
    });
  }

  async function deliver(message: ChatMessage) {
    try {
      const saved = await postMessage(message.conversation_id, {
        client_id: message.client_id!,
        body: message.body ?? "",
        reply_to_id: message.reply_to?.id ?? null,
      });
      get().receiveMessage(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return; // redirecting to /login
      patchChat(message.conversation_id, (chat) => ({
        // Only if it's still unsaved: message_new may have delivered the saved copy meanwhile.
        messages: chat.messages.map((m) =>
          m.id === 0 && m.client_id === message.client_id ? { ...m, local: "failed" as const } : m,
        ),
      }));
    }
  }

  return {
    status: "idle",
    error: null,
    conversations: [],
    contacts: [],
    activeConversationId: null,
    messagesByConversation: {},

    load: async () => {
      set({ status: "loading", error: null });
      try {
        const [conversations, contacts] = await Promise.all([listConversations(), listContacts()]);
        set({ status: "ready", conversations: sortConversations(conversations), contacts: sortContacts(contacts) });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return; // api.ts already redirects
        set({ status: "error", error: errorText(err, "Couldn't load your chats") });
      }
    },

    refreshConversations: () => {
      // Coalesce bursts (e.g. several messages for a chat we don't know yet).
      conversationsInFlight ??= listConversations()
        .then((conversations) => set({ status: "ready", error: null, conversations: sortConversations(conversations) }))
        .catch(() => {}) // keep what we have; the next reconnect retries
        .finally(() => {
          conversationsInFlight = null;
        });
      return conversationsInFlight;
    },

    resync: async () => {
      const active = get().activeConversationId;
      // Other chats may have missed messages while we were away: drop their cache (keeping
      // unsent messages) so they reload when opened.
      set((state) => ({
        messagesByConversation: Object.fromEntries(
          Object.entries(state.messagesByConversation).map(([id, chat]) =>
            Number(id) === active ? [id, chat] : [id, { ...EMPTY_CHAT, messages: chat.messages.filter((m) => m.local) }],
          ),
        ),
      }));
      await Promise.all([get().refreshConversations(), active !== null ? get().loadLatest(active) : null]);
    },

    upsertConversation: (conversation) =>
      set((state) => ({
        conversations: sortConversations([...state.conversations.filter((c) => c.id !== conversation.id), conversation]),
      })),

    addContact: (contact) =>
      set((state) => ({
        contacts: sortContacts([...state.contacts.filter((c) => c.id !== contact.id), contact]),
      })),

    setActiveConversation: (id) => set({ activeConversationId: id }),

    loadLatest: async (conversationId) => {
      if (!get().messagesByConversation[conversationId]) patchChat(conversationId, () => ({}));
      let page: Message[];
      try {
        page = await listMessages(conversationId);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return;
        patchChat(conversationId, (chat) => (chat.loaded ? {} : { error: errorText(err, "Couldn't load messages") }));
        return;
      }
      const latest = [...page].reverse();
      const full = page.length === MESSAGE_PAGE_SIZE;
      patchChat(conversationId, (chat) => {
        const saved = chat.messages.filter((m) => m.id !== 0);
        const newestSaved = saved.at(-1)?.id ?? 0;
        // A full page that doesn't reach what we hold may leave a gap: start over from this page.
        const gap = chat.loaded && full && latest.length > 0 && latest[0].id > newestSaved;
        if (!chat.loaded || gap) {
          const keep = gap ? chat.messages.filter((m) => m.id === 0) : chat.messages;
          return { messages: mergeMessages(keep, latest), loaded: true, hasMore: full, error: null };
        }
        return { messages: mergeMessages(chat.messages, latest), error: null };
      });
    },

    loadOlder: async (conversationId) => {
      const chat = get().messagesByConversation[conversationId];
      const oldest = chat?.messages.find((m) => m.id !== 0)?.id;
      if (!chat || !chat.hasMore || chat.loadingOlder || oldest === undefined) return;
      patchChat(conversationId, () => ({ loadingOlder: true }));
      try {
        const page = await listMessages(conversationId, oldest);
        patchChat(conversationId, (c) => ({
          messages: mergeMessages(c.messages, [...page].reverse()),
          hasMore: page.length === MESSAGE_PAGE_SIZE,
          loadingOlder: false,
        }));
      } catch {
        patchChat(conversationId, () => ({ loadingOlder: false }));
      }
    },

    sendMessage: (conversationId, body, meId) => {
      const message: ChatMessage = {
        id: 0,
        conversation_id: conversationId,
        sender_id: meId,
        type: "text",
        body,
        meta: null,
        reply_to: null,
        client_id: newClientId(),
        created_at: new Date().toISOString(),
        local: "sending",
      };
      get().receiveMessage(message); // shows it now and moves the chat to the top
      void deliver(message);
    },

    retryMessage: (conversationId, clientId) => {
      const message = get().messagesByConversation[conversationId]?.messages.find(
        (m) => m.id === 0 && m.client_id === clientId,
      );
      if (!message) return;
      const retrying = { ...message, local: "sending" as const };
      get().receiveMessage(retrying);
      void deliver(retrying); // same client_id, so a send that did reach the server isn't duplicated
    },

    receiveMessage: (message) => {
      const known = get().conversations.some((c) => c.id === message.conversation_id);
      set((state) => {
        const chat = state.messagesByConversation[message.conversation_id];
        return {
          messagesByConversation: chat
            ? {
                ...state.messagesByConversation,
                [message.conversation_id]: { ...chat, messages: mergeMessages(chat.messages, [message]) },
              }
            : state.messagesByConversation,
          conversations: sortConversations(
            state.conversations.map((c) =>
              c.id === message.conversation_id && isNewer(message, c.last_message) ? { ...c, last_message: message } : c,
            ),
          ),
        };
      });
      // A chat we haven't seen yet (e.g. someone just messaged us for the first time).
      if (!known) void get().refreshConversations();
    },

    applyReceipt: (update) =>
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id !== update.conversation_id
            ? c
            : {
                ...c,
                members: c.members.map((m) =>
                  m.user_id !== update.user_id
                    ? m
                    : {
                        ...m,
                        last_delivered: Math.max(m.last_delivered, update.delivered_up_to ?? 0, update.read_up_to ?? 0),
                        last_read: Math.max(m.last_read, update.read_up_to ?? 0),
                      },
                ),
              },
        ),
      })),

    handleEvent: (event) => {
      switch (event.type) {
        case "message_new":
          get().receiveMessage(event.data);
          break;
        case "receipt_update":
          get().applyReceipt(event.data);
          break;
      }
    },
  };
});
