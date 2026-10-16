export const SITE = {
  name: "TitikNol",
  tagline: "Tell me your dream. We will help you.",
  description:
    "Ceritakan mimpimu, TitikNol bantu menyusun langkah nyata: rencana, roadmap mingguan, pengalaman proyek, sampai berbagi cerita.",
} as const;

/** Nama tahap sengaja tetap dalam bahasa Inggris. */
export const STAGES = [
  "Tell me your dream",
  "Drafting",
  "Roadmap",
  "Experience",
  "Share your story",
] as const;

export type Stage = (typeof STAGES)[number];

const LOCAL_URL = "http://localhost:3000";

function toUrl(value: string | undefined, assumeHttps = false): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${assumeHttps ? "https" : "http"}://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return new URL(url.origin);
  } catch {
    return null;
  }
}

/**
 * URL dasar situs untuk metadata dan redirect auth.
 * Urutan: NEXT_PUBLIC_SITE_URL → domain produksi Vercel → localhost.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): URL {
  return (
    toUrl(env.NEXT_PUBLIC_SITE_URL) ??
    toUrl(env.VERCEL_PROJECT_PRODUCTION_URL, true) ??
    new URL(LOCAL_URL)
  );
}
