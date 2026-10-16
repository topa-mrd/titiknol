import type { ZodType } from "zod";
import { getCatalog } from "../catalog";
import { assembleRoadmap, candidatesByStep, filterPicks, rulePicks } from "../resource-search";
import { searchWebResources, type SearchResult } from "../server/web-search";
import { resolveSiteUrl } from "../site";
import {
  DraftSchema,
  RefineSchema,
  ResourcePicksSchema,
  RoadmapDraftSchema,
  StoryDraftSchema,
  TranscriptSchema,
  type AiProvider,
  type ChatMessage,
  type Draft,
  type DraftRequest,
  type Plan,
  type Profile,
  type Refine,
  type Resource,
  type ResourceNeed,
  type ResourcePicks,
  type ResolvedRoadmap,
  type RoadmapDraft,
  type StoryDraft,
  type StoryDraftRequest,
  type TranscribeRequest,
  type Transcript,
} from "../types";
import { mockDraft, mockRefine, mockRoadmap, mockStory } from "./mock";
import {
  extractJson,
  normalizeDraft,
  normalizePicks,
  normalizeRefine,
  normalizeRoadmapDraft,
  normalizeStoryDraft,
  normalizeTranscript,
} from "./normalize";
import { draftPrompt, refinePrompt, resourcePickPrompt, retryNote, roadmapPrompt, storyPrompt, transcribePrompt } from "./prompts";
import { ProviderError, buildTargets, callTarget, readAiConfig, type Prompt } from "./providers";

/**
 * Satu-satunya pintu output AI:
 *   panggil model → ekstrak JSON → normalize → zod → retry (maks 3) → fallback mock.
 * Error HTTP 429/404/5xx/timeout → model berikutnya; 401/403/key invalid → provider dihentikan.
 */

export const MAX_ATTEMPTS = 3;
export const DEADLINE_MS = 50_000;
/** Roadmap: AI #1 boleh memakai paling lama ini; sisanya untuk AI #2 (memilih sumber). */
export const ROADMAP_STAGE1_MS = 28_000;
/** Pencarian web Gemini (paralel) tidak boleh lebih dari ini; sisanya untuk AI #2. */
export const WEB_SEARCH_MAX_MS = 18_000;
/** AI #2 tidak dimulai bila sisa waktu kurang dari ini; langsung pakai pilihan berbasis aturan. */
const MIN_STAGE2_MS = 6_000;
const PER_CALL_TIMEOUT_MS = 30_000;
/** Jangan memulai panggilan baru bila sisa waktu kurang dari ini. */
const MIN_CALL_BUDGET_MS = 3_000;

export type AiResult<T> = { data: T; provider: AiProvider; model: string | null; fallback: boolean };

export type AiDeps = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  now: () => number;
  deadlineMs: number;
  catalog: () => Promise<readonly Resource[]>;
  webSearch: (
    needs: readonly ResourceNeed[],
    opts: { location: string | null; budgetMs: number },
    base: Pick<AiDeps, "env" | "fetch" | "now" | "catalog">,
  ) => Promise<SearchResult>;
};

export class AiUnavailableError extends Error {
  constructor() {
    super("Layanan AI sedang tidak bisa dihubungi.");
    this.name = "AiUnavailableError";
  }
}

const defaults = (): AiDeps => ({
  env: process.env,
  fetch: globalThis.fetch,
  now: Date.now,
  deadlineMs: DEADLINE_MS,
  catalog: () => getCatalog(),
  webSearch: (needs, opts, base) =>
    searchWebResources(needs, opts, { env: base.env, fetch: base.fetch, now: base.now, catalog: base.catalog }),
});

type Task<T> = {
  name: string;
  prompt: Prompt;
  normalize: (raw: unknown) => unknown;
  schema: ZodType<T>;
  mock: () => T;
  /**
   * true = cadangan selalu dipakai bila AI gagal, walau AI_FALLBACK_TO_MOCK=false.
   * Hanya untuk cadangan yang berisi data asli (mis. pilihan sumber dari database), bukan jawaban tiruan.
   */
  alwaysFallback?: boolean;
  /** true = tidak ada jawaban tiruan yang jujur (mis. transkripsi): mode demo & kegagalan → AiUnavailableError. */
  noMock?: boolean;
};

function describeIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.map(String).join(".") || "(akar)"}: ${issue.message}`)
    .join("; ");
}

async function run<T>(task: Task<T>, deps: AiDeps): Promise<AiResult<T>> {
  const config = readAiConfig(deps.env);
  if (config.provider === "mock") {
    if (task.noMock) throw new AiUnavailableError();
    return { data: task.mock(), provider: "mock", model: null, fallback: false };
  }

  const deadline = deps.now() + deps.deadlineMs;
  const stopped = new Set<string>();
  const siteUrl = resolveSiteUrl(deps.env).origin;
  let attemptsLeft = MAX_ATTEMPTS;
  let issues: string | null = null;

  targets: for (const target of buildTargets(config)) {
    if (stopped.has(target.provider)) continue;

    while (attemptsLeft > 0) {
      const remaining = deadline - deps.now();
      if (remaining < MIN_CALL_BUDGET_MS) break targets;

      const prompt = issues ? { ...task.prompt, user: task.prompt.user + retryNote(issues) } : task.prompt;
      let text: string;
      try {
        text = await callTarget(config, target, prompt, {
          fetch: deps.fetch,
          signal: AbortSignal.timeout(Math.min(remaining, PER_CALL_TIMEOUT_MS)),
          siteUrl,
        });
      } catch (error) {
        const kind = error instanceof ProviderError ? error.kind : "next-model";
        if (kind === "stop-provider") stopped.add(target.provider);
        console.warn(
          `[ai:${task.name}] ${target.provider}/${target.model} gagal:`,
          error instanceof Error ? error.message : error,
        );
        continue targets;
      }

      attemptsLeft -= 1;
      try {
        const parsed = task.schema.safeParse(task.normalize(extractJson(text)));
        if (parsed.success) {
          return { data: parsed.data, provider: target.provider, model: target.model, fallback: false };
        }
        issues = describeIssues(parsed.error);
      } catch {
        issues = "output bukan JSON yang valid";
      }
      console.warn(`[ai:${task.name}] ${target.model} output tidak valid (sisa ${attemptsLeft}): ${issues}`);
    }
    break;
  }

  if (task.noMock || (!config.fallbackToMock && !task.alwaysFallback)) throw new AiUnavailableError();
  console.warn(`[ai:${task.name}] semua percobaan gagal, memakai jawaban tiruan`);
  return { data: task.mock(), provider: "mock", model: null, fallback: true };
}

export function generateDraft(input: DraftRequest, deps: Partial<AiDeps> = {}): Promise<AiResult<Draft>> {
  return run(
    {
      name: "draft",
      prompt: draftPrompt(input),
      normalize: normalizeDraft,
      schema: DraftSchema,
      mock: () => mockDraft(input),
    },
    { ...defaults(), ...deps },
  );
}

export function refineDraft(
  profile: Profile,
  plans: Plan[],
  messages: ChatMessage[],
  deps: Partial<AiDeps> = {},
): Promise<AiResult<Refine>> {
  return run(
    {
      name: "refine",
      prompt: refinePrompt(profile, plans, messages),
      normalize: normalizeRefine,
      schema: RefineSchema,
      mock: () => mockRefine(profile, plans, messages),
    },
    { ...defaults(), ...deps },
  );
}

/** Cerita lisan/ketikan → draf tulisan yang bisa diedit pengguna sebelum terbit. */
export function generateStory(input: StoryDraftRequest, deps: Partial<AiDeps> = {}): Promise<AiResult<StoryDraft>> {
  return run(
    {
      name: "story",
      prompt: storyPrompt(input),
      normalize: (raw) => normalizeStoryDraft(raw, input.kind),
      schema: StoryDraftSchema,
      mock: () => mockStory(input),
    },
    { ...defaults(), ...deps },
  );
}

/** Rekaman suara → teks, untuk browser yang tidak punya pengenal suara (Brave, Firefox). */
export function transcribeAudio(input: TranscribeRequest, deps: Partial<AiDeps> = {}): Promise<AiResult<Transcript>> {
  return run(
    {
      name: "transcribe",
      prompt: transcribePrompt(input),
      normalize: normalizeTranscript,
      schema: TranscriptSchema,
      mock: () => ({ text: "" }),
      noMock: true,
    },
    { ...defaults(), ...deps },
  );
}

export type RoadmapResult = AiResult<ResolvedRoadmap> & {
  /** Siapa yang memilih sumber: AI #2, atau aturan pencocokan database (cadangan/mode demo). */
  resourcesBy: "ai" | "aturan";
};

/**
 * Roadmap dalam dua tahap terpisah:
 *  1. AI #1: profil + plan → langkah + kebutuhan sumber (tanpa melihat katalog).
 *  2. Server menyaring kandidat dari tabel resources; AI #2 memilih dari kandidat
 *     itu + alasan. Pilihan di luar kandidat dibuang; URL dan harga dari database.
 */
export async function generateRoadmap(
  profile: Profile,
  plan: Plan,
  deps: Partial<AiDeps> = {},
): Promise<RoadmapResult> {
  const resolved = { ...defaults(), ...deps };
  const startedAt = resolved.now();

  const stage1 = await run<RoadmapDraft>(
    {
      name: "roadmap",
      prompt: roadmapPrompt(profile, plan),
      normalize: normalizeRoadmapDraft,
      schema: RoadmapDraftSchema,
      mock: () => mockRoadmap(profile, plan),
    },
    { ...resolved, deadlineMs: Math.min(resolved.deadlineMs, ROADMAP_STAGE1_MS) },
  );

  // Pencarian web Gemini untuk tiap kebutuhan langkah (cache 30 hari). Hasilnya
  // masuk katalog sebagai "dari web, belum dicek" dan ikut disaring seperti biasa.
  const baseCatalog = await resolved.catalog();
  const searchBudget = Math.min(
    WEB_SEARCH_MAX_MS,
    resolved.deadlineMs - (resolved.now() - startedAt) - MIN_STAGE2_MS,
  );
  const web =
    searchBudget >= MIN_CALL_BUDGET_MS
      ? await resolved
          .webSearch(
            stage1.data.steps.flatMap((s) => s.needs),
            { location: profile.location, budgetMs: searchBudget },
            resolved,
          )
          .catch(() => null)
      : null;
  const known = new Set(baseCatalog.map((r) => r.id));
  const catalog = [...baseCatalog, ...(web?.resources ?? []).filter((r) => !known.has(r.id))];
  const candidates = candidatesByStep(stage1.data, catalog, profile);
  const byRules = (): ResourcePicks => ({ picks: rulePicks(candidates) });
  const remaining = resolved.deadlineMs - (resolved.now() - startedAt);
  const hasCandidates = [...candidates.values()].some((list) => list.length > 0);

  let picks = byRules().picks;
  let resourcesBy: RoadmapResult["resourcesBy"] = "aturan";
  if (stage1.provider !== "mock" && hasCandidates && remaining >= MIN_STAGE2_MS) {
    const candidateResources = new Map(
      [...candidates].map(([stepId, list]) => [stepId, list.map((c) => c.resource)] as const),
    );
    const stage2 = await run<ResourcePicks>(
      {
        name: "sumber",
        prompt: resourcePickPrompt(profile, stage1.data, candidateResources),
        normalize: normalizePicks,
        schema: ResourcePicksSchema,
        mock: byRules,
        alwaysFallback: true,
      },
      { ...resolved, deadlineMs: remaining },
    );
    const aiPicks = filterPicks(stage2.data.picks, candidates);
    if (stage2.provider !== "mock" && aiPicks.length > 0) {
      picks = aiPicks;
      resourcesBy = "ai";
    }
  }

  return { ...stage1, data: assembleRoadmap(stage1.data, picks, catalog), resourcesBy };
}
