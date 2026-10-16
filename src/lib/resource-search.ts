import { truncate } from "./ai/normalize";
import {
  LIMITS,
  MAX_PICKS_PER_STEP,
  type Profile,
  type Resource,
  type ResourceLink,
  type ResourceNeed,
  type ResourcePick,
  type ResourceType,
  type ResolvedRoadmap,
  type RoadmapDraft,
  type StepDraft,
} from "./types";

/**
 * Tahap 2 workflow roadmap: dari "kebutuhan sumber" (AI #1) ke sumber nyata di
 * tabel resources. Server menyaring kandidat secara deterministik; AI #2 hanya
 * boleh memilih dari kandidat itu. URL dan harga selalu dari katalog.
 */

export const MAX_CANDIDATES_PER_STEP = 8;
/** Skor minimal agar sebuah sumber dianggap relevan (mis. jenis cocok + satu tag cocok). */
const MIN_SCORE = 5;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Kata/frasa utuh, bukan potongan kata ("ai" tidak cocok dengan "sampai"). */
export function hasWord(text: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (!p) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(p)}($|[^a-z0-9])`).test(text);
}

/** Tag katalog ditulis dengan tanda hubung ("bahasa-inggris"); kata kunci AI biasanya pakai spasi. */
const variants = (s: string) => [...new Set([s, s.replace(/-/g, " "), s.replace(/\s+/g, "-")])];

export type Candidate = { resource: Resource; score: number; matched: string[]; need: ResourceNeed };

export const hasTightBudget = (profile: Profile) =>
  profile.constraints.some((c) => /biaya|uang|dana|ekonomi|finansial/i.test(c));

/** Kata sambung yang tidak bermakna sebagai kata kunci saat frasa dipecah per kata. */
const STOPWORDS = new Set(["dan", "atau", "untuk", "yang", "di", "ke", "dari", "dengan", "the", "and", "of", "for", "to"]);

const tokensOf = (keyword: string) =>
  keyword
    .toLowerCase()
    .split(/[\s/,-]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

function scoreFor(resource: Resource, need: ResourceNeed, context: string, tight: boolean): Candidate | null {
  const haystack = `${resource.title} ${resource.provider} ${resource.note}`.toLowerCase();
  const tagText = resource.tags.join(" ");
  const inTags = (word: string) =>
    variants(word).some((f) => resource.tags.includes(f) || hasWord(tagText, f) || hasWord(tagText.replace(/-/g, " "), f));
  const matched = new Set<string>();
  let score = 0;

  for (const keyword of need.keywords) {
    // Frasa utuh cocok (mis. "bahasa inggris" ↔ tag "bahasa-inggris") = bobot penuh.
    if (inTags(keyword) || variants(keyword).some((f) => hasWord(haystack, f))) {
      matched.add(keyword);
      score += 3;
      continue;
    }
    // AI sering menulis frasa ("ui ux design"): cocokkan per kata dengan bobot lebih kecil.
    const tokens = tokensOf(keyword);
    const tagHits = tokens.filter(inTags).length;
    const textHits = tokens.filter((t) => !inTags(t) && hasWord(haystack, t)).length;
    if (tagHits + textHits > 0) {
      matched.add(keyword);
      score += Math.min(3, tagHits * 2 + textHits);
    }
  }
  if (matched.size === 0) return null;

  if (resource.type === need.type) score += 4;
  // Konteks langkah (judul + skill) memperkuat sumber yang tag-nya ikut disebut.
  score += resource.tags.filter((tag) => variants(tag).some((f) => hasWord(context, f))).length;
  if (tight) score += resource.cost === "Gratis" ? 2 : resource.cost === "Berbayar" ? -2 : 0;

  return score >= MIN_SCORE ? { resource, score, matched: [...matched], need } : null;
}

/** Kandidat sumber untuk satu langkah, diurutkan dari yang paling relevan. */
export function findCandidates(step: StepDraft, catalog: readonly Resource[], profile: Profile): Candidate[] {
  const tight = hasTightBudget(profile);
  const context = `${step.title} ${step.skills.join(" ")}`.toLowerCase();
  const best = new Map<string, Candidate>();
  for (const need of step.needs) {
    for (const resource of catalog) {
      const candidate = scoreFor(resource, need, context, tight);
      if (candidate && candidate.score > (best.get(resource.id)?.score ?? -Infinity)) best.set(resource.id, candidate);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES_PER_STEP);
}

const TYPE_NOUN: Record<ResourceType, string> = {
  sertifikasi: "sertifikasi",
  kursus: "kursus",
  beasiswa: "beasiswa",
  kampus: "pilihan kampus",
  program: "program",
  ujian: "ujian",
  relawan: "kegiatan relawan",
};

/** Alasan singkat untuk pilihan berbasis aturan (cadangan bila AI #2 tidak tersedia). */
export function ruleReason(candidate: Candidate): string {
  const topic = candidate.matched.slice(0, 3).join(", ");
  const free = candidate.resource.cost === "Gratis" ? " Gratis." : "";
  return truncate(`Sesuai kebutuhan ${TYPE_NOUN[candidate.need.type]} untuk ${topic}.${free}`, LIMITS.item);
}

/** Pilihan deterministik: kandidat teratas per langkah yang belum dipakai langkah sebelumnya. */
export function rulePicks(candidates: Map<string, Candidate[]>, perStep = 2): ResourcePick[] {
  const used = new Set<string>();
  return [...candidates].flatMap(([stepId, list]) =>
    list
      .filter((c) => !used.has(c.resource.id))
      .slice(0, perStep)
      .map((c) => {
        used.add(c.resource.id);
        return { stepId, resourceId: c.resource.id, reason: ruleReason(c) };
      }),
  );
}

/**
 * Saring pilihan AI #2: hanya langkah yang ada, hanya kandidat langkah itu,
 * maksimal MAX_PICKS_PER_STEP, dan satu sumber hanya di satu langkah (yang
 * pertama) agar roadmap tidak mengulang sumber yang sama. Id karangan dibuang.
 */
export function filterPicks(picks: ResourcePick[], candidates: Map<string, Candidate[]>): ResourcePick[] {
  const used = new Set<string>();
  const perStep = new Map<string, number>();
  const order = [...candidates.keys()];
  return [...picks]
    .sort((a, b) => order.indexOf(a.stepId) - order.indexOf(b.stepId))
    .filter((pick) => {
      const allowed = candidates.get(pick.stepId)?.some((c) => c.resource.id === pick.resourceId);
      const count = perStep.get(pick.stepId) ?? 0;
      if (!allowed || used.has(pick.resourceId) || count >= MAX_PICKS_PER_STEP) return false;
      used.add(pick.resourceId);
      perStep.set(pick.stepId, count + 1);
      return true;
    });
}

const toLink = (r: Resource, reason: string | null): ResourceLink => ({
  id: r.id,
  title: r.title,
  provider: r.provider,
  type: r.type,
  url: r.url,
  cost: r.cost,
  price: r.price,
  reason,
  origin: r.origin,
  review: r.review,
});

/** Gabungkan langkah AI #1 dengan sumber terpilih menjadi roadmap siap simpan. */
export function assembleRoadmap(
  draft: RoadmapDraft,
  picks: ResourcePick[],
  catalog: readonly Resource[],
): ResolvedRoadmap {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  return {
    title: draft.title,
    summary: draft.summary,
    steps: draft.steps.map(({ needs, ...step }) => {
      const chosen = picks.filter((p) => p.stepId === step.id && byId.has(p.resourceId)).slice(0, MAX_PICKS_PER_STEP);
      return {
        ...step,
        needs,
        resourceIds: chosen.map((p) => p.resourceId),
        resources: chosen.map((p) => toLink(byId.get(p.resourceId)!, p.reason)),
      };
    }),
  };
}

/** Kandidat untuk semua langkah, dikunci per id langkah. */
export function candidatesByStep(draft: RoadmapDraft, catalog: readonly Resource[], profile: Profile) {
  return new Map(draft.steps.map((step) => [step.id, findCandidates(step, catalog, profile)]));
}
