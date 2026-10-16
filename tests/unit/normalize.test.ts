import { describe, expect, it } from "vitest";
import {
  costLevel,
  extractJson,
  list,
  normalizeDraft,
  normalizePicks,
  normalizeRoadmapDraft,
  str,
  truncate,
  weeks,
} from "@/lib/ai/normalize";
import { DraftSchema, LIMITS, ResourcePicksSchema, RoadmapDraftSchema } from "@/lib/types";
import { draft, makeStepDraft, roadmapDraft } from "../fixtures/data";

describe("extractJson", () => {
  it("membaca JSON murni, ber-fence, dan bertext pengantar", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Berikut hasilnya:\n{"a":{"b":[1,2]}}\nSemoga membantu!')).toEqual({ a: { b: [1, 2] } });
  });

  it("melempar SyntaxError untuk teks tanpa JSON valid", () => {
    expect(() => extractJson("maaf, saya tidak bisa")).toThrow(SyntaxError);
    expect(() => extractJson('{"a": ')).toThrow(SyntaxError);
  });
});

describe("nilai khusus", () => {
  it.each([
    [3, 3],
    ["3 minggu", 3],
    ["2-3 minggu", 3],
    ["2–4 pekan", 4],
    ["1 bulan", 4],
    ["1,5 bulan", 6],
    ["10 hari", 2],
    [2.4, 3],
    [0, 1],
    [400, 52],
    ["entahlah", 2],
    [null, 2],
  ])("weeks(%j) → %i", (input, expected) => {
    expect(weeks(input)).toBe(expected);
  });

  it.each([
    ["murah", "rendah"],
    ["Gratis", "gratis"],
    ["free", "gratis"],
    ["menengah", "sedang"],
    ["mahal", "tinggi"],
    ["cukup terjangkau", "rendah"],
    ["???", "sedang"],
  ])("costLevel(%s) → %s", (input, expected) => {
    expect(costLevel(input)).toBe(expected);
  });
});

describe("teks & daftar", () => {
  it("memotong teks kepanjangan di batas kata dengan elipsis", () => {
    const out = truncate("kata ".repeat(100).trim(), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("str merapikan spasi dan membaca objek {title}", () => {
    expect(str("  halo   dunia  ", 100)).toBe("halo dunia");
    expect(str({ title: "Judul" }, 100)).toBe("Judul");
    expect(str("   ", 100)).toBeUndefined();
  });

  it("list memecah string berpoin, membuang duplikat, dan membatasi jumlah", () => {
    expect(list("- satu\n- dua\n- dua\n3. tiga", 8)).toEqual(["satu", "dua", "tiga"]);
    expect(list(["a", "", null, "b", "c"], 2)).toEqual(["a", "b"]);
  });
});

describe("normalizeDraft", () => {
  it("memaksa id plan A/B/C, memangkas plan ke-4, dan memetakan snake_case", () => {
    const raw = {
      message: draft.message,
      profile: { ...draft.profile, current_condition: "x" },
      plans: [...draft.plans, draft.plans[0]].map((p, i) => ({ ...p, id: String(i + 1) })),
    };
    const out = DraftSchema.parse(normalizeDraft(raw));
    expect(out.plans.map((p) => p.id)).toEqual(["A", "B", "C"]);
    expect(out.profile.currentCondition).toBe("x");
  });

  it("membuka bungkus {data: {...}}", () => {
    expect(DraftSchema.safeParse(normalizeDraft({ data: draft })).success).toBe(true);
  });

  it("memotong teks yang melebihi batas agar lolos skema", () => {
    const long = { ...draft, message: "panjang ".repeat(400) };
    const out = DraftSchema.parse(normalizeDraft(long));
    expect(out.message.length).toBeLessThanOrEqual(LIMITS.message);
  });
});

describe("normalizeRoadmapDraft (AI #1)", () => {
  it("membuat ulang id langkah s1..sN dan mengubah durasi teks ke angka", () => {
    const raw = {
      ...roadmapDraft,
      steps: roadmapDraft.steps.map((s, i) => ({ ...s, id: `langkah-${i}`, weeks: `${i + 1} minggu` })),
    };
    const out = RoadmapDraftSchema.parse(normalizeRoadmapDraft(raw));
    expect(out.steps.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(out.steps.map((s) => s.weeks)).toEqual([1, 2, 3, 4]);
  });

  it("merapikan kebutuhan sumber: alias jenis, huruf kecil, buang yang tak dikenal, maks 2", () => {
    const step = {
      ...makeStepDraft(1),
      needs: [
        { type: "Certification", keywords: ["UX", "Desain"] },
        { type: "planet", keywords: ["x"] },
        { jenis: "tes", kata_kunci: ["IELTS"] },
        { type: "kursus", keywords: ["ekstra"] },
      ],
    };
    const out = RoadmapDraftSchema.parse(normalizeRoadmapDraft({ ...roadmapDraft, steps: [step, ...roadmapDraft.steps.slice(1)] }));
    expect(out.steps[0].needs).toEqual([
      { type: "sertifikasi", keywords: ["ux", "desain"] },
      { type: "ujian", keywords: ["ielts"] },
    ]);
  });

  it("memangkas langkah dan to-do yang kelebihan", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ ...makeStepDraft(i + 1), todos: Array.from({ length: 9 }, (_, j) => `tugas ${j}`) }));
    const out = RoadmapDraftSchema.parse(normalizeRoadmapDraft({ ...roadmapDraft, steps: many }));
    expect(out.steps).toHaveLength(LIMITS.steps.max);
    expect(out.steps[0].todos).toHaveLength(LIMITS.todos.max);
  });
});

describe("normalizePicks (AI #2)", () => {
  it("menerima variasi bentuk id langkah dan membuang yang rusak", () => {
    const out = ResourcePicksSchema.parse(
      normalizePicks({
        picks: [
          { step_id: "S1", resource_id: "LPDP", reason: "Cocok." },
          { langkah: "langkah 2", id: "dicoding", alasan: "Kelas berbahasa Indonesia." },
          { stepId: "s3", resourceId: "https://evil.example", reason: "URL bukan id." },
          { stepId: "s4", resourceId: "ielts" },
        ],
      }),
    );
    expect(out.picks).toEqual([
      { stepId: "s1", resourceId: "lpdp", reason: "Cocok." },
      { stepId: "s2", resourceId: "dicoding", reason: "Kelas berbahasa Indonesia." },
    ]);
  });

  it("menerima array langsung", () => {
    const out = ResourcePicksSchema.parse(normalizePicks([{ stepId: "s1", resourceId: "lpdp", reason: "Ok." }]));
    expect(out.picks).toHaveLength(1);
  });
});
