import type { ZodType } from "zod";
import { readAiConfig } from "../ai/providers";
import { AiUnavailableError, type AiResult } from "../ai/service";
import { clientIp, json, jsonError, readJson } from "./http";
import { createRateLimiter } from "./rate-limit";

/** Dibagi oleh /api/draft, /api/refine, /api/roadmap, /api/story: 30 panggilan AI per 10 menit per IP. */
const limiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

/**
 * Kerangka bersama route AI: validasi input → rate limit (hanya bila memakai
 * AI sungguhan; mode demo gratis) → panggil service → respons dengan meta.
 */
export async function handleAiRoute<In, Out extends object>(
  request: Request,
  schema: ZodType<In>,
  run: (input: In) => Promise<AiResult<Out>>,
): Promise<Response> {
  const parsed = await readJson(request, schema);
  if (!parsed.ok) return parsed.response;

  if (readAiConfig().provider !== "mock") {
    const limited = limiter(clientIp(request));
    if (!limited.ok) {
      return jsonError(
        429,
        `Terlalu banyak permintaan dalam waktu singkat. Tunggu sekitar ${Math.ceil(limited.retryAfterSec / 60)} menit lalu coba lagi.`,
        { "retry-after": String(limited.retryAfterSec) },
      );
    }
  }

  try {
    const result = await run(parsed.data);
    // resourcesBy (khusus roadmap): sumber dipilih AI #2 atau aturan database.
    const extra = "resourcesBy" in result ? { resourcesBy: result.resourcesBy } : {};
    return json({ ...result.data, provider: result.provider, fallback: result.fallback, ...extra });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return jsonError(503, "AI sedang sibuk atau tidak bisa dihubungi. Tunggu sebentar lalu coba lagi.");
    }
    console.error("[api] galat tak terduga:", error);
    return jsonError(500, "Terjadi kesalahan di server. Coba lagi sebentar lagi.");
  }
}
