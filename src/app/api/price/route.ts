import { z } from "zod";
import { readAiConfig } from "@/lib/ai/providers";
import { clientIp, json, jsonError, readJson } from "@/lib/server/http";
import { lookupPrice } from "@/lib/server/price-lookup";
import { createRateLimiter } from "@/lib/server/rate-limit";
import { SLUG_PATTERN } from "@/lib/types";

export const maxDuration = 60;

const PriceRequestSchema = z.object({
  resourceId: z.string().max(64).regex(SLUG_PATTERN, "Sumber tidak dikenal."),
});

/** Pencarian web memakai kuota berbayar setelah gratis habis: 10 per 10 menit per IP. */
const limiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

export async function POST(request: Request) {
  const parsed = await readJson(request, PriceRequestSchema);
  if (!parsed.ok) return parsed.response;

  if (readAiConfig().provider !== "mock") {
    const limited = limiter(clientIp(request));
    if (!limited.ok) {
      return jsonError(429, "Terlalu banyak pencarian harga. Tunggu beberapa menit lalu coba lagi.", {
        "retry-after": String(limited.retryAfterSec),
      });
    }
  }

  const result = await lookupPrice(parsed.data.resourceId);
  return result.ok ? json({ price: result.price, method: result.method }) : jsonError(result.status, result.error);
}
