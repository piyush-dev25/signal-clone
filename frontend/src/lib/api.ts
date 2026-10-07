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
