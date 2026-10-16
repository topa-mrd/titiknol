import type { z } from "zod";

/** Kelas input bersama untuk form mitra/admin. */
export const fieldClass =
  "mt-1.5 block w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-2.5 text-base focus:border-sky focus:outline-none aria-invalid:border-danger";

/**
 * Ubah masalah validasi zod menjadi pesan per kolom berbahasa Indonesia.
 * `messages` berisi pesan untuk tiap nama kolom; kolom tanpa pesan memakai pesan umum.
 */
export function fieldErrors<K extends string>(
  issues: readonly z.core.$ZodIssue[],
  messages: Partial<Record<K, string>>,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "") as K;
    if (!key || out[key]) continue;
    // Pesan kustom dari skema (refine) sudah berbahasa Indonesia; pesan bawaan zod diganti.
    const custom = issue.code === "custom" ? issue.message : undefined;
    out[key] = custom ?? messages[key] ?? "Isian ini belum valid.";
  }
  return out;
}
