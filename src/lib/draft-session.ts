import { z } from "zod";
import {
  AI_PROVIDERS,
  ChatMessageSchema,
  DraftSchema,
  INPUT_LIMIT,
  PlanIdSchema,
} from "./types";

/**
 * Draf sebelum login, disimpan di localStorage agar tidak hilang saat
 * pindah halaman, refresh, atau redirect login Google.
 */

export const DRAFT_SESSION_KEY = "titiknol:draft:v1";
const CHANGE_EVENT = "titiknol:draft-change";

export const DraftSessionSchema = z.object({
  answers: z.object({
    dream: z.string().max(INPUT_LIMIT),
    background: z.string().max(INPUT_LIMIT),
  }),
  draft: DraftSchema.nullable(),
  meta: z.object({ provider: z.enum(AI_PROVIDERS), fallback: z.boolean() }).nullable(),
  selectedPlanId: PlanIdSchema.nullable(),
  messages: z.array(ChatMessageSchema).max(40),
  roadmapId: z.string().nullable(),
  updatedAt: z.string(),
});
export type DraftSession = z.infer<typeof DraftSessionSchema>;

export const emptyDraftSession = (): DraftSession => ({
  answers: { dream: "", background: "" },
  draft: null,
  meta: null,
  selectedPlanId: null,
  messages: [],
  roadmapId: null,
  updatedAt: new Date(0).toISOString(),
});

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // mode privat/cookie diblokir
  }
}

export function readDraftSession(): DraftSession | null {
  const raw = storage()?.getItem(DRAFT_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = DraftSessionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // JSON rusak → dibuang di bawah
  }
  storage()?.removeItem(DRAFT_SESSION_KEY);
  return null;
}

/** Simpan sebagian isi draf. Mengembalikan false bila penyimpanan tidak tersedia/penuh. */
export function updateDraftSession(patch: Partial<Omit<DraftSession, "updatedAt">>): boolean {
  const store = storage();
  if (!store) return false;
  const next: DraftSession = {
    ...(readDraftSession() ?? emptyDraftSession()),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  try {
    store.setItem(DRAFT_SESSION_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearDraftSession() {
  storage()?.removeItem(DRAFT_SESSION_KEY);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Untuk useSyncExternalStore: berubah saat draf disimpan di tab ini atau tab lain. */
export function subscribeDraftSession(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DRAFT_SESSION_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Snapshot mentah (string) agar perbandingan useSyncExternalStore stabil. */
export function draftSessionSnapshot(): string | null {
  return storage()?.getItem(DRAFT_SESSION_KEY) ?? null;
}
