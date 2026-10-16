import "server-only";
import { createClient } from "@supabase/supabase-js";
import { extractJson } from "../ai/normalize";
import {
  ProviderError,
  buildTargets,
  callGeminiWithSearch,
  callOpenRouterWithSearch,
  readAiConfig,
  type Prompt,
} from "../ai/providers";
import { getCatalog, resetCatalogCache } from "../catalog";
import { getSupabaseEnv } from "../supabase/env";
import { PRICE_UNITS, PriceSchema, type Price, type PriceUnit, type Resource } from "../types";

/**
 * Hybrid harga: kurasi DB dulu; bila kosong, Gemini + Google Search mencari
 * di web. Hasil AI hanya diterima bila ada sumber dari hasil pencarian
 * sungguhan (groundingMetadata), disimpan sebagai "perkiraan AI".
 * Mode demo tidak pernah mengarang angka.
 */

export type PriceLookup =
  | { ok: true; price: Price; method: "katalog" | "ai" | "cache" }
  | { ok: false; status: number; error: string };

export type PriceDeps = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => number;
  catalog: () => Promise<readonly Resource[]>;
  save: (resourceId: string, price: Price) => Promise<void>;
};

const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
const TIMEOUT_MS = 25_000;
const MAX_IDR = 500_000_000;
const DEFAULT_USD_IDR = 16_500;

const memory = new Map<string, { price: Price; at: number }>();

/** Hanya untuk test. */
export function resetPriceCache() {
  memory.clear();
}

function pricePrompt(resource: Resource): Prompt {
  return {
    system: `Kamu asisten riset harga untuk pelajar Indonesia. Cari harga RESMI terbaru di Indonesia dari hasil pencarian web.
Aturan: pakai hanya informasi dari hasil pencarian; jangan menebak. Jika harga tidak jelas atau sangat bervariasi tanpa angka resmi, jawab found=false.
Tulis dulu 1–3 kalimat yang menjelaskan harganya sambil mengutip sumber dari hasil pencarian (utamakan situs resmi penyelenggara).
Lalu akhiri dengan SATU blok JSON:
{"found": boolean, "currency": "IDR" | "USD", "min": number, "max": number, "unit": ${PRICE_UNITS.map((u) => `"${u}"`).join(" | ")}, "note": string (≤ 120 karakter, mis. komponen biaya yang dihitung)}`,
    user: `Sumber: ${resource.title}
Penyelenggara: ${resource.provider}
Jenis: ${resource.type}
Situs resmi: ${resource.url}

Berapa biaya yang harus dibayar peserta di Indonesia?`,
  };
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Ubah jawaban model menjadi Price (rupiah). USD dikonversi dengan rentang ±kurs. */
export function toPrice(raw: unknown, sourceUrl: string, today: string, usdRate: number): Price | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.found !== true) return null;
  const min = Number(r.min);
  const max = Number(r.max ?? r.min);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return null;
  const usd = String(r.currency).toUpperCase() === "USD";
  const lo = usd ? roundTo(min * usdRate * 0.97, 10_000) : Math.round(min);
  const hi = usd ? roundTo(max * usdRate * 1.06, 10_000) : Math.round(max);
  if (hi > MAX_IDR) return null;
  const unit = (PRICE_UNITS as readonly string[]).includes(String(r.unit)) ? (r.unit as PriceUnit) : "sekali";
  const note = typeof r.note === "string" ? r.note.trim().slice(0, 100) : "";
  const parsed = PriceSchema.safeParse({
    min: lo,
    max: hi,
    unit,
    note: `Perkiraan AI dari pencarian web${usd ? " (dalam USD, dikonversi)" : ""}. ${note}`.trim().slice(0, 160),
    sourceUrl,
    checkedAt: today,
    source: "ai",
  });
  return parsed.success ? parsed.data : null;
}

async function saveToSupabase(env: Record<string, string | undefined>, resourceId: string, price: Price) {
  const supabase = getSupabaseEnv();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabase || !secret || !price.sourceUrl) return;
  const client = createClient(supabase.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.from("price_estimates").upsert({
    resource_id: resourceId,
    min_idr: price.min,
    max_idr: price.max,
    unit: price.unit,
    note: price.note,
    source_url: price.sourceUrl,
    checked_at: price.checkedAt,
  });
  if (error) console.warn("[price] gagal menyimpan perkiraan:", error.code ?? error.message);
  else resetCatalogCache();
}

const defaults = (): PriceDeps => ({
  env: process.env,
  fetch: globalThis.fetch,
  now: Date.now,
  catalog: () => getCatalog(),
  save: (id, price) => saveToSupabase(process.env, id, price),
});

export async function lookupPrice(resourceId: string, partial: Partial<PriceDeps> = {}): Promise<PriceLookup> {
  const deps = { ...defaults(), ...partial };
  const resource = (await deps.catalog()).find((r) => r.id === resourceId);
  if (!resource) return { ok: false, status: 404, error: "Sumber ini tidak ada di katalog." };
  if (resource.price) return { ok: true, price: resource.price, method: resource.price.source === "ai" ? "cache" : "katalog" };

  const cached = memory.get(resourceId);
  if (cached && deps.now() - cached.at < CACHE_TTL_MS) return { ok: true, price: cached.price, method: "cache" };

  const config = readAiConfig(deps.env);
  const targets = buildTargets(config);
  if (targets.length === 0) {
    return {
      ok: false,
      status: 503,
      error: "Pencarian harga otomatis belum aktif (butuh AI sungguhan). Isi perkiraan harganya sendiri dulu.",
    };
  }

  const usdRate = Number(deps.env.PRICE_USD_IDR) > 0 ? Number(deps.env.PRICE_USD_IDR) : DEFAULT_USD_IDR;
  const today = new Date(deps.now()).toISOString().slice(0, 10);
  const stopped = new Set<string>();
  for (const { provider, model } of targets) {
    if (stopped.has(provider)) continue;
    try {
      const opts = { fetch: deps.fetch, signal: AbortSignal.timeout(TIMEOUT_MS) };
      const answer =
        provider === "gemini"
          ? await callGeminiWithSearch(config.geminiKey!, model, pricePrompt(resource), opts)
          : await callOpenRouterWithSearch(config.openrouterKey!, model, pricePrompt(resource), opts);
      // Tanpa sumber dari hasil pencarian, angka dianggap tebakan dan ditolak.
      const source = pickSource(answer.sources, resource.url);
      const price = source ? toPrice(safeJson(answer.text), source, today, usdRate) : null;
      if (!price) {
        return {
          ok: false,
          status: 422,
          error: "Harga resminya belum ditemukan di web. Cek situs resminya, lalu isi perkiraanmu sendiri.",
        };
      }
      memory.set(resourceId, { price, at: deps.now() });
      await deps.save(resourceId, price).catch(() => undefined);
      return { ok: true, price, method: "ai" };
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "stop-provider") stopped.add(provider);
      console.warn(`[price] ${provider}/${model} gagal:`, error instanceof Error ? error.message : error);
    }
  }
  return {
    ok: false,
    status: 503,
    error: "Pencarian harga sedang tidak bisa dilakukan. Coba lagi nanti, atau isi perkiraanmu sendiri.",
  };
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * Pilih sumber terbaik dari hasil pencarian: utamakan domain resmi penyelenggara
 * (sama atau satu induk dengan URL katalog), selain itu sumber pertama.
 */
export function pickSource(sources: { uri: string }[], officialUrl: string): string | null {
  if (sources.length === 0) return null;
  const official = hostOf(officialUrl).split(".").slice(-2).join(".");
  const match = sources.find((s) => {
    const host = hostOf(s.uri);
    return host === official || host.endsWith(`.${official}`);
  });
  return (match ?? sources[0]).uri;
}

function safeJson(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}
