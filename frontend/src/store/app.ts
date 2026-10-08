import { create } from "zustand";
import {
  ApiError,
  type Contact,
  type Conversation,
  MESSAGE_PAGE_SIZE,
  type Message,
  type PresenceEvent,
  type ReceiptUpdate,
  type ServerEvent,
  listContacts,
  listConversations,
  listMessages,
  markRead as postRead,
  postMessage,
} from "@/lib/api";
import { sortContacts, sortConversations } from "@/lib/conversations";
import { newClientId } from "@/lib/ids";
import { isNewer, mergeMessages } from "@/lib/messages";
import type { ChatMessage } from "@/lib/receipts";
import type { RealtimeConnection } from "@/lib/ws";

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

const READ_DEBOUNCE_MS = 300;
const TYPING_EXPIRY_MS = 5_000; // the typist re-sends every ~3s while still typing

/** Newest saved (server-assigned) message id we know of in a conversation. */
function latestSavedId(conversation: Conversation, chat: ChatState | undefined): number {
  const fromChat = chat?.messages.findLast((m) => m.id !== 0)?.id ?? 0;
  return Math.max(conversation.last_message?.id ?? 0, fromChat);
}

type AppState = {
  status: Status;
  error: string | null;
  conversations: Conversation[];
  contacts: Contact[];
  activeConversationId: number | null;
  messagesByConversation: Record<number, ChatState>;
  /** conversation id -> ids of users currently typing there (never includes me). */
  typing: Record<number, Record<number, true>>;
  meId: number | null;
  realtime: RealtimeConnection | null;

  setSession: (meId: number, realtime: RealtimeConnection) => void;

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
  /** Mark the open chat read up to its latest message (optimistic, then a debounced POST /read). */
  markRead: (conversationId: number) => void;
  setTyping: (conversationId: number, userId: number, isTyping: boolean) => void;
  clearTyping: () => void;
  sendTyping: (conversationId: number, isTyping: boolean) => void;
  applyPresence: (presence: PresenceEvent) => void;
  handleEvent: (event: ServerEvent) => void;
};

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

let conversationsInFlight: Promise<void> | null = null;
const readTimers = new Map<number, ReturnType<typeof setTimeout>>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    typing: {},
    meId: null,
    realtime: null,

    setSession: (meId, realtime) => set({ meId, realtime }),

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
      get().clearTyping(); // typing events sent while we were away are stale
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
      const { meId, activeConversationId } = get();
      const known = get().conversations.some((c) => c.id === message.conversation_id);
      // Unread counts someone else's new text message unless that chat is open in a visible tab.
      const fromOther = message.id !== 0 && message.type === "text" && message.sender_id !== meId;
      const unseen = activeConversationId !== message.conversation_id || document.visibilityState !== "visible";
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
            state.conversations.map((c) => {
              if (c.id !== message.conversation_id) return c;
              const isNew = message.id > (c.last_message?.id ?? 0); // not a copy already counted
              return {
                ...c,
                last_message: isNewer(message, c.last_message) ? message : c.last_message,
                unread_count: fromOther && unseen && isNew ? c.unread_count + 1 : c.unread_count,
              };
            }),
          ),
        };
      });
      // Their message ends their typing indicator.
      if (fromOther) get().setTyping(message.conversation_id, message.sender_id, false);
      // A chat we have not seen yet (e.g. someone just messaged us for the first time).
      if (!known) void get().refreshConversations();
    },

    applyReceipt: (update) =>
      set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id !== update.conversation_id) return c;
          // I read up to the latest message (e.g. in another tab): nothing unread here any more.
          const readAll =
            update.user_id === state.meId &&
            update.read_up_to !== undefined &&
            update.read_up_to >= (c.last_message?.id ?? 0);
          return {
            ...c,
            unread_count: readAll ? 0 : c.unread_count,
            members: c.members.map((m) =>
              m.user_id !== update.user_id
                ? m
                : {
                    ...m,
                    last_delivered: Math.max(m.last_delivered, update.delivered_up_to ?? 0, update.read_up_to ?? 0),
                    last_read: Math.max(m.last_read, update.read_up_to ?? 0),
                  },
            ),
          };
        }),
      })),

    markRead: (conversationId) => {
      const { meId, conversations, messagesByConversation } = get();
      const conversation = conversations.find((c) => c.id === conversationId);
      if (meId === null || !conversation) return;
      const latest = latestSavedId(conversation, messagesByConversation[conversationId]);
      const mine = conversation.members.find((m) => m.user_id === meId);
      if (!mine || latest <= mine.last_read) {
        if (conversation.unread_count) {
          set((state) => ({
            conversations: state.conversations.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)),
          }));
        }
        return;
      }
      // Optimistic: my cursor and the badge update now; the server confirms after the debounce.
      get().applyReceipt({ conversation_id: conversationId, user_id: meId, read_up_to: latest });
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === conversationId ? { ...c, unread_count: 0 } : c)),
      }));

      clearTimeout(readTimers.get(conversationId));
      readTimers.set(
        conversationId,
        setTimeout(() => {
          readTimers.delete(conversationId);
          const current = get().conversations.find((c) => c.id === conversationId);
          if (!current) return;
          const upTo = latestSavedId(current, get().messagesByConversation[conversationId]);
          postRead(conversationId, upTo)
            .then((cursors) =>
              get().applyReceipt({
                conversation_id: conversationId,
                user_id: meId,
                read_up_to: cursors.last_read,
                delivered_up_to: cursors.last_delivered,
              }),
            )
            .catch(() => {}); // the next resync brings back the server's view (and the read retries)
        }, READ_DEBOUNCE_MS),
      );
    },

    setTyping: (conversationId, userId, isTyping) => {
      const key = `${conversationId}:${userId}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);
      if (isTyping) {
        // Auto-expire in case the "stopped typing" event never arrives.
        typingTimers.set(key, setTimeout(() => get().setTyping(conversationId, userId, false), TYPING_EXPIRY_MS));
      }
      const current = get().typing[conversationId] ?? {};
      if (Boolean(current[userId]) === isTyping) return;
      const next = { ...current };
      if (isTyping) next[userId] = true;
      else delete next[userId];
      set((state) => ({ typing: { ...state.typing, [conversationId]: next } }));
    },

    clearTyping: () => {
      typingTimers.forEach((timer) => clearTimeout(timer));
      typingTimers.clear();
      set({ typing: {} });
    },

    sendTyping: (conversationId, isTyping) => {
      get().realtime?.send("typing", { conversation_id: conversationId, is_typing: isTyping });
    },

    applyPresence: ({ user_id, online, last_seen }) =>
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.members.some((m) => m.user_id === user_id)
            ? { ...c, members: c.members.map((m) => (m.user_id === user_id ? { ...m, online, last_seen } : m)) }
            : c,
        ),
        contacts: state.contacts.map((c) => (c.user_id === user_id ? { ...c, last_seen } : c)),
      })),

    handleEvent: (event) => {
      switch (event.type) {
        case "message_new":
          get().receiveMessage(event.data);
          break;
        case "receipt_update":
          get().applyReceipt(event.data);
          break;
        case "typing":
          if (event.data.user_id !== get().meId) {
            get().setTyping(event.data.conversation_id, event.data.user_id, event.data.is_typing);
          }
          break;
        case "presence":
          get().applyPresence(event.data);
          break;
      }
    },
  };
});
