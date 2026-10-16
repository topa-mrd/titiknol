import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, SAMPLE_OPPORTUNITIES, filterOpportunities, locationLabel, rankOpportunities } from "@/lib/opportunities";
import { PROVINCES } from "@/lib/regions";
import {
  ApplicationInputSchema,
  ContactSchema,
  OpportunityInputSchema,
  OpportunitySchema,
  OrganizationInputSchema,
  type RoadmapRow,
} from "@/lib/types";
import { roadmap } from "../fixtures/data";

const row = (over: Partial<RoadmapRow> = {}): RoadmapRow =>
  ({
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "u",
    title: roadmap.title,
    summary: roadmap.summary,
    dream: "Aku ingin jadi desainer UI/UX",
    profile: {},
    plan: { title: "Belajar desain UI/UX" },
    steps: roadmap.steps,
    progress: { doneSteps: [], doneTodos: [] },
    costs: { items: {}, extras: [], extrasStatus: "belum" },
    created_at: "2026-10-16T00:00:00Z",
    updated_at: "2026-10-16T00:00:00Z",
    ...over,
  }) as unknown as RoadmapRow;

describe("lowongan contoh", () => {
  it("semua valid, berlabel contoh, dan tersebar di beberapa provinsi + online", () => {
    for (const o of SAMPLE_OPPORTUNITIES) {
      expect(OpportunitySchema.safeParse(o).success).toBe(true);
      expect(o.sample).toBe(true);
      expect(o.orgName).toMatch(/\(contoh\)$/);
    }
    expect(SAMPLE_OPPORTUNITIES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SAMPLE_OPPORTUNITIES.map((o) => o.province).filter(Boolean)).size).toBeGreaterThanOrEqual(8);
    expect(SAMPLE_OPPORTUNITIES.some((o) => o.remote && o.province === null)).toBe(true);
    expect(new Set(SAMPLE_OPPORTUNITIES.map((o) => o.id)).size).toBe(SAMPLE_OPPORTUNITIES.length);
  });

  it("38 provinsi tanpa duplikat", () => {
    expect(PROVINCES).toHaveLength(38);
    expect(new Set(PROVINCES).size).toBe(38);
  });
});

describe("filter lowongan", () => {
  it("tanpa filter → semua", () => {
    expect(filterOpportunities(SAMPLE_OPPORTUNITIES, EMPTY_FILTER)).toHaveLength(SAMPLE_OPPORTUNITIES.length);
  });

  it("daerah: provinsi tertentu hanya lowongan di provinsi itu; online hanya yang bisa jarak jauh", () => {
    const jatim = filterOpportunities(SAMPLE_OPPORTUNITIES, { ...EMPTY_FILTER, place: "Jawa Timur" });
    expect(jatim.length).toBeGreaterThan(0);
    expect(jatim.every((o) => o.province === "Jawa Timur")).toBe(true);
    const online = filterOpportunities(SAMPLE_OPPORTUNITIES, { ...EMPTY_FILTER, place: "online" });
    expect(online.length).toBeGreaterThan(0);
    expect(online.every((o) => o.remote)).toBe(true);
  });

  it("bidang dan kata kunci posisi bisa digabung", () => {
    const desain = filterOpportunities(SAMPLE_OPPORTUNITIES, { ...EMPTY_FILTER, category: "desain" });
    expect(desain.every((o) => o.category === "desain")).toBe(true);
    const magangIt = filterOpportunities(SAMPLE_OPPORTUNITIES, { ...EMPTY_FILTER, q: "magang IT" });
    expect(magangIt.map((o) => o.id)).toEqual(["contoh-magang-it-support"]);
    expect(filterOpportunities(SAMPLE_OPPORTUNITIES, { ...EMPTY_FILTER, q: "tidakadakatainisama" })).toEqual([]);
  });

  it("label lokasi", () => {
    expect(locationLabel({ city: "Kediri", province: "Jawa Timur", remote: false })).toBe("Kediri, Jawa Timur");
    expect(locationLabel({ city: "Kediri", province: "Jawa Timur", remote: true })).toBe("Kediri, Jawa Timur atau online");
    expect(locationLabel({ city: "", province: null, remote: true })).toBe("Online / jarak jauh");
  });
});

describe("urutan sesuai roadmap", () => {
  it("roadmap desain → lowongan desain di atas; tanpa roadmap urutan asli", () => {
    const ranked = rankOpportunities(SAMPLE_OPPORTUNITIES, row());
    expect(ranked[0].opportunity.category).toBe("desain");
    expect(ranked[0].matched).toContain("desain");
    const plain = rankOpportunities(SAMPLE_OPPORTUNITIES, null);
    expect(plain.map((r) => r.opportunity.id)).toEqual(SAMPLE_OPPORTUNITIES.map((o) => o.id));
    expect(plain.every((r) => r.matched.length === 0)).toBe(true);
  });
});

describe("validasi input", () => {
  const opp = {
    title: "Magang desain grafis",
    category: "desain",
    kind: "magang",
    province: "Jawa Timur",
    city: "Kediri",
    remote: false,
    description: "Membantu membuat konten promosi untuk toko.",
    stipend: "Rp1.000.000 per bulan",
    duration: "3 bulan",
    slots: 2,
  } as const;

  it("lowongan wajib punya provinsi kecuali bisa online", () => {
    expect(OpportunityInputSchema.safeParse(opp).success).toBe(true);
    const noPlace = OpportunityInputSchema.safeParse({ ...opp, province: null });
    expect(noPlace.success).toBe(false);
    expect(noPlace.error?.issues[0].message).toMatch(/provinsi/);
    expect(OpportunityInputSchema.safeParse({ ...opp, province: null, remote: true }).success).toBe(true);
    expect(OpportunityInputSchema.safeParse({ ...opp, province: "Atlantis" }).success).toBe(false);
  });

  it("kontak: WhatsApp atau email", () => {
    expect(ContactSchema.safeParse("081234567890").success).toBe(true);
    expect(ContactSchema.safeParse("+6281234567890").success).toBe(true);
    expect(ContactSchema.safeParse("rina@gmail.com").success).toBe(true);
    expect(ContactSchema.safeParse("halo saya").success).toBe(false);
  });

  it("lamaran: alasan minimal 20 karakter, link harus https", () => {
    const base = { opportunityId: "x", contact: "081234567890", motivation: "Saya ingin belajar desain menu." };
    expect(ApplicationInputSchema.safeParse(base).success).toBe(true);
    expect(ApplicationInputSchema.safeParse({ ...base, motivation: "pendek" }).success).toBe(false);
    expect(ApplicationInputSchema.safeParse({ ...base, cvUrl: "http://drive.google.com/x" }).success).toBe(false);
    expect(ApplicationInputSchema.safeParse({ ...base, cvUrl: "https://drive.google.com/x" }).success).toBe(true);
  });

  it("organisasi: provinsi harus dari daftar resmi", () => {
    const org = { name: "Kedai Senja", kind: "umkm", province: "Bali", city: "Denpasar", contactName: "Bu Sri", contact: "081234567890" };
    expect(OrganizationInputSchema.safeParse(org).success).toBe(true);
    expect(OrganizationInputSchema.safeParse({ ...org, province: "bali" }).success).toBe(false);
  });
});
