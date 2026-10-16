import type { Draft, Plan, Profile, Roadmap, RoadmapDraft, Step, StepDraft } from "@/lib/types";

export const profile: Profile = {
  dream: "Jadi UI/UX designer yang bekerja remote untuk perusahaan teknologi.",
  summary: "Lulusan SMK multimedia dari Kediri yang suka menggambar dan ingin masuk dunia desain digital.",
  currentCondition: "Bekerja paruh waktu di percetakan, belajar desain dari YouTube.",
  location: "Kediri",
  constraints: ["Biaya terbatas", "Hanya bisa belajar malam hari"],
  strengths: ["Terbiasa memakai Canva dan CorelDRAW", "Telaten"],
};

export const makePlan = (id: Plan["id"], overrides: Partial<Plan> = {}): Plan => ({
  id,
  title: `Plan ${id}: Jalur desain`,
  tagline: "Belajar mandiri sambil membangun portofolio.",
  approach: "Ikuti kursus UX gratis, kerjakan tiga studi kasus, lalu lamar magang remote.",
  whyFits: "Cocok dengan jadwal malam dan biaya terbatas.",
  duration: "6–9 bulan",
  costLevel: "rendah",
  milestones: ["Selesai kursus dasar UX", "Tiga studi kasus di portofolio"],
  tradeoff: "Butuh disiplin tinggi karena tanpa mentor tetap.",
  ...overrides,
});

export const plans: Plan[] = [makePlan("A"), makePlan("B"), makePlan("C")];

export const draft: Draft = {
  message: "Ini tiga pilihan jalur yang bisa kamu pertimbangkan.",
  profile,
  plans,
};

export const makeStep = (n: number, overrides: Partial<Step> = {}): Step => ({
  id: `s${n}`,
  title: `Langkah ${n}`,
  description: "Pelajari dasar riset pengguna dan wireframe.",
  why: "Fondasi sebelum membuat studi kasus.",
  weeks: 3,
  todos: ["Tonton modul 1", "Buat catatan ringkas"],
  resourceIds: ["google-ux-design"],
  skills: ["Riset pengguna"],
  ...overrides,
});

export const roadmap: Roadmap = {
  title: "Roadmap menjadi UI/UX designer",
  summary: "Empat tahap dari dasar desain sampai melamar magang remote.",
  steps: [1, 2, 3, 4].map((n) => makeStep(n)),
};

/** Output AI #1: langkah + kebutuhan sumber (tanpa resourceIds). */
export const makeStepDraft = (n: number, overrides: Partial<StepDraft> = {}): StepDraft => {
  const { resourceIds: _ignored, ...base } = makeStep(n);
  void _ignored;
  return { ...base, needs: [{ type: "sertifikasi", keywords: ["ux", "desain"] }], ...overrides };
};

export const roadmapDraft: RoadmapDraft = {
  title: "Roadmap menjadi UI/UX designer",
  summary: "Empat tahap dari dasar desain sampai melamar magang remote.",
  steps: [
    makeStepDraft(1),
    makeStepDraft(2, { needs: [{ type: "kursus", keywords: ["desain", "konten"] }] }),
    makeStepDraft(3, { needs: [] }),
    makeStepDraft(4, { needs: [{ type: "program", keywords: ["magang", "pengalaman"] }] }),
  ],
};
