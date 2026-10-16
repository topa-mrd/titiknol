import "server-only";
import { createClient } from "@supabase/supabase-js";
import { extractJson } from "../ai/normalize";
import { ProviderError, callGeminiWithSearch, readAiConfig, type GroundedAnswer, type Prompt } from "../ai/providers";
import { getCatalog, resetCatalogCache } from "../catalog";
import { getSupabaseEnv } from "../supabase/env";
import {
  LIMITS,
  RESOURCE_COSTS,
  RESOURCE_LEVELS,
  RESOURCE_TYPES,
  ResourceSchema,
  type Resource,
  type ResourceNeed,
  type ResourceType,
} from "../types";

/**
 * Pencarian sumber baru lewat Gemini + Google Search grounding, dijalankan
 * setiap roadmap dibuat (hanya Gemini; tanpa GEMINI_API_KEY dilewati).
 *
 * Aturan keamanan link: URL TIDAK PERNAH diambil dari teks jawaban model.
 * Model hanya menyebut judul, penyelenggara, dan domain; URL diambil dari
 * metadata hasil pencarian (groundingChunks) yang domainnya cocok, redirect
 * diikuti sampai URL akhir, dan halaman harus bisa dibuka. Hasil disimpan ke
 * `resources` sebagai origin "web" / "belum_dicek" + cache 30 hari.
 */

export type SearchDeps = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => number;
  catalog: () => Promise<readonly Resource[]>;
  /** Baca cache DB untuk kunci-kunci ini (kunci → id sumber + waktu cari). */
  readCache: (keys: string[]) => Promise<Map<string, { ids: string[]; at: number }>>;
  /** Bisa menyimpan ke katalog (Supabase + secret key)? Tanpa itu pencarian tidak dijalankan. */
  canPersist: () => boolean;
  /** Simpan sumber baru + entri cache. false = gagal; sumber baru lalu tidak dipakai. */
  save: (resources: Resource[], entries: { key: string; ids: string[] }[]) => Promise<boolean>;
};

export type SearchResult = {
  resources: Resource[];
  searched: number;
  cached: number;
  skipped: "no-key" | "no-db" | "no-needs" | null;
};

export const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;
/** Maksimal pencarian baru per roadmap (biaya & waktu). */
export const MAX_SEARCHES = 6;
const MAX_PER_SEARCH = 3;
const CONCURRENCY = 3;
const VERIFY_TIMEOUT_MS = 6_000;

const memory = new Map<string, { ids: string[]; at: number; resources: Resource[] }>();

let warned = false;
const warnOnce = (message: string) => {
  if (!warned) console.warn(`[web-search] ${message}`);
  warned = true;
};

/** Hanya untuk test. */
export function resetSearchCache() {
  memory.clear();
}

// Kunci & bentuk data

const clean = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s/+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Kunci cache: jenis + kata kunci unik terurut, mis. "sertifikasi:ui ux". */
export function needKey(need: ResourceNeed): string {
  const words = [...new Set(need.keywords.map(clean).filter(Boolean))].sort();
  return `${need.type}:${words.join(" ")}`.slice(0, 300);
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const bareDomain = (value: unknown) =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split(/[/?#\s]/)[0]
    : "";

/** Host `host` cocok dengan domain `domain` (sama atau subdomainnya). */
export const sameSite = (host: string, domain: string) =>
  !!host && !!domain && (host === domain || host.endsWith(`.${domain}`) || domain.endsWith(`.${host}`));

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const shortHash = (value: string) => {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(7, "0");
};

/** Id stabil dari domain + judul, dengan hash URL agar dua halaman berbeda tidak bertabrakan. */
export function webId(host: string, title: string, url: string): string {
  const base = `web-${toSlug(host.split(".")[0] ?? "situs")}-${toSlug(title)}`.slice(0, 56).replace(/-+$/, "");
  return `${base}-${shortHash(url)}`;
}

/** URL akhir yang bersih: https, tanpa fragment dan parameter pelacak. */
export function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|ref$|srsltid)/i.test(key)) u.searchParams.delete(key);
    }
    const out = u.toString();
    return out.length <= 500 ? out : null;
  } catch {
    return null;
  }
}

const sameUrl = (a: string, b: string) => {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
    } catch {
      return u;
    }
  };
  return norm(a) === norm(b);
};

type Proposal = {
  title: string;
  provider: string;
  domain: string;
  type: ResourceType;
  cost: Resource["cost"];
  level: Resource["level"];
  tags: string[];
};

/** Nilai enum tanpa peduli huruf besar/kecil; selain itu pakai fallback. */
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? fallback;
};

/** Ambil daftar usulan sumber dari JSON di akhir jawaban model (toleran terhadap nama kunci). */
export function parseProposals(text: string, need: ResourceNeed): Proposal[] {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return [];
  }
  const record = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw) ? raw : (record.sumber ?? record.sources ?? record.resources ?? []);
  if (!Array.isArray(list)) return [];
  const proposals = list.flatMap((item): Proposal[] => {
    if (typeof item !== "object" || item === null) return [];
    const r = item as Record<string, unknown>;
    const title = String(r.judul ?? r.title ?? "").trim().slice(0, LIMITS.short);
    const provider = String(r.penyelenggara ?? r.provider ?? "").trim().slice(0, LIMITS.short);
    const domain = bareDomain(r.domain ?? r.situs);
    if (!title || !provider || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return [];
    const rawTags = Array.isArray(r.tag ?? r.tags) ? ((r.tag ?? r.tags) as unknown[]) : [];
    const tags = [...new Set([...rawTags.map(String), ...need.keywords].map(toSlug).filter((t) => t && t.length <= 40))].slice(0, 12);
    return [
      {
        title,
        provider,
        domain,
        type: pick(r.jenis ?? r.type, RESOURCE_TYPES, need.type),
        cost: pick(r.biaya ?? r.cost, RESOURCE_COSTS, "Bervariasi"),
        level: pick(r.level, RESOURCE_LEVELS, "semua"),
        tags: tags.length > 0 ? tags : [need.type],
      },
    ];
  });
  return proposals.slice(0, MAX_PER_SEARCH);
}

function searchPrompt(need: ResourceNeed, location: string | null): Prompt {
  return {
    system: `Kamu peneliti sumber belajar untuk pelajar dan anak muda Indonesia. Gunakan hasil Google Search.
Cari maksimal ${MAX_PER_SEARCH} sumber RESMI (situs penyelenggara asli, bukan blog, berita, agregator, atau iklan) yang benar-benar ada dan masih aktif.
Untuk tiap sumber, tulis satu kalimat yang menyebut nama dan penyelenggaranya berdasarkan hasil pencarian.
Lalu akhiri dengan SATU blok JSON:
{"sumber": [{"judul": string, "penyelenggara": string, "domain": string (domain situs resmi saja, mis. "coursera.org", tanpa https dan tanpa path), "jenis": ${RESOURCE_TYPES.map((t) => `"${t}"`).join(" | ")}, "biaya": "Gratis" | "Berbayar" | "Bervariasi", "level": "pemula" | "menengah" | "lanjut" | "semua", "tag": string[] (kata kunci pendek)}]}
JANGAN menulis URL lengkap. Jika tidak menemukan sumber resmi, kembalikan {"sumber": []}.`,
    user: `Kebutuhan: ${need.type} tentang ${need.keywords.join(", ")}.
Pengguna tinggal di ${location ?? "Indonesia"}; utamakan yang bisa diikuti dari Indonesia (online atau di Indonesia).`,
  };
}

const MAX_REDIRECTS = 5;

/**
 * Host yang boleh dikunjungi server saat memeriksa link: hanya nama domain
 * publik lewat https. IP mentah, localhost, dan domain internal ditolak agar
 * redirect dari halaman hasil pencarian tidak bisa mengarah ke jaringan internal.
 */
export function isPublicHttps(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || u.username || u.password) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
    if (host === "localhost" || !host.includes(".")) return false;
    return !/\.(local|localhost|internal|lan|home|corp|intranet)$/.test(host);
  } catch {
    return false;
  }
}

/** Ikuti redirect hasil pencarian satu per satu sampai URL akhir dan pastikan halaman bisa dibuka. */
export async function verify(uri: string, domain: string, deps: Pick<SearchDeps, "fetch">, signal: AbortSignal): Promise<string | null> {
  let current = uri;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isPublicHttps(current)) return null;
      const res = await deps.fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.any([signal, AbortSignal.timeout(VERIFY_TIMEOUT_MS)]),
        headers: { "user-agent": "Mozilla/5.0 (compatible; TitikNolBot/1.0; pemeriksa link katalog)" },
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        current = new URL(location, current).toString();
        continue;
      }
      if (res.status >= 400) return null;
      const final = cleanUrl(current);
      return final && sameSite(hostOf(final), domain) ? final : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Cocokkan tiap usulan dengan sumber hasil pencarian berdomain sama, lalu verifikasi. */
export async function resolveProposals(
  answer: GroundedAnswer,
  need: ResourceNeed,
  deps: Pick<SearchDeps, "fetch" | "now">,
  signal: AbortSignal,
): Promise<Resource[]> {
  const proposals = parseProposals(answer.text, need);
  const today = new Date(deps.now()).toISOString().slice(0, 10);
  const out: Resource[] = [];
  for (const p of proposals) {
    // Sumber grounding: judulnya biasanya domain; URI-nya bisa redirect atau URL asli.
    const match = answer.sources.find(
      (s) => sameSite(bareDomain(s.title), p.domain) || sameSite(hostOf(s.uri), p.domain),
    );
    if (!match) continue;
    const url = await verify(match.uri, p.domain, deps, signal);
    if (!url || out.some((r) => sameUrl(r.url, url))) continue;
    const parsed = ResourceSchema.safeParse({
      id: webId(hostOf(url), p.title, url),
      title: p.title,
      provider: p.provider,
      type: p.type,
      url,
      cost: p.cost,
      tags: p.tags,
      level: p.level,
      note: `Ditemukan lewat pencarian web untuk “${need.keywords.join(", ")}”.`.slice(0, LIMITS.item),
      price:
        p.cost === "Gratis"
          ? { min: 0, max: 0, unit: "sekali", note: "", sourceUrl: null, checkedAt: today, source: "ai" }
          : null,
      origin: "web",
      review: "belum_dicek",
    });
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) await worker(queue.shift()!);
    }),
  );
}

// Penyimpanan (server, secret key)

function adminClient(env: Record<string, string | undefined>) {
  const supabase = getSupabaseEnv();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!supabase || !secret) return null;
  return createClient(supabase.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

const defaults = (): SearchDeps => ({
  env: process.env,
  fetch: globalThis.fetch,
  now: Date.now,
  catalog: () => getCatalog(),
  readCache: async (keys) => {
    const client = adminClient(process.env);
    const map = new Map<string, { ids: string[]; at: number }>();
    if (!client || keys.length === 0) return map;
    const { data, error } = await client.from("search_cache").select("key, resource_ids, searched_at").in("key", keys);
    if (error) console.warn("[web-search] gagal membaca cache:", error.code ?? error.message);
    for (const row of (data ?? []) as { key: string; resource_ids: string[]; searched_at: string }[]) {
      map.set(row.key, { ids: row.resource_ids, at: Date.parse(row.searched_at) });
    }
    return map;
  },
  canPersist: () => adminClient(process.env) !== null,
  save: async (resources, entries) => {
    const client = adminClient(process.env);
    if (!client) return false;
    if (resources.length > 0) {
      const { error } = await client.from("resources").upsert(
        resources.map((r) => ({
          id: r.id,
          title: r.title,
          provider: r.provider,
          type: r.type,
          url: r.url,
          cost: r.cost,
          tags: r.tags,
          level: r.level,
          note: r.note,
          origin: "web",
          review_status: "belum_dicek",
          source_query: entries.find((e) => e.ids.includes(r.id))?.key.slice(0, 200) ?? "",
        })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) {
        console.warn("[web-search] gagal menyimpan sumber:", error.code ?? error.message);
        return false;
      }
    }
    if (entries.length > 0) {
      const { error } = await client
        .from("search_cache")
        .upsert(entries.map((e) => ({ key: e.key, resource_ids: e.ids.slice(0, 10), searched_at: new Date().toISOString() })));
      if (error) console.warn("[web-search] gagal menyimpan cache:", error.code ?? error.message);
    }
    resetCatalogCache();
    return true;
  },
});

// Alur utama

export async function searchWebResources(
  needs: readonly ResourceNeed[],
  opts: { location: string | null; budgetMs: number },
  partial: Partial<SearchDeps> = {},
): Promise<SearchResult> {
  const deps = { ...defaults(), ...partial };
  const config = readAiConfig(deps.env);
  if (!config.geminiKey || config.provider === "mock") {
    return { resources: [], searched: 0, cached: 0, skipped: "no-key" };
  }
  // Link web wajib tersimpan di katalog sebelum tampil (agar bisa diperiksa admin).
  if (!deps.canPersist()) {
    warnOnce("SUPABASE_SECRET_KEY atau env Supabase kosong: pencarian web Gemini dilewati.");
    return { resources: [], searched: 0, cached: 0, skipped: "no-db" };
  }

  const unique = new Map<string, ResourceNeed>();
  for (const need of needs) {
    if (need.keywords.length === 0) continue;
    const key = needKey(need);
    if (!unique.has(key)) unique.set(key, need);
  }
  if (unique.size === 0) return { resources: [], searched: 0, cached: 0, skipped: "no-needs" };

  const now = deps.now();
  const fresh = (at: number) => now - at < CACHE_TTL_MS;
  const catalog = await deps.catalog();
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const found = new Map<string, Resource>();
  let cached = 0;

  // 1) Cache memori, lalu cache DB.
  const misses: [string, ResourceNeed][] = [];
  const dbKeys: string[] = [];
  for (const [key, need] of unique) {
    const hit = memory.get(key);
    if (hit && fresh(hit.at)) {
      hit.resources.forEach((r) => found.set(r.id, byId.get(r.id) ?? r));
      cached++;
    } else {
      dbKeys.push(key);
      misses.push([key, need]);
    }
  }
  const dbHits = await deps.readCache(dbKeys).catch(() => new Map<string, { ids: string[]; at: number }>());
  const toSearch = misses.filter(([key]) => {
    const hit = dbHits.get(key);
    if (!hit || !fresh(hit.at)) return true;
    const resources = hit.ids.map((id) => byId.get(id)).filter((r): r is Resource => !!r);
    if (hit.ids.length > 0 && resources.length === 0) return true;
    resources.forEach((r) => found.set(r.id, r));
    memory.set(key, { ids: hit.ids, at: hit.at, resources });
    cached++;
    return false;
  });

  // 2) Pencarian baru, paralel terbatas, dalam anggaran waktu.
  const signal = AbortSignal.timeout(Math.max(0, opts.budgetMs));
  const model = config.geminiModels[0];
  const created: Resource[] = [];
  const entries: { key: string; ids: string[] }[] = [];
  let searched = 0;
  let stopped = false;

  await pool(toSearch.slice(0, MAX_SEARCHES), CONCURRENCY, async ([key, need]) => {
    if (signal.aborted || stopped) return;
    try {
      const answer = await callGeminiWithSearch(config.geminiKey!, model, searchPrompt(need, opts.location), {
        fetch: deps.fetch,
        signal,
      });
      searched++;
      const resolved = await resolveProposals(answer, need, deps, signal);
      const ids: string[] = [];
      for (const r of resolved) {
        // URL yang sudah ada di katalog memakai sumber lama (id & status pemeriksaannya).
        const existing = catalog.find((c) => sameUrl(c.url, r.url)) ?? created.find((c) => sameUrl(c.url, r.url));
        const resource = existing ?? r;
        if (!existing) created.push(r);
        ids.push(resource.id);
        found.set(resource.id, resource);
      }
      entries.push({ key, ids });
      memory.set(key, { ids, at: deps.now(), resources: ids.map((id) => found.get(id)!).filter(Boolean) });
    } catch (error) {
      if (error instanceof ProviderError && error.kind === "stop-provider") stopped = true;
      if (!signal.aborted) console.warn("[web-search] pencarian gagal:", error instanceof Error ? error.message : error);
    }
  });

  if (created.length > 0 || entries.length > 0) {
    const ok = await deps.save(created, entries).catch(() => false);
    if (!ok) {
      // Sumber baru yang tidak tersimpan tidak boleh tampil; cache memori untuknya dibuang.
      const lost = new Set(created.map((r) => r.id));
      lost.forEach((id) => found.delete(id));
      for (const { key } of entries) memory.delete(key);
    }
  }

  return { resources: [...found.values()], searched, cached, skipped: null };
}
