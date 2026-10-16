import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESOURCES } from "@/lib/resources";
import { lookupPrice, pickSource, resetPriceCache, toPrice } from "@/lib/server/price-lookup";
import type { Price } from "@/lib/types";

const GEMINI = { GEMINI_API_KEY: "g-key" };
const NO_PRICE_ID = "azure-fundamentals";

function grounded(payload: unknown, sources: string[] = ["https://learn.microsoft.com/credentials/exam-pricing"], status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    if (status !== 200) return new Response(JSON.stringify({ error: { message: "x" } }), { status });
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] },
            groundingMetadata: { groundingChunks: sources.map((uri) => ({ web: { uri, title: "sumber" } })) },
          },
        ],
      }),
    );
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

type Save = (resourceId: string, price: Price) => Promise<void>;

const deps = (env: Record<string, string>, fetch: typeof globalThis.fetch, save: Save = vi.fn<Save>(async () => undefined)) => ({
  env,
  fetch,
  now: () => Date.parse("2026-10-15T00:00:00Z"),
  catalog: async () => RESOURCES,
  save,
});

beforeEach(() => resetPriceCache());

describe("lookupPrice (hybrid)", () => {
  it("harga kurasi dipakai langsung tanpa memanggil AI", async () => {
    const { fetch, calls } = grounded({});
    const result = await lookupPrice("aws-cloud-practitioner", deps(GEMINI, fetch));
    expect(result).toMatchObject({ ok: true, method: "katalog", price: { min: 1_600_000, source: "kurasi" } });
    expect(calls).toHaveLength(0);
  });

  it("sumber tak dikenal → 404", async () => {
    expect(await lookupPrice("tidak-ada", deps(GEMINI, grounded({}).fetch))).toMatchObject({ ok: false, status: 404 });
  });

  it("tanpa key AI apa pun (mode demo) tidak pernah mengarang harga", async () => {
    const { fetch, calls } = grounded({ found: true, currency: "IDR", min: 1, max: 2 });
    const result = await lookupPrice(NO_PRICE_ID, deps({}, fetch));
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(0);
  });

  it("harga kosong → Gemini + Google Search; sumber dari grounding, disimpan sebagai perkiraan AI", async () => {
    const save = vi.fn<Save>(async () => undefined);
    const { fetch, calls } = grounded({ found: true, currency: "IDR", min: 1_100_000, max: 1_300_000, unit: "sekali", note: "Ujian AZ-900" });
    const result = await lookupPrice(NO_PRICE_ID, deps(GEMINI, fetch, save));
    expect(calls[0].body.tools).toEqual([{ googleSearch: {} }]);
    expect(calls[0].body).not.toHaveProperty("generationConfig.responseMimeType");
    expect(result).toMatchObject({
      ok: true,
      method: "ai",
      price: { min: 1_100_000, max: 1_300_000, source: "ai", sourceUrl: "https://learn.microsoft.com/credentials/exam-pricing", checkedAt: "2026-10-15" },
    });
    expect(save).toHaveBeenCalledWith(NO_PRICE_ID, expect.objectContaining({ source: "ai" }));

    // Panggilan kedua memakai cache, tanpa pencarian ulang.
    const again = await lookupPrice(NO_PRICE_ID, deps(GEMINI, fetch, save));
    expect(again).toMatchObject({ ok: true, method: "cache" });
    expect(calls).toHaveLength(1);
  });

  it("tanpa sumber hasil pencarian → angka ditolak (dianggap tebakan)", async () => {
    const { fetch } = grounded({ found: true, currency: "IDR", min: 1, max: 2 }, []);
    expect(await lookupPrice(NO_PRICE_ID, deps(GEMINI, fetch))).toMatchObject({ ok: false, status: 422 });
  });

  it("found=false → tidak ditemukan", async () => {
    const { fetch } = grounded({ found: false });
    expect(await lookupPrice(NO_PRICE_ID, deps(GEMINI, fetch))).toMatchObject({ ok: false, status: 422 });
  });

  it("key ditolak → berhenti, pesan jelas", async () => {
    const { fetch, calls } = grounded({}, [], 403);
    const result = await lookupPrice(NO_PRICE_ID, deps(GEMINI, fetch));
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(calls).toHaveLength(1);
  });
});

describe("lookupPrice lewat OpenRouter", () => {
  it("memakai plugin web search; sumber dari anotasi url_citation", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ found: true, currency: "USD", min: 99, max: 99, unit: "sekali" }),
                annotations: [{ type: "url_citation", url_citation: { url: "https://learn.microsoft.com/exam-pricing", title: "Harga" } }],
              },
            },
          ],
        }),
      );
    }) as unknown as typeof globalThis.fetch;
    const result = await lookupPrice(NO_PRICE_ID, deps({ OPENROUTER_API_KEY: "or" }, fetch));
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0].body).toMatchObject({ model: "google/gemini-3.6-flash", plugins: [{ id: "web", engine: "exa" }] });
    expect(result).toMatchObject({ ok: true, method: "ai", price: { source: "ai", sourceUrl: "https://learn.microsoft.com/exam-pricing" } });
  });

  it("tanpa anotasi sumber → ditolak", async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ found: true, currency: "IDR", min: 1, max: 2 }) } }] })),
    ) as unknown as typeof globalThis.fetch;
    expect(await lookupPrice(NO_PRICE_ID, deps({ OPENROUTER_API_KEY: "or" }, fetch))).toMatchObject({ ok: false, status: 422 });
  });
});

describe("pickSource", () => {
  it("mengutamakan domain resmi penyelenggara daripada blog", () => {
    const sources = [
      { uri: "https://learn.secbyte.org/blog/az-900" },
      { uri: "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-900/" },
    ];
    expect(pickSource(sources, "https://learn.microsoft.com/en-us/credentials/certifications/azure-fundamentals/")).toBe(
      "https://learn.microsoft.com/en-us/credentials/certifications/exams/az-900/",
    );
  });

  it("tanpa sumber resmi → sumber pertama; tanpa sumber → null", () => {
    expect(pickSource([{ uri: "https://a.example/x" }], "https://bnsp.go.id/")).toBe("https://a.example/x");
    expect(pickSource([], "https://bnsp.go.id/")).toBeNull();
  });
});

describe("toPrice", () => {
  it("USD dikonversi ke rentang rupiah dengan kurs dari env", () => {
    const p = toPrice({ found: true, currency: "USD", min: 99, max: 99, unit: "sekali" }, "https://a.example", "2026-10-15", 16_000);
    expect(p).toMatchObject({ min: 1_540_000, max: 1_680_000, source: "ai" });
    expect(p?.note).toContain("USD");
  });

  it("menolak angka tidak masuk akal", () => {
    expect(toPrice({ found: true, currency: "IDR", min: 5, max: 1 }, "https://a.example", "2026-10-15", 16_000)).toBeNull();
    expect(toPrice({ found: true, currency: "IDR", min: 1, max: 9e9 }, "https://a.example", "2026-10-15", 16_000)).toBeNull();
  });
});
