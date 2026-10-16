import { beforeEach, describe, expect, it } from "vitest";
import { RESOURCES } from "@/lib/resources";
import {
  CACHE_TTL_MS,
  cleanUrl,
  needKey,
  parseProposals,
  resetSearchCache,
  sameSite,
  searchWebResources,
  webId,
  type SearchDeps,
} from "@/lib/server/web-search";
import { ResourceSchema, type Resource, type ResourceNeed } from "@/lib/types";

const KEY = { GEMINI_API_KEY: "g-key" };
const NEED: ResourceNeed = { type: "kursus", keywords: ["UI", "ux", "desain"] };
const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
const T0 = Date.parse("2026-10-16T08:00:00Z");

type Page = { status: number; url: string };

/** Jawaban Gemini bergrounding: teks + JSON usulan, sumber dari groundingChunks. */
const geminiAnswer = (items: unknown[], chunks: { uri: string; title: string }[]) => ({
  candidates: [
    {
      content: { parts: [{ text: `Ada kursus bagus di situs resminya.\n\`\`\`json\n${JSON.stringify({ sumber: items })}\n\`\`\`` }] },
      groundingMetadata: { groundingChunks: chunks.map((web) => ({ web })) },
    },
  ],
});

const proposal = (over: Record<string, unknown> = {}) => ({
  judul: "Kursus Desain UI/UX Dasar",
  penyelenggara: "Contoh Akademi",
  domain: "contoh.id",
  jenis: "kursus",
  biaya: "gratis",
  level: "pemula",
  tag: ["ui", "ux"],
  ...over,
});

/**
 * fetch palsu: panggilan ke Gemini mengembalikan `answers` berurutan; panggilan
 * lain (verifikasi link) dijawab dari `pages` berdasarkan URL awal.
 */
function fakeFetch(answers: unknown[], pages: Record<string, Page>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("generativelanguage.googleapis.com")) {
      const body = answers.shift();
      if (!body) return new Response(JSON.stringify({ error: { message: "habis" } }), { status: 503 });
      if (typeof body === "number") return new Response(JSON.stringify({ error: { message: "x" } }), { status: body });
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    // `url` di halaman = tujuan redirect; server mengikuti redirect satu per satu (redirect: "manual").
    const page = pages[url];
    if (!page) throw new TypeError("fetch failed");
    if (page.url !== url) {
      pages[page.url] ??= { status: page.status, url: page.url };
      return { status: 302, headers: new Headers({ location: page.url }), body: null } as unknown as Response;
    }
    return { status: page.status, headers: new Headers(), body: null } as unknown as Response;
  }) as typeof fetch;
  return { fetch: fn, calls };
}

function deps(over: Partial<SearchDeps> = {}) {
  const saved: { resources: Resource[]; entries: { key: string; ids: string[] }[] }[] = [];
  const base: Partial<SearchDeps> = {
    env: KEY,
    now: () => T0,
    catalog: async () => RESOURCES,
    readCache: async () => new Map(),
    canPersist: () => true,
    save: async (resources, entries) => {
      saved.push({ resources, entries });
      return true;
    },
    ...over,
  };
  return { base, saved };
}

const run = (needs: ResourceNeed[], d: Partial<SearchDeps>, budgetMs = 15_000) =>
  searchWebResources(needs, { location: "Kediri", budgetMs }, d);

beforeEach(() => resetSearchCache());

describe("bentuk data", () => {
  it("kunci cache: jenis + kata kunci unik, kecil, terurut", () => {
    expect(needKey(NEED)).toBe("kursus:desain ui ux");
    expect(needKey({ type: "kursus", keywords: ["ux", "Desain", "ui", "UI"] })).toBe("kursus:desain ui ux");
  });

  it("sameSite menerima subdomain, menolak domain lain yang mirip", () => {
    expect(sameSite("learn.contoh.id", "contoh.id")).toBe(true);
    expect(sameSite("contoh.id", "contoh.id")).toBe(true);
    expect(sameSite("contoh.id.jahat.com", "contoh.id")).toBe(false);
    expect(sameSite("bukancontoh.id", "contoh.id")).toBe(false);
  });

  it("cleanUrl: hanya https, buang fragment & parameter pelacak", () => {
    expect(cleanUrl("https://contoh.id/kelas?utm_source=x&id=3#bagian")).toBe("https://contoh.id/kelas?id=3");
    expect(cleanUrl("http://contoh.id/")).toBeNull();
    expect(cleanUrl("bukan url")).toBeNull();
  });

  it("webId cocok dengan pola id katalog dan berbeda untuk URL berbeda", () => {
    const a = webId("contoh.id", "Kursus Desain UI/UX Dasar yang Sangat Panjang Sekali Judulnya", "https://contoh.id/a");
    const b = webId("contoh.id", "Kursus Desain UI/UX Dasar yang Sangat Panjang Sekali Judulnya", "https://contoh.id/b");
    expect(a).toMatch(/^web-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).not.toBe(b);
  });

  it("parseProposals membuang usulan tanpa domain valid dan mengabaikan URL dari teks", () => {
    const text = JSON.stringify({
      sumber: [proposal(), proposal({ domain: "bukan domain" }), proposal({ judul: "" }), proposal({ domain: "https://www.contoh.id/kelas" })],
    });
    const out = parseProposals(text, NEED);
    expect(out).toHaveLength(2);
    expect(out[1].domain).toBe("contoh.id");
    expect(out[0]).toMatchObject({ cost: "Gratis", type: "kursus", level: "pemula" });
  });
});

describe("searchWebResources", () => {
  it("tanpa GEMINI_API_KEY → dilewati tanpa memanggil jaringan", async () => {
    const { fetch, calls } = fakeFetch([], {});
    const { base } = deps({ env: {}, fetch });
    const result = await run([NEED], base);
    expect(result).toMatchObject({ resources: [], searched: 0, skipped: "no-key" });
    expect(calls).toHaveLength(0);
  });

  it("URL diambil dari hasil pencarian (redirect diikuti), bukan dari teks model; disimpan sebagai web/belum dicek", async () => {
    const { fetch } = fakeFetch(
      [geminiAnswer([proposal()], [{ uri: REDIRECT, title: "contoh.id" }])],
      { [REDIRECT]: { status: 200, url: "https://www.contoh.id/kelas/ui-ux?utm_source=google" } },
    );
    const { base, saved } = deps({ fetch });
    const result = await run([NEED], base);

    expect(result).toMatchObject({ searched: 1, cached: 0, skipped: null });
    expect(result.resources).toHaveLength(1);
    const r = result.resources[0];
    expect(ResourceSchema.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({
      url: "https://www.contoh.id/kelas/ui-ux",
      origin: "web",
      review: "belum_dicek",
      cost: "Gratis",
      provider: "Contoh Akademi",
    });
    expect(r.id).toMatch(/^web-/);
    expect(saved).toHaveLength(1);
    expect(saved[0].resources.map((x) => x.id)).toEqual([r.id]);
    expect(saved[0].entries).toEqual([{ key: "kursus:desain ui ux", ids: [r.id] }]);
  });

  it("usulan tanpa sumber pencarian berdomain sama ditolak (tidak ada link karangan)", async () => {
    const { fetch } = fakeFetch(
      [geminiAnswer([proposal({ domain: "jahat.id" })], [{ uri: REDIRECT, title: "contoh.id" }])],
      { [REDIRECT]: { status: 200, url: "https://contoh.id/kelas" } },
    );
    const { base } = deps({ fetch });
    expect((await run([NEED], base)).resources).toEqual([]);
  });

  it("redirect berakhir di domain lain atau halaman 404 → ditolak", async () => {
    const other = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/def";
    const { fetch } = fakeFetch(
      [
        geminiAnswer(
          [proposal(), proposal({ judul: "Kelas Kedua" })],
          [
            { uri: REDIRECT, title: "contoh.id" },
            { uri: other, title: "contoh.id" },
          ],
        ),
      ],
      {
        [REDIRECT]: { status: 200, url: "https://iklan.com/contoh" },
        [other]: { status: 404, url: "https://contoh.id/hilang" },
      },
    );
    const { base } = deps({ fetch });
    expect((await run([NEED], base)).resources).toEqual([]);
  });

  it("redirect ke http, IP mentah, atau host internal ditolak (tidak ada SSRF)", async () => {
    for (const target of ["http://contoh.id/kelas", "https://169.254.169.254/latest/meta-data", "https://localhost/x", "https://db.internal/x"]) {
      resetSearchCache();
      const { fetch, calls } = fakeFetch(
        [geminiAnswer([proposal()], [{ uri: REDIRECT, title: "contoh.id" }])],
        { [REDIRECT]: { status: 200, url: target } },
      );
      const { base } = deps({ fetch });
      expect((await run([NEED], base)).resources).toEqual([]);
      expect(calls).not.toContain(target);
    }
  });

  it("URL yang sudah ada di katalog memakai sumber lama (id & status pemeriksaannya), tidak dibuat ulang", async () => {
    const existing = RESOURCES.find((r) => r.id === "google-ux-design")!;
    const { fetch } = fakeFetch(
      [geminiAnswer([proposal({ domain: new URL(existing.url).hostname })], [{ uri: REDIRECT, title: new URL(existing.url).hostname }])],
      { [REDIRECT]: { status: 200, url: existing.url } },
    );
    const { base, saved } = deps({ fetch });
    const result = await run([NEED], base);
    expect(result.resources.map((r) => r.id)).toEqual([existing.id]);
    expect(result.resources[0].origin).toBe("kurasi");
    expect(saved[0].resources).toEqual([]);
    expect(saved[0].entries).toEqual([{ key: "kursus:desain ui ux", ids: [existing.id] }]);
  });

  it("cache memori: kebutuhan yang sama tidak dicari ulang", async () => {
    const { fetch, calls } = fakeFetch(
      [geminiAnswer([proposal()], [{ uri: REDIRECT, title: "contoh.id" }])],
      { [REDIRECT]: { status: 200, url: "https://contoh.id/kelas" } },
    );
    const { base } = deps({ fetch });
    await run([NEED], base);
    const before = calls.length;
    const second = await run([{ type: "kursus", keywords: ["desain", "UX", "ui"] }], base);
    expect(calls.length).toBe(before);
    expect(second).toMatchObject({ searched: 0, cached: 1 });
    expect(second.resources).toHaveLength(1);
  });

  it("cache DB yang masih segar dipakai; yang kedaluwarsa dicari ulang", async () => {
    const id = "google-ux-design";
    const fresh = deps({
      fetch: fakeFetch([], {}).fetch,
      readCache: async () => new Map([["kursus:desain ui ux", { ids: [id], at: T0 - 1000 }]]),
    });
    const hit = await run([NEED], fresh.base);
    expect(hit).toMatchObject({ searched: 0, cached: 1 });
    expect(hit.resources.map((r) => r.id)).toEqual([id]);

    resetSearchCache();
    const { fetch, calls } = fakeFetch([geminiAnswer([], [])], {});
    const stale = deps({
      fetch,
      readCache: async () => new Map([["kursus:desain ui ux", { ids: [id], at: T0 - CACHE_TTL_MS - 1 }]]),
    });
    const miss = await run([NEED], stale.base);
    expect(miss.searched).toBe(1);
    expect(calls.some((u) => u.includes("generativelanguage"))).toBe(true);
  });

  it("key Gemini ditolak (401) → pencarian lain tidak dilanjutkan, roadmap tetap aman", async () => {
    const { fetch, calls } = fakeFetch([401, 401, 401], {});
    const { base } = deps({ fetch });
    const result = await run(
      [NEED, { type: "beasiswa", keywords: ["s1"] }, { type: "program", keywords: ["magang"] }, { type: "ujian", keywords: ["toefl"] }],
      base,
    );
    expect(result.resources).toEqual([]);
    expect(calls.filter((u) => u.includes("generativelanguage")).length).toBeLessThanOrEqual(3);
  });

  it("tanpa penyimpanan katalog (secret key/Supabase kosong) → pencarian dilewati", async () => {
    const { fetch, calls } = fakeFetch([], {});
    const { base } = deps({ fetch, canPersist: () => false });
    const result = await run([NEED], base);
    expect(result).toMatchObject({ resources: [], skipped: "no-db" });
    expect(calls).toHaveLength(0);
  });

  it("gagal menyimpan ke katalog → sumber baru tidak dipakai dan tidak di-cache", async () => {
    const answers = () => [geminiAnswer([proposal()], [{ uri: REDIRECT, title: "contoh.id" }])];
    const pages = { [REDIRECT]: { status: 200, url: "https://contoh.id/kelas" } };
    const first = fakeFetch(answers(), pages);
    const failing = deps({ fetch: first.fetch, save: async () => false });
    expect((await run([NEED], failing.base)).resources).toEqual([]);

    const second = fakeFetch(answers(), pages);
    const ok = deps({ fetch: second.fetch });
    const retry = await run([NEED], ok.base);
    expect(retry.searched).toBe(1);
    expect(retry.resources).toHaveLength(1);
  });

  it("anggaran waktu habis → berhenti tanpa error", async () => {
    // Seperti fetch asli: tidak pernah selesai sendiri, tapi batal saat sinyal habis.
    const slow = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })) as typeof fetch;
    const { base } = deps({ fetch: slow });
    const result = await run([NEED], base, 50);
    expect(result.resources).toEqual([]);
  });
});
