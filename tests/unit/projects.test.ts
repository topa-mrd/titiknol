import { describe, expect, it } from "vitest";
import { mockDraft, mockRoadmap } from "@/lib/ai/mock";
import { assembleRoadmap, candidatesByStep, rulePicks } from "@/lib/resource-search";
import { PROJECTS, STRONG_MATCH, rankProjects } from "@/lib/projects";
import { RESOURCES } from "@/lib/resources";
import { EMPTY_COSTS, EMPTY_PROGRESS, SLUG_PATTERN, type RoadmapRow } from "@/lib/types";

function roadmapFor(dream: string, background = ""): RoadmapRow {
  const draft = mockDraft({ dream, background });
  const plan = draft.plans[0];
  const roadmapDraft = mockRoadmap(draft.profile, plan);
  const roadmap = assembleRoadmap(roadmapDraft, rulePicks(candidatesByStep(roadmapDraft, RESOURCES, draft.profile)), RESOURCES);
  return {
    ...roadmap,
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000002",
    dream: draft.profile.dream,
    profile: draft.profile,
    plan,
    progress: EMPTY_PROGRESS,
    costs: EMPTY_COSTS,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
  };
}

describe("proyek contoh", () => {
  it("id unik, berupa slug, dan semua organisasi ditandai contoh", () => {
    const ids = PROJECTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROJECTS) {
      expect(p.id).toMatch(SLUG_PATTERN);
      expect(p.organization).toMatch(/\(contoh\)$/);
      expect([2, 4]).toContain(p.teamSize);
    }
  });
});

describe("rankProjects", () => {
  it("tanpa roadmap → urutan asli tanpa skor", () => {
    const ranked = rankProjects(PROJECTS, null);
    expect(ranked.map((r) => r.project.id)).toEqual(PROJECTS.map((p) => p.id));
    expect(ranked.every((r) => r.score === 0)).toBe(true);
  });

  it("desainer → proyek desain di atas, dengan alasan kecocokan", () => {
    const [top] = rankProjects(PROJECTS, roadmapFor("Aku ingin jadi desainer grafis"));
    expect(top.project.tags).toContain("desain");
    expect(top.matched).toContain("desain");
  });

  it("hanya proyek yang benar-benar relevan mendapat kecocokan kuat", () => {
    const ranked = rankProjects(PROJECTS, roadmapFor("Aku ingin jadi desainer grafis"));
    const chatbot = ranked.find((r) => r.project.id === "chatbot-faq-sekolah")!;
    expect(chatbot.matched).not.toContain("pemrograman"); // "Software desain" bukan pemrograman
    expect(ranked.filter((r) => r.score >= STRONG_MATCH).length).toBeLessThan(PROJECTS.length);
  });

  it("programmer → proyek pemrograman di atas", () => {
    const [top] = rankProjects(PROJECTS, roadmapFor("Mau jadi programmer web"));
    expect(top.project.tags).toContain("pemrograman");
  });

  it("calon guru → proyek pendidikan di atas", () => {
    const [top] = rankProjects(PROJECTS, roadmapFor("Ingin jadi guru SD"));
    expect(top.project.tags).toContain("pendidikan");
  });

  it("kata kunci tidak cocok sebagai potongan kata (mis. 'ai' di 'sampai')", () => {
    const base = roadmapFor("Ingin jadi guru SD");
    const onlySampai: RoadmapRow = {
      ...base,
      dream: "Aku ingin sampai di puncak karier",
      title: "Roadmap sampai tujuan",
      plan: { ...base.plan, title: "Jalur pelan", approach: "Belajar pelan-pelan sampai bisa." },
      steps: base.steps.map((s) => ({ ...s, title: "Langkah", skills: [], resourceIds: [], resources: [] })),
    };
    const chatbot = rankProjects(PROJECTS, onlySampai).find((r) => r.project.id === "chatbot-faq-sekolah")!;
    expect(chatbot.matched).toEqual([]);
  });
});
