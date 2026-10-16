import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as costsPost } from "@/app/api/costs/route";
import { normalizeCostProposals } from "@/lib/ai/normalize";
import { costResearchPrompt } from "@/lib/ai/prompts";
import { AiUnavailableError, markProofOfFunds, mergeAlternatives, researchCosts } from "@/lib/ai/service";
import { costLines, extraLines, summarize, withExtra } from "@/lib/costs";
import { toIdrRange } from "@/lib/fx";
import { CostExtraSchema, EMPTY_COSTS, type CostExtra, type CostResearchRequest, type RoadmapCosts } from "@/lib/types";

const input: CostResearchRequest = {
  title: "Menuju S2 Data Science di Belanda",
  dream: "Aku ingin kuliah S2 data science di Belanda.",
  location: "Medan",
  constraints: ["biaya terbatas"],
  plan: { title: "Beasiswa S2", approach: "Kuliah S2 2 tahun di Belanda.", duration: "2 tahun" },
  steps: ["Tes IELTS", "Daftar kampus", "Urus visa"],
  existing: ["Tes IELTS Academic"],
};

/** Jawaban OpenRouter + Exa: teks bersumber lalu JSON, sumber sebagai anotasi url_citation. */
const openrouter = (items: unknown[], urls: string[]) =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: `Menurut sumber resmi, biayanya sebagai berikut.\n\`\`\`json\n${JSON.stringify({ items })}\n\`\`\``,
            annotations: urls.map((url) => ({ type: "url_citation", url_citation: { url, title: "Sumber" } })),
          },
        },
      ],
    }),
  );

afterEach(() => vi.unstubAllEnvs());

describe("normalisasi usulan biaya", () => {
  it("menerima alias kolom, angka berupa teks, dan menebak kategori/satuan", () => {
    const out = normalizeCostProposals({
      items: [
        { nama: "Tuition fee S2", mata_uang: "eur", min: "18.000", max: 22000, satuan: "per year", jumlah: 2, situs: "https://www.uu.nl/x" },
        { label: "Tanpa situs", min: 1, max: 2 },
        { label: "Biaya kos Yogyakarta", min: 900000, max: 500000, satuan: "bulanan", jumlah: 48, situs: "kos.id" },
      ],
    });
    expect(out).toEqual([
      expect.objectContaining({ label: "Tuition fee S2", category: "pendidikan", currency: "EUR", min: 18000, max: 22000, unit: "per tahun", qty: 2, site: "uu.nl" }),
      expect.objectContaining({ category: "hidup", min: 500000, max: 900000, unit: "per bulan", qty: 48, site: "kos.id" }),
    ]);
    expect(normalizeCostProposals({ jawaban: "tidak ada" })).toBeNull();
  });

  it("kurs: rupiah apa adanya, mata uang asing jadi rentang yang dilebarkan, tak dikenal ditolak", () => {
    expect(toIdrRange(1_000_000, 2_000_000, "IDR")).toEqual({ min: 1_000_000, max: 2_000_000, converted: false });
    const eur = toIdrRange(18_000, 18_000, "EUR")!;
    expect(eur.converted).toBe(true);
    expect(eur.min).toBeLessThan(18_000 * 18_000);
    expect(eur.max).toBeGreaterThan(18_000 * 18_000);
    expect(toIdrRange(100, 200, "USD", 15_000)!.max).toBe(Math.round((200 * 15_000 * 1.06) / 10_000) * 10_000);
    expect(toIdrRange(1, 2, "XYZ")).toBeNull();
  });
});

describe("mergeAlternatives", () => {
  const base = (over: Partial<CostExtra>): CostExtra =>
    CostExtraSchema.parse({
      id: "x",
      label: "x",
      category: "pendidikan",
      min: 1,
      max: 2,
      unit: "per tahun",
      qty: 1,
      included: true,
      amount: null,
      sourceUrl: "https://a.id",
      checkedAt: "2026-10-16",
      ...over,
    });

  it("dua kampus = satu rentang; komponen biaya hidup dibuang bila ada totalnya", () => {
    const out = mergeAlternatives([
      base({ id: "a", label: "Tuition Radboud", min: 340, max: 376, qty: 2 }),
      base({ id: "b", label: "Tuition Utrecht", min: 441, max: 498, qty: 2 }),
      base({ id: "c", label: "Uang pangkal", unit: "sekali", min: 5, max: 9 }),
      base({ id: "d", label: "Sewa kos", category: "hidup", unit: "per bulan" }),
      base({ id: "e", label: "Total biaya hidup bulanan", category: "hidup", unit: "per bulan", min: 13, max: 35 }),
    ]);
    expect(out.map((e) => e.id)).toEqual(["a", "c", "e"]);
    expect(out[0]).toMatchObject({ min: 340, max: 498, qty: 2 });
    expect(out[0].note).toMatch(/^Rentang dari beberapa kampus/);
  });
});

describe("bukti dana", () => {
  it("ditampilkan tapi tidak ikut total, dengan catatan penjelasan; biaya lain tidak tersentuh", () => {
    const make = (label: string) =>
      CostExtraSchema.parse({
        id: "x",
        label,
        category: "dokumen",
        min: 226_300_000,
        max: 247_300_000,
        unit: "per tahun",
        qty: 2,
        included: true,
        amount: null,
        sourceUrl: "https://www.saxion.edu",
        checkedAt: "2026-10-16",
      });
    const proof = markProofOfFunds(make("Bukti dana finansial (proof of financial means) ke imigrasi (IND)"));
    expect(proof.included).toBe(false);
    expect(proof.note).toMatch(/^Bukan biaya terpisah/);
    expect(markProofOfFunds(make("Visa dan izin tinggal pelajar")).included).toBe(true);
  });
});

describe("researchCosts", () => {
  const env = { OPENROUTER_API_KEY: "k", AI_PROVIDER: "openrouter" };

  it("4 pencarian terfokus; angka tanpa sumber yang cocok dibuang; URL dari metadata pencarian", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string;
      if (prompt.includes("Biaya pendidikan formal"))
        return openrouter(
          [
            { label: "Tuition fee S2", kategori: "pendidikan", mata_uang: "EUR", min: 18000, max: 22000, satuan: "per tahun", jumlah: 2, situs: "uu.nl" },
            { label: "Uang gedung karangan", kategori: "pendidikan", mata_uang: "IDR", min: 1, max: 2, satuan: "sekali", jumlah: 1, situs: "karangan.id" },
          ],
          ["https://www.uu.nl/en/masters/tuition?utm_source=x"],
        );
      if (prompt.includes("Biaya hidup per bulan"))
        return openrouter([{ label: "Biaya hidup", kategori: "hidup", mata_uang: "EUR", min: 1000, max: 1500, satuan: "per bulan", jumlah: 24, situs: "study-in.nl" }], ["https://www.study-in.nl/living"]);
      return openrouter([], []);
    });
    const result = await researchCosts(input, { env, fetch, deadlineMs: 50_000 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.status).toBe("selesai");
    expect(result.extras.map((e) => e.label)).toEqual(["Tuition fee S2", "Biaya hidup"]);
    expect(result.extras[0]).toMatchObject({ unit: "per tahun", qty: 2, sourceUrl: "https://www.uu.nl/en/masters/tuition", included: true });
    expect(result.extras[0].note).toMatch(/kurs perkiraan/);
    // URL tidak pernah diambil dari teks model.
    expect(result.extras.some((e) => e.sourceUrl.includes("karangan"))).toBe(false);
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.plugins[0]).toMatchObject({ id: "web", engine: "exa", max_results: 10 });
    expect(body.messages[0].content).toMatch(/Jangan memanggil alat atau fungsi/);
  });

  it("jawaban kosong (MALFORMED_FUNCTION_CALL) dicoba ulang, bukan dianggap 'tidak ada biaya'", async () => {
    let calls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const prompt = JSON.parse(String(init?.body)).messages[1].content as string;
      if (!prompt.includes("Biaya pendidikan formal")) return openrouter([], []);
      calls += 1;
      if (calls === 1)
        return new Response(JSON.stringify({ choices: [{ finish_reason: "error", native_finish_reason: "MALFORMED_FUNCTION_CALL", message: { content: "" } }] }));
      return openrouter([{ label: "UKT", kategori: "pendidikan", mata_uang: "IDR", min: 0, max: 12300000, satuan: "per semester", jumlah: 8, situs: "ugm.ac.id" }], ["https://um.ugm.ac.id/ukt"]);
    });
    const result = await researchCosts(input, { env, fetch, deadlineMs: 50_000 });
    expect(calls).toBe(2);
    expect(result.extras[0]).toMatchObject({ label: "UKT", min: 0, max: 12_300_000, unit: "per semester", qty: 8 });
  });

  it("sudah dicari tapi tidak ada yang bersumber → kosong; mode demo / semua gagal → AiUnavailableError", async () => {
    const empty = vi.fn<typeof globalThis.fetch>(async () => openrouter([], []));
    await expect(researchCosts(input, { env, fetch: empty })).resolves.toMatchObject({ status: "kosong", extras: [] });
    await expect(researchCosts(input, { env: {} })).rejects.toBeInstanceOf(AiUnavailableError);
    const down = vi.fn<typeof globalThis.fetch>(async () => new Response("{}", { status: 503 }));
    await expect(researchCosts(input, { env, fetch: down, deadlineMs: 50_000 })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("prompt: fokus terpisah, rencana dibungkus sebagai data, sumber yang sudah dihitung disebut", () => {
    const p = costResearchPrompt(input, "dokumen");
    expect(p.user).toContain("<fokus>");
    expect(p.user).toMatch(/visa atau izin tinggal/);
    expect(p.user).toContain("Tes IELTS Academic");
    expect(p.system).toMatch(/Pakai HANYA angka yang kamu temukan/);
  });
});

describe("kalkulator dengan biaya besar", () => {
  it("total = sumber + biaya besar yang dicentang; koreksi & jumlah dihitung", () => {
    const extra = CostExtraSchema.parse({
      id: "kuliah-1",
      label: "Tuition",
      category: "pendidikan",
      min: 100,
      max: 200,
      unit: "per tahun",
      qty: 2,
      included: true,
      amount: null,
      sourceUrl: "https://uu.nl",
      checkedAt: "2026-10-16",
    });
    let costs: RoadmapCosts = { ...EMPTY_COSTS, extras: [extra], extrasStatus: "selesai" };
    expect(summarize(costLines([], costs), extraLines(costs))).toMatchObject({ min: 200, max: 400, extras: 1, hasAiEstimate: true });
    costs = withExtra(costs, "kuliah-1", { amount: 150, qty: 3 });
    expect(summarize([], extraLines(costs))).toMatchObject({ min: 450, max: 450 });
    costs = withExtra(costs, "kuliah-1", { included: false });
    expect(summarize([], extraLines(costs))).toMatchObject({ min: 0, max: 0, extras: 0 });
  });
});

describe("POST /api/costs", () => {
  const post = (body: unknown) =>
    new Request("http://localhost/api/costs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  it("mode demo → 503 dengan pesan jelas; input rusak → 400", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const res = await costsPost(post(input));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Biaya kuliah dan biaya hidup belum bisa dicari/);
    expect((await costsPost(post({ ...input, steps: [] }))).status).toBe(400);
  });
});
