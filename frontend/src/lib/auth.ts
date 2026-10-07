const TOKEN_KEY = "signal.token";

// localStorage can throw (private mode, blocked storage); treat that as "no session".
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Session just won't survive a refresh.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Hard redirect so every piece of in-memory session state is dropped. */
export function redirectToLogin(): void {
  if (window.location.pathname !== "/login") window.location.replace("/login");
}
