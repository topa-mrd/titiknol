import { describe, expect, it } from "vitest";
import { buildProfile, detectField, detectLocation, mockDraft, mockRefine, mockRoadmap } from "@/lib/ai/mock";
import { RESOURCES } from "@/lib/resources";
import { assembleRoadmap, candidatesByStep, rulePicks } from "@/lib/resource-search";
import { COST_LEVELS, DraftSchema, RefineSchema, ResolvedRoadmapSchema, RoadmapDraftSchema } from "@/lib/types";

const STORIES = [
  { dream: "Aku ingin jadi UI/UX designer yang kerja remote.", background: "Lulusan SMK di Kediri, kerja paruh waktu di percetakan. Biaya terbatas." },
  { dream: "Mau jadi programmer aplikasi Android.", background: "Masih SMA di Makassar, belum punya laptop." },
  { dream: "Pengen kuliah S2 di Jepang pakai beasiswa.", background: "Sarjana pendidikan dari Kupang, bahasa Inggris masih lemah." },
  { dream: "Aku mau usaha katering rumahan yang besar.", background: "Ibu rumah tangga di Bogor, suka masak." },
  { dream: "Ingin jadi guru SD di kampungku.", background: "Tinggal di desa di Flores, harus bantu orang tua." },
  { dream: "Jadi data analyst.", background: "" },
  { dream: "Aku ingin hidup lebih baik dan bahagia.", background: "Tidak tahu harus mulai dari mana." },
];

describe("mockDraft", () => {
  it.each(STORIES)("selalu lolos skema: $dream", (story) => {
    expect(DraftSchema.safeParse(mockDraft(story)).success).toBe(true);
  });

  it("membaca bidang, kota, kendala, dan modal dari cerita", () => {
    const profile = buildProfile(STORIES[0]);
    expect(detectField(STORIES[0].dream).key).toBe("uiux");
    expect(profile.location).toBe("Kediri");
    expect(profile.constraints).toEqual(expect.arrayContaining(["Biaya terbatas", "Harus sambil bekerja"]));
    expect(profile.strengths).toContain("Berlatar belakang SMK, terbiasa praktik");
  });

  it("menyesuaikan plan dengan kendala biaya", () => {
    const tight = mockDraft(STORIES[0]);
    expect(tight.plans[0].costLevel).toBe("gratis");
    expect(tight.message).toContain("Kediri");
  });

  it("mengenali bidang lain dan jatuh ke umum bila tidak jelas", () => {
    expect(detectField(STORIES[2].dream).key).toBe("beasiswa");
    expect(detectField(STORIES[3].dream).key).toBe("usaha");
    expect(detectField(STORIES[6].dream).key).toBe("umum");
    expect(detectLocation("aku tinggal di jogja")).toBe("Yogyakarta");
    expect(detectLocation("tidak menyebut kota")).toBeNull();
  });
});

describe("deteksi tanpa salah tangkap", () => {
  it("desain grafis ≠ UI/UX", () => {
    expect(detectField("Aku ingin jadi desainer grafis").key).toBe("grafis");
    expect(detectField("Mau jadi UI/UX designer").key).toBe("uiux");
    expect(detectField("Pengen desain aplikasi mobile").key).toBe("uiux");
    expect(buildProfile({ dream: "Jadi desainer grafis.", background: "Tinggal di Medan." }).summary).toContain(
      "desainer grafis",
    );
  });

  it("kata yang mengandung potongan kata kunci tidak memicu kendala", () => {
    const profile = buildProfile({
      dream: "Aku ingin jadi desainer grafis.",
      background: "Ada peluang kerja di ruang kreatif. Aku ingin kuliah nanti.",
    });
    expect(profile.constraints).not.toContain("Jauh dari pusat pelatihan"); // "desainer" ⊃ "desa"
    expect(profile.constraints).not.toContain("Biaya terbatas"); // "peluang", "ruang" ⊃ "uang"
    expect(profile.strengths).not.toContain("Punya pengalaman pendidikan tinggi"); // "ingin kuliah"
  });

  it("kata kunci utuh tetap terdeteksi", () => {
    const profile = buildProfile({ dream: "Jadi guru.", background: "Tinggal di desa, uang pas-pasan, sedang kuliah." });
    expect(profile.constraints).toEqual(expect.arrayContaining(["Jauh dari pusat pelatihan", "Biaya terbatas"]));
    expect(profile.strengths).toContain("Punya pengalaman pendidikan tinggi");
  });
});

describe("mockRefine", () => {
  const base = mockDraft({ dream: "Jadi desainer grafis.", background: "Tinggal di Medan." });

  it("permintaan lebih murah menurunkan biaya plan yang belum gratis", () => {
    const out = mockRefine(base.profile, base.plans, [{ role: "user", content: "Cari opsi yang lebih murah" }]);
    expect(RefineSchema.safeParse(out).success).toBe(true);
    out.plans.forEach((plan, i) => {
      expect(COST_LEVELS.indexOf(plan.costLevel)).toBeLessThanOrEqual(COST_LEVELS.indexOf(base.plans[i].costLevel));
    });
    expect(out.plans.some((p, i) => p !== base.plans[i])).toBe(true);
    expect(out.profile.constraints).toContain("Biaya terbatas");
  });

  it("chip 'sambil kerja' dan 'tetap di kotaku' mengubah plan", () => {
    const work = mockRefine(base.profile, base.plans, [{ role: "user", content: "Aku harus sambil kerja" }]);
    expect(work.plans[1].title).toBe("Kuliah jarak jauh sambil bekerja");
    const stay = mockRefine(base.profile, base.plans, [{ role: "user", content: "Aku mau tetap di kotaku" }]);
    expect(stay.reply).toContain("Medan");
    expect(RefineSchema.safeParse(stay).success).toBe(true);
  });

  it("pesan bebas tetap menghasilkan jawaban valid", () => {
    const out = mockRefine(base.profile, base.plans, [{ role: "user", content: "x".repeat(900) }]);
    expect(RefineSchema.safeParse(out).success).toBe(true);
  });
});

describe("mockRoadmap", () => {
  const ids = new Set(RESOURCES.map((r) => r.id));

  it.each(STORIES)("lolos skema AI #1 dan menemukan sumber nyata lewat katalog: $dream", (story) => {
    const { profile, plans } = mockDraft(story);
    for (const plan of plans) {
      const draft = mockRoadmap(profile, plan);
      expect(RoadmapDraftSchema.safeParse(draft).success).toBe(true);
      const roadmap = assembleRoadmap(draft, rulePicks(candidatesByStep(draft, RESOURCES, profile)), RESOURCES);
      expect(ResolvedRoadmapSchema.safeParse(roadmap).success).toBe(true);
      const found = roadmap.steps.flatMap((s) => s.resourceIds);
      expect(found.length, `${story.dream} / Plan ${plan.id}`).toBeGreaterThanOrEqual(3);
      for (const id of found) expect(ids).toContain(id);
    }
  });
});
