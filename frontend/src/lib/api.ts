import { clearToken, getToken, redirectToLogin } from "@/lib/auth";
import { API_URL } from "@/lib/config";

export type User = {
  id: number;
  phone: string;
  display_name: string;
  avatar: string | null;
  last_seen: string | null;
  created_at: string;
};

export type AuthResult = { token: string; user: User; is_new: boolean };

export type Contact = {
  id: number;
  user_id: number;
  phone: string;
  display_name: string;
  avatar: string | null;
  nickname: string | null;
  last_seen: string | null;
};

export type SystemAction =
  | "group_created"
  | "member_added"
  | "member_removed"
  | "member_left"
  | "renamed"
  | "role_changed";

export type SystemMeta = {
  action: SystemAction;
  actor_id: number;
  target_id?: number;
  name?: string;
  role?: "admin" | "member";
};

export type Message = {
  id: number;
  conversation_id: number;
  sender_id: number;
  type: "text" | "system";
  body: string | null;
  meta: SystemMeta | null;
  reply_to: { id: number; sender_id: number; type: "text" | "system"; body: string | null } | null;
  client_id: string | null;
  created_at: string;
};

export type Member = {
  user_id: number;
  display_name: string;
  avatar: string | null;
  phone: string;
  nickname: string | null; // the viewer's nickname for this member
  role: "admin" | "member";
  online: boolean;
  last_seen: string | null;
  last_delivered: number;
  last_read: number;
};

export type Conversation = {
  id: number;
  type: "direct" | "group";
  name: string | null;
  avatar: string | null;
  created_at: string;
  unread_count: number;
  last_message: Message | null;
  members: Member[];
};

export type SearchResult = { contacts: Contact[]; conversations: Conversation[] };

export type ReceiptUpdate = {
  conversation_id: number;
  user_id: number;
  delivered_up_to?: number;
  read_up_to?: number;
};

export type TypingEvent = { conversation_id: number; user_id: number; is_typing: boolean };

export type PresenceEvent = { user_id: number; online: boolean; last_seen: string | null };

/** Server → client WebSocket envelopes (unknown types are ignored). */
export type ServerEvent =
  | { type: "message_new"; data: Message }
  | { type: "receipt_update"; data: ReceiptUpdate }
  | { type: "typing"; data: TypingEvent }
  | { type: "presence"; data: PresenceEvent }
  | { type: "pong"; data: Record<string, never> };

export type ReadCursors = { conversation_id: number; last_read: number; last_delivered: number };

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FastApiError = { detail?: string | { msg?: string }[] };

function errorMessage(body: FastApiError | null, status: number): string {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  // 422: Pydantic's first message, minus its "Value error, " prefix.
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error, /, "");
  return `Request failed (${status})`;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server");
  }

  if (res.status === 401) {
    clearToken();
    redirectToLogin();
    throw new ApiError(401, "Session expired");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(body, res.status));
  return body as T;
}

export const requestOtp = (phone: string) =>
  api<{ ok: true }>("/auth/request-otp", { method: "POST", body: { phone } });

export const verifyOtp = (phone: string, otp: string) =>
  api<AuthResult>("/auth/verify", { method: "POST", body: { phone, otp } });

export const getMe = () => api<User>("/me");

export const updateMe = (changes: { display_name?: string; avatar?: string | null }) =>
  api<User>("/me", { method: "PUT", body: changes });

export const listContacts = () => api<Contact[]>("/contacts");

export const addContact = (phone: string, nickname: string | null) =>
  api<Contact>("/contacts", { method: "POST", body: { phone, nickname } });

export const listConversations = () => api<Conversation[]>("/conversations");

export const openDirect = (userId: number) =>
  api<Conversation>("/conversations/direct", { method: "POST", body: { user_id: userId } });

export const search = (q: string) => api<SearchResult>(`/search?q=${encodeURIComponent(q)}`);

export const MESSAGE_PAGE_SIZE = 30;

/** Newest first. Pass the oldest id you have as `beforeId` to page backwards. */
export const listMessages = (conversationId: number, beforeId?: number, limit = MESSAGE_PAGE_SIZE) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId !== undefined) params.set("before_id", String(beforeId));
  return api<Message[]>(`/conversations/${conversationId}/messages?${params}`);
};

export const postMessage = (
  conversationId: number,
  message: { client_id: string; body: string; reply_to_id?: number | null },
) => api<Message>(`/conversations/${conversationId}/messages`, { method: "POST", body: message });

/** Move my read cursor (the server clamps to the latest message and never moves it back). */
export const markRead = (conversationId: number, messageId: number) =>
  api<ReadCursors>(`/conversations/${conversationId}/read`, { method: "POST", body: { message_id: messageId } });
