import type { ZodType } from "zod";
import type { AiMeta } from "./types";

export type PostResult<T> = { ok: true; data: T; meta: AiMeta } | { ok: false; error: string };

/**
 * POST JSON ke API sendiri dengan pesan error siap tampil (bahasa Indonesia).
 * Respons divalidasi skema; meta {provider, fallback} ikut dibaca bila ada.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  timeoutMs = 70_000,
): Promise<PostResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { ok: false, error: "AI butuh waktu terlalu lama untuk menjawab. Coba kirim lagi." };
    }
    return { ok: false, error: "Koneksi ke server terputus. Periksa internetmu lalu coba lagi." };
  }

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: unknown } | null)?.error;
    return {
      ok: false,
      error: typeof message === "string" ? message : "Server sedang bermasalah. Tunggu sebentar lalu coba lagi.",
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) return { ok: false, error: "Jawaban yang diterima tidak lengkap. Coba kirim lagi." };

  const meta = json as { provider?: unknown; fallback?: unknown };
  return {
    ok: true,
    data: parsed.data,
    meta: {
      provider: meta.provider === "gemini" || meta.provider === "openrouter" ? meta.provider : "mock",
      fallback: meta.fallback === true,
    },
  };
}
