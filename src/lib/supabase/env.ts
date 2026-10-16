export type SupabaseEnv = { url: string; key: string };

/**
 * Konfigurasi Supabase publik. Mengembalikan null bila belum diisi →
 * aplikasi berjalan dalam mode demo (localStorage).
 * Referensi process.env.NEXT_PUBLIC_* ditulis literal agar di-inline saat build.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !local) return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}
