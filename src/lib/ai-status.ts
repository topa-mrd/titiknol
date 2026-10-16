"use client";

let status: Promise<boolean> | null = null;

/** Apakah server punya AI sungguhan (bukan mode demo). Dibaca sekali per halaman. */
export function aiAvailable(): Promise<boolean> {
  status ??= fetch("/api/status", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body: { ai?: unknown } | null) => !!body && body.ai !== "mock")
    .catch(() => false);
  return status;
}
