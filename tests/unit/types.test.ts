import { describe, expect, it } from "vitest";
import {
  DraftSchema,
  LIMITS,
  ProfileSchema,
  ProgressSchema,
  RefineSchema,
  ResolvedRoadmapSchema,
  RoadmapRowSchema,
  RoadmapSchema,
  StoryInputSchema,
  todoKey,
} from "@/lib/types";
import { draft, makePlan, makeStep, profile, roadmap } from "../fixtures/data";

describe("Profile", () => {
  it("menerima lokasi null dan daftar kosong", () => {
    expect(ProfileSchema.safeParse({ ...profile, location: null, constraints: [], strengths: [] }).success).toBe(
      true,
    );
  });

  it("menolak teks kosong dan teks kepanjangan", () => {
    expect(ProfileSchema.safeParse({ ...profile, summary: "   " }).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...profile, dream: "x".repeat(LIMITS.dream + 1) }).success).toBe(false);
  });
});

describe("Draft & Refine", () => {
  it("menerima draf valid", () => {
    expect(DraftSchema.parse(draft)).toEqual(draft);
    expect(RefineSchema.safeParse({ reply: "Sudah kuperbarui.", profile, plans: draft.plans }).success).toBe(true);
  });

  it("mewajibkan tepat tiga plan berurutan A, B, C", () => {
    expect(DraftSchema.safeParse({ ...draft, plans: draft.plans.slice(0, 2) }).success).toBe(false);
    expect(DraftSchema.safeParse({ ...draft, plans: [makePlan("B"), makePlan("A"), makePlan("C")] }).success).toBe(
      false,
    );
    expect(DraftSchema.safeParse({ ...draft, plans: [makePlan("A"), makePlan("A"), makePlan("C")] }).success).toBe(
      false,
    );
  });

  it("membatasi jumlah milestone dan nilai costLevel", () => {
    const one = makePlan("A", { milestones: ["Satu saja"] });
    expect(DraftSchema.safeParse({ ...draft, plans: [one, makePlan("B"), makePlan("C")] }).success).toBe(false);
    const murah = { ...makePlan("A"), costLevel: "murah" };
    expect(DraftSchema.safeParse({ ...draft, plans: [murah, makePlan("B"), makePlan("C")] }).success).toBe(false);
  });
});

describe("Roadmap", () => {
  it("menerima roadmap valid", () => {
    expect(RoadmapSchema.parse(roadmap)).toEqual(roadmap);
  });

  it("membatasi jumlah langkah 4–10", () => {
    expect(RoadmapSchema.safeParse({ ...roadmap, steps: roadmap.steps.slice(0, 3) }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => makeStep(i + 1));
    expect(RoadmapSchema.safeParse({ ...roadmap, steps: eleven }).success).toBe(false);
  });

  it("mewajibkan id langkah berurutan s1..sN", () => {
    const steps = [makeStep(1), makeStep(2), makeStep(4), makeStep(3)];
    expect(RoadmapSchema.safeParse({ ...roadmap, steps }).success).toBe(false);
  });

  it("mewajibkan weeks bilangan bulat dan to-do 1–6", () => {
    const badWeeks = [makeStep(1, { weeks: 2.5 }), makeStep(2), makeStep(3), makeStep(4)];
    expect(RoadmapSchema.safeParse({ ...roadmap, steps: badWeeks }).success).toBe(false);
    const noTodos = [makeStep(1, { todos: [] }), makeStep(2), makeStep(3), makeStep(4)];
    expect(RoadmapSchema.safeParse({ ...roadmap, steps: noTodos }).success).toBe(false);
  });

  it("menolak resourceIds yang bukan slug (mis. URL karangan)", () => {
    const steps = [makeStep(1, { resourceIds: ["https://contoh.com"] }), makeStep(2), makeStep(3), makeStep(4)];
    expect(RoadmapSchema.safeParse({ ...roadmap, steps }).success).toBe(false);
  });

  it("langkah ter-resolve hanya menerima tautan https", () => {
    const link = {
      id: "google-ux-design",
      title: "Google UX Design",
      provider: "Google",
      type: "sertifikasi",
      url: "https://www.coursera.org/professional-certificates/google-ux-design",
      cost: "Bervariasi",
    } as const;
    const resolved = { ...roadmap, steps: roadmap.steps.map((s) => ({ ...s, resources: [link] })) };
    expect(ResolvedRoadmapSchema.safeParse(resolved).success).toBe(true);
    const insecure = {
      ...roadmap,
      steps: roadmap.steps.map((s) => ({ ...s, resources: [{ ...link, url: "javascript:alert(1)" }] })),
    };
    expect(ResolvedRoadmapSchema.safeParse(insecure).success).toBe(false);
  });
});

describe("Progress", () => {
  it("memakai kunci to-do stepId#index", () => {
    expect(todoKey("s2", 0)).toBe("s2#0");
    expect(ProgressSchema.safeParse({ doneSteps: ["s1"], doneTodos: [todoKey("s2", 1)] }).success).toBe(true);
    expect(ProgressSchema.safeParse({ doneSteps: ["langkah-1"], doneTodos: [] }).success).toBe(false);
  });
});

describe("kompatibilitas data lama", () => {
  it("roadmap tersimpan sebelum ada harga/alasan/kalkulator tetap terbaca", () => {
    const old = {
      id: "00000000-0000-4000-8000-000000000001",
      user_id: "00000000-0000-4000-8000-000000000002",
      title: roadmap.title,
      summary: roadmap.summary,
      dream: profile.dream,
      profile,
      plan: makePlan("A"),
      steps: roadmap.steps.map((s) => ({
        ...s,
        resources: [{ id: "lpdp", title: "LPDP", provider: "LPDP", type: "beasiswa", url: "https://lpdp.kemenkeu.go.id/", cost: "Gratis" }],
      })),
      progress: { doneSteps: [], doneTodos: [] },
      created_at: "2026-10-15T00:00:00Z",
      updated_at: "2026-10-15T00:00:00Z",
    };
    const parsed = RoadmapRowSchema.parse(old);
    expect(parsed.costs).toEqual({ items: {}, extras: [], extrasStatus: "belum" });
    expect(parsed.steps[0].needs).toEqual([]);
    expect(parsed.steps[0].resources[0]).toMatchObject({ price: null, reason: null });
  });
});

describe("StoryInput", () => {
  it("memotong spasi dan menegakkan batas panjang", () => {
    const parsed = StoryInputSchema.parse({
      author_name: "  Rina ",
      kind: "artikel",
      title: "Dari Kediri ke remote",
      body: "Cerita perjalananku belajar desain dari nol sampai dapat klien pertama.",
    });
    expect(parsed.author_name).toBe("Rina");
    expect(StoryInputSchema.safeParse({ ...parsed, body: "terlalu pendek" }).success).toBe(false);
    expect(StoryInputSchema.safeParse({ ...parsed, kind: "puisi" }).success).toBe(false);
  });
});
