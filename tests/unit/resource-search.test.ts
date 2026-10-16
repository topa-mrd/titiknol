import { describe, expect, it } from "vitest";
import { RESOURCES } from "@/lib/resources";
import { filterPicks, findCandidates, hasWord, rulePicks, ruleReason } from "@/lib/resource-search";
import type { ResourceNeed } from "@/lib/types";
import { makeStepDraft, profile } from "../fixtures/data";

const top = (need: ResourceNeed, constraints: string[] = []) =>
  findCandidates(makeStepDraft(1, { needs: [need], title: "Langkah", skills: [] }), RESOURCES, { ...profile, constraints }).map(
    (c) => c.resource.id,
  );

describe("findCandidates", () => {
  it("sertifikasi UX → sertifikat Google UX di urutan teratas", () => {
    expect(top({ type: "sertifikasi", keywords: ["ux", "desain"] })[0]).toBe("google-ux-design");
  });

  it("frasa panjang dari AI asli tetap menemukan sumber yang tepat", () => {
    // Kata kunci persis seperti yang ditulis Gemini dalam uji nyata.
    expect(top({ type: "kursus", keywords: ["ui ux design", "desain produk", "ux research"] })).toContain("google-ux-design");
    expect(top({ type: "sertifikasi", keywords: ["ui ux", "desain produk"] })[0]).toBe("google-ux-design");
  });

  it("ujian bahasa Inggris → tes bahasa resmi", () => {
    const ids = top({ type: "ujian", keywords: ["bahasa inggris", "tes bahasa"] });
    expect(ids.slice(0, 3).sort()).toEqual(["duolingo-english-test", "ielts", "toefl-itp"]);
  });

  it("beasiswa S2 luar negeri → beasiswa, bukan kursus", () => {
    const ids = top({ type: "beasiswa", keywords: ["s2", "luar negeri"] });
    expect(ids).toContain("lpdp");
    for (const id of ids.slice(0, 4)) expect(RESOURCES.find((r) => r.id === id)?.type).toBe("beasiswa");
  });

  it("biaya terbatas → sumber gratis naik", () => {
    const normal = top({ type: "kursus", keywords: ["pemrograman", "web"] });
    const tight = top({ type: "kursus", keywords: ["pemrograman", "web"] }, ["Biaya terbatas"]);
    const cost = (id: string) => RESOURCES.find((r) => r.id === id)!.cost;
    expect(cost(tight[0])).toBe("Gratis");
    expect(tight.indexOf("codepolitan")).toBeGreaterThanOrEqual(normal.indexOf("codepolitan"));
  });

  it("kata kunci yang tidak cocok dengan apa pun → tanpa kandidat", () => {
    expect(top({ type: "kursus", keywords: ["astronomi kuantum"] })).toEqual([]);
  });

  it("tidak mencocokkan potongan kata", () => {
    expect(hasWord("sampai jumpa", "ai")).toBe(false);
    expect(hasWord("belajar ai dasar", "ai")).toBe(true);
  });

  it("alasan aturan menyebut jenis, topik, dan gratis", () => {
    const [candidate] = findCandidates(
      makeStepDraft(1, { needs: [{ type: "kursus", keywords: ["desain"] }] }),
      RESOURCES,
      { ...profile, constraints: ["Biaya terbatas"] },
    );
    expect(ruleReason(candidate)).toMatch(/^Sesuai kebutuhan kursus untuk desain\. Gratis\.$/);
  });
});

describe("satu sumber hanya di satu langkah", () => {
  const ux = { type: "kursus" as const, keywords: ["ui ux", "desain"] };
  const steps = ["s1", "s2", "s3"].map((id, i) => makeStepDraft(i + 1, { needs: [ux] }));
  const candidates = new Map(steps.map((s) => [s.id, findCandidates(s, RESOURCES, profile)]));

  it("pilihan AI yang mengulang sumber di langkah berikutnya dibuang", () => {
    const picks = ["s1", "s2", "s3"].map((stepId) => ({ stepId, resourceId: "google-ux-design", reason: "x" }));
    expect(filterPicks(picks, candidates)).toEqual([{ stepId: "s1", resourceId: "google-ux-design", reason: "x" }]);
  });

  it("pilihan berbasis aturan memakai kandidat berikutnya yang belum terpakai", () => {
    // Topik dengan banyak kandidat: tiap langkah tetap dapat sumber, tanpa pengulangan.
    const code = { type: "kursus" as const, keywords: ["pemrograman", "web"] };
    const codeSteps = ["s1", "s2", "s3"].map((id, i) => makeStepDraft(i + 1, { needs: [code] }));
    const codeCandidates = new Map(codeSteps.map((s) => [s.id, findCandidates(s, RESOURCES, profile)]));
    const picks = rulePicks(codeCandidates);
    const ids = picks.map((p) => p.resourceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(picks.map((p) => p.stepId))).toEqual(new Set(["s1", "s2", "s3"]));
  });

  it("bila kandidat relevan habis, langkah berikutnya dibiarkan kosong (tidak diisi asal)", () => {
    const ids = rulePicks(candidates).map((p) => p.resourceId);
    expect(new Set(ids).size).toBe(ids.length);
    const relevant = new Set([...candidates.values()].flat().map((c) => c.resource.id));
    expect(ids.length).toBe(Math.min(relevant.size, 6));
  });
});

describe("filterPicks", () => {
  const step = makeStepDraft(1, { needs: [{ type: "sertifikasi", keywords: ["ux", "desain"] }] });
  const candidates = new Map([["s1", findCandidates(step, RESOURCES, profile)]]);

  it("membatasi 3 per langkah dan membuang duplikat", () => {
    const allowed = candidates.get("s1")!.map((c) => c.resource.id);
    const picks = [...allowed, allowed[0]].map((resourceId) => ({ stepId: "s1", resourceId, reason: "x" }));
    const kept = filterPicks(picks, candidates);
    expect(kept).toHaveLength(Math.min(3, allowed.length));
    expect(new Set(kept.map((p) => p.resourceId)).size).toBe(kept.length);
  });
});
