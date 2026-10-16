import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTER,
  SAMPLE_OPPORTUNITIES,
  canTake,
  filterOpportunities,
  rankOpportunities,
  talentTier,
  tierLevel,
  unlockHint,
} from "@/lib/opportunities";
import { OpportunityInputSchema, SquadInputSchema, type Opportunity } from "@/lib/types";

const opp = (id: string, level: Opportunity["level"]): Opportunity => ({ ...SAMPLE_OPPORTUNITIES[0], id, level, sample: false });
const KECIL = opp("k", "kecil");
const SEDANG = opp("s", "sedang");
const TINGGI = opp("t", "tinggi");
const ALL = [TINGGI, SEDANG, KECIL];
const done = (opportunityId: string) => ({ opportunityId, status: "selesai" as const });

describe("tangga proyek", () => {
  it("talenta baru = tingkat 1 (kecil); naik setelah proyek selesai, maks 3 — sama dengan talent_tier di database", () => {
    expect(talentTier([], ALL)).toBe(1);
    expect(talentTier([{ opportunityId: "k", status: "bekerja" }], ALL)).toBe(1);
    expect(talentTier([done("k")], ALL)).toBe(2);
    expect(talentTier([done("k"), done("s")], ALL)).toBe(3);
    expect(talentTier([done("t")], ALL)).toBe(3);
    // Lowongan yang tidak dikenal dianggap kecil.
    expect(talentTier([done("hilang")], ALL)).toBe(2);
  });

  it("kunci: tingkat 1 hanya kecil, tingkat 2 sampai sedang, tingkat 3 semua; pesan syaratnya jelas", () => {
    expect([canTake("kecil", 1), canTake("sedang", 1), canTake("tinggi", 1)]).toEqual([true, false, false]);
    expect([canTake("sedang", 2), canTake("tinggi", 2)]).toEqual([true, false]);
    expect(canTake("tinggi", 3)).toBe(true);
    expect(tierLevel(1)).toBe("kecil");
    expect(tierLevel(9)).toBe("tinggi");
    expect(unlockHint("sedang")).toMatch(/satu proyek kecil/);
    expect(unlockHint("tinggi")).toMatch(/satu proyek tingkat sedang/);
  });

  it("urutan: yang terbuka dulu, tingkat setara tingkat talenta paling atas, yang terkunci di bawah", () => {
    // Tingkat 1: kecil di atas; yang terkunci tetap urutan asli (tinggi, lalu sedang).
    expect(rankOpportunities(ALL, null, 1).map((r) => r.opportunity.id)).toEqual(["k", "t", "s"]);
    expect(rankOpportunities(ALL, null, 2).map((r) => r.opportunity.id)).toEqual(["s", "k", "t"]);
    expect(rankOpportunities(ALL, null, 3).map((r) => r.opportunity.id)).toEqual(["t", "s", "k"]);
  });

  it("filter tingkat; lowongan contoh punya tiga tingkat dan default kecil", () => {
    expect(filterOpportunities(ALL, { ...EMPTY_FILTER, level: "sedang" }).map((o) => o.id)).toEqual(["s"]);
    const levels = new Set(SAMPLE_OPPORTUNITIES.map((o) => o.level));
    expect([...levels].sort()).toEqual(["kecil", "sedang", "tinggi"]);
    const input = OpportunityInputSchema.parse({
      title: "Katalog produk",
      category: "desain",
      kind: "proyek",
      province: "Jawa Timur",
      description: "Buat katalog produk untuk usaha batik rumahan.",
      stipend: "Rp300.000",
      duration: "2 minggu",
      slots: 2,
    });
    expect(input.level).toBe("kecil");
  });
});

describe("SquadInputSchema", () => {
  it("nama 2–60 karakter, link grup harus https", () => {
    expect(SquadInputSchema.safeParse({ name: "Squad A", contactLink: "https://chat.whatsapp.com/abc" }).success).toBe(true);
    expect(SquadInputSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(SquadInputSchema.safeParse({ name: "Squad A", contactLink: "http://grup.id" }).success).toBe(false);
    expect(SquadInputSchema.parse({ name: "Squad A" })).toEqual({ name: "Squad A", contactLink: null, note: "" });
  });
});
