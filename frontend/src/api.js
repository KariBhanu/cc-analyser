// Thin fetch wrapper. credentials:"include" sends the session cookie.
const BASE = "/api";

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || res.statusText);
  return body;
}

export const api = {
  authConfig: () => req("/auth/config"),
  me: () => req("/auth/me"),
  devLogin: () => req("/auth/dev-login", { method: "POST" }),
  logout: () => req("/auth/logout", { method: "POST" }),
  googleLoginUrl: () => "/api/auth/google",

  signup: (body) => req("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (email, password) =>
    req("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  pending: () => req("/auth/pending"),
  verifyOtp: (channel, code) =>
    req("/auth/verify-otp", { method: "POST", body: JSON.stringify({ channel, code }) }),
  resendOtp: (channel) =>
    req("/auth/resend-otp", { method: "POST", body: JSON.stringify({ channel }) }),

  listCards: () => req("/cards"),
  createCard: (card) => req("/cards", { method: "POST", body: JSON.stringify(card) }),
  updateCard: (id, patch) => req(`/cards/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteCard: (id) => req(`/cards/${id}`, { method: "DELETE" }),

  listStatements: () => req("/statements"),
  createStatement: (s) => req("/statements", { method: "POST", body: JSON.stringify(s) }),
  deleteStatement: (id) => req(`/statements/${id}`, { method: "DELETE" }),
  uploadStatement: (formData) =>
    fetch(BASE + "/statements/upload", {
      method: "POST",
      credentials: "include",
      body: formData, // multipart; let the browser set Content-Type
    }).then(async (r) => {
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.detail || r.statusText);
      return b;
    }),

  assistantQuery: (query) =>
    req("/assistant/query", { method: "POST", body: JSON.stringify({ query }) }),

  summary: () => req("/dashboard/summary"),
  bestCard: (merchant, amount) =>
    req(`/dashboard/best-card?merchant=${encodeURIComponent(merchant || "")}&amount=${amount}`),
};
