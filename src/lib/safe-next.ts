/**
 * Tujuan setelah login, hanya path internal. Mencegah open redirect seperti
 * `?next=https://jahat.example` atau `?next=//jahat.example`.
 */
export function safeNext(next: string | null | undefined, fallback = "/roadmap"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/auth/")) return fallback;
  return next;
}

export const loginHref = (next: string) => `/login?next=${encodeURIComponent(next)}`;
