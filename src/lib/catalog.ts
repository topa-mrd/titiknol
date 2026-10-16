import { createClient } from "@supabase/supabase-js";
import { RESOURCES } from "./resources";
import { getSupabaseEnv } from "./supabase/env";
import { PriceSchema, ResourceSchema, type Price, type Resource } from "./types";

/**
 * Katalog sumber untuk server. Sumber utama tabel `resources` di Supabase
 * (admin bisa menambah lewat dashboard) + perkiraan harga AI dari tabel
 * `price_estimates` untuk sumber yang belum punya harga kurasi. Jika Supabase
 * belum dikonfigurasi, tabel kosong, atau gagal dibaca → pakai seed di kode.
 */

const TTL_MS = 5 * 60_000;
const ERROR_TTL_MS = 60_000;
const TIMEOUT_MS = 4_000;

let cache: { items: readonly Resource[]; expiresAt: number } | null = null;

type ResourceRow = {
  id: string;
  title: string;
  provider: string;
  type: string;
  url: string;
  cost: string;
  tags: string[];
  level: string;
  note: string | null;
  price_min_idr: number | null;
  price_max_idr: number | null;
  price_unit: string | null;
  price_note: string | null;
  price_source_url: string | null;
  price_checked_at: string | null;
  origin: string;
  review_status: string;
};

type EstimateRow = {
  resource_id: string;
  min_idr: number;
  max_idr: number;
  unit: string;
  note: string | null;
  source_url: string;
  checked_at: string;
};

const RESOURCE_COLUMNS =
  "id, title, provider, type, url, cost, tags, level, note, price_min_idr, price_max_idr, price_unit, price_note, price_source_url, price_checked_at, origin, review_status";

function rowPrice(row: ResourceRow): Price | null {
  if (row.price_min_idr === null || row.price_max_idr === null) return null;
  const parsed = PriceSchema.safeParse({
    min: row.price_min_idr,
    max: row.price_max_idr,
    unit: row.price_unit,
    note: row.price_note ?? "",
    sourceUrl: row.price_source_url,
    checkedAt: row.price_checked_at,
    source: "kurasi",
  });
  return parsed.success ? parsed.data : null;
}

export function estimatePrice(row: EstimateRow): Price | null {
  const parsed = PriceSchema.safeParse({
    min: row.min_idr,
    max: row.max_idr,
    unit: row.unit,
    note: row.note ?? "",
    sourceUrl: row.source_url,
    checkedAt: row.checked_at,
    source: "ai",
  });
  return parsed.success ? parsed.data : null;
}

const FREE_PRICE = (row: ResourceRow): Price => ({
  min: 0,
  max: 0,
  unit: "sekali",
  note: "",
  sourceUrl: null,
  checkedAt: row.price_checked_at ?? new Date().toISOString().slice(0, 10),
  source: "kurasi",
});

async function fetchFromSupabase(): Promise<Resource[] | null> {
  const env = getSupabaseEnv();
  if (!env) return null;
  const supabase = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  const [resources, estimates] = await Promise.all([
    supabase.from("resources").select(RESOURCE_COLUMNS).order("id").abortSignal(signal),
    supabase.from("price_estimates").select("resource_id, min_idr, max_idr, unit, note, source_url, checked_at").abortSignal(signal),
  ]);
  if (resources.error) throw new Error(`resources: ${resources.error.code ?? ""} ${resources.error.message}`);
  // Tabel perkiraan bersifat opsional: bila belum ada/gagal, katalog tetap jalan tanpa perkiraan AI.
  const estimateById = new Map(
    (estimates.error ? [] : ((estimates.data ?? []) as EstimateRow[])).map((e) => [e.resource_id, estimatePrice(e)]),
  );

  // Baris yang tidak lolos skema (mis. diedit manual dengan salah) dilewati, bukan menggagalkan semuanya.
  return ((resources.data ?? []) as ResourceRow[]).flatMap((row) => {
    const parsed = ResourceSchema.safeParse({
      ...row,
      note: row.note || "-",
      price: rowPrice(row) ?? estimateById.get(row.id) ?? (row.cost === "Gratis" ? FREE_PRICE(row) : null),
      origin: row.origin,
      review: row.review_status,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

export async function getCatalog(now = Date.now()): Promise<readonly Resource[]> {
  if (cache && cache.expiresAt > now) return cache.items;
  try {
    const rows = await fetchFromSupabase();
    const items = rows && rows.length > 0 ? rows : RESOURCES;
    cache = { items, expiresAt: now + TTL_MS };
  } catch (error) {
    console.warn("[catalog] memakai seed:", error instanceof Error ? error.message : error);
    cache = { items: RESOURCES, expiresAt: now + ERROR_TTL_MS };
  }
  return cache.items;
}

/** Hanya untuk test dan setelah perkiraan harga baru disimpan. */
export function resetCatalogCache() {
  cache = null;
}
