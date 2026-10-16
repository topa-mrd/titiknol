import type { AuthError, PostgrestError, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./supabase/client";
import { z } from "zod";
import { SAMPLE_OPPORTUNITIES } from "./opportunities";
import { SAMPLE_STORIES, type Story } from "./stories";
import {
  ADMIN_APPLICATION_STATUSES,
  AdminResourcePatchSchema,
  ApplicationInputSchema,
  ApplicationSchema,
  OpportunityInputSchema,
  OpportunitySchema,
  ORG_APPLICATION_STATUSES,
  OrganizationInputSchema,
  OrganizationSchema,
  VISIBLE_TO_ORG,
  AdminResourceSchema,
  CatalogLinkSchema,
  EMPTY_COSTS,
  EMPTY_PROGRESS,
  ProgressSchema,
  ProjectInterestRowSchema,
  RoadmapCostsSchema,
  RoadmapRowSchema,
  STORY_KINDS,
  StoryInputSchema,
  StoryRowSchema,
  type AdminResource,
  type Application,
  type ApplicationInput,
  type ApplicationStatus,
  type Opportunity,
  type OpportunityInput,
  type OpportunityReview,
  type Organization,
  type OrganizationInput,
  type AdminResourcePatch,
  type CatalogLink,
  type Plan,
  type Profile,
  type ReviewStatus,
  type Progress,
  type ProjectInterestRow,
  type ProjectStatus,
  type ResolvedStep,
  type RoadmapCosts,
  type RoadmapRow,
  type StoryInput,
  type StoryKind,
  type StoryStatus,
} from "./types";

export type { Story } from "./stories";

/**
 * Satu-satunya lapisan data di client.
 * - Mode "supabase": Supabase Auth + tabel ber-RLS.
 * - Mode "demo" (env Supabase kosong): akun demo + localStorage, perilakunya
 *   meniru RLS (hanya melihat data milik pengguna yang sedang masuk).
 * Semua error dilempar sebagai StoreError dengan pesan siap tampil.
 */

export type StoreMode = "supabase" | "demo";
export type AppUser = { id: string; email: string | null; name: string; mode: StoreMode };
export type NewRoadmap = {
  title: string;
  summary: string;
  dream: string;
  profile: Profile;
  plan: Plan;
  steps: ResolvedStep[];
};

export class StoreError extends Error {
  constructor(
    message: string,
    readonly code: "auth" | "network" | "not-found" | "invalid" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export const storeMode = (): StoreMode => (getSupabaseBrowserClient() ? "supabase" : "demo");

// ───────────────────────── Mode demo (localStorage) ─────────────────────────

const DEMO_USER_KEY = "titiknol:demo:user";
const DEMO_ROADMAPS_KEY = "titiknol:demo:roadmaps";
const DEMO_INTERESTS_KEY = "titiknol:demo:interests";
const DEMO_STORIES_KEY = "titiknol:demo:stories";
const AUTH_EVENT = "titiknol:auth-change";

function demoStorage(): Storage {
  try {
    return window.localStorage;
  } catch {
    throw new StoreError(
      "Browser tidak mengizinkan penyimpanan data. Matikan mode penyamaran atau izinkan penyimpanan situs.",
      "invalid",
    );
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = demoStorage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    demoStorage().setItem(key, JSON.stringify(value));
  } catch {
    throw new StoreError("Penyimpanan browser penuh atau diblokir. Hapus data situs lain lalu coba lagi.", "invalid");
  }
}

function demoUser(): AppUser | null {
  const raw = readJson<{ id?: unknown; name?: unknown } | null>(DEMO_USER_KEY, null);
  if (!raw || typeof raw.id !== "string") return null;
  return { id: raw.id, email: null, name: typeof raw.name === "string" ? raw.name : "Teman TitikNol", mode: "demo" };
}

function demoRows(): RoadmapRow[] {
  const raw = readJson<unknown[]>(DEMO_ROADMAPS_KEY, []);
  return Array.isArray(raw)
    ? raw.flatMap((row) => {
        const parsed = RoadmapRowSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
}

const emitAuthChange = () => window.dispatchEvent(new Event(AUTH_EVENT));

function requireDemoUser(): AppUser {
  const user = demoUser();
  if (!user) throw new StoreError("Kamu perlu masuk dulu untuk menyimpan roadmap.", "auth");
  return user;
}

// ───────────────────────── Mode Supabase ─────────────────────────

function toAppUser(user: User): AppUser {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name.trim()) ||
    (typeof meta.name === "string" && meta.name.trim()) ||
    user.email?.split("@")[0] ||
    "Teman TitikNol";
  return { id: user.id, email: user.email ?? null, name, mode: "supabase" };
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email atau password salah. Periksa lagi, atau daftar dulu kalau belum punya akun.",
  user_already_exists: "Email ini sudah terdaftar. Silakan masuk.",
  email_exists: "Email ini sudah terdaftar. Silakan masuk.",
  weak_password: "Password terlalu lemah. Pakai minimal 8 karakter dengan campuran huruf dan angka.",
  email_not_confirmed: "Email belum dikonfirmasi. Buka tautan konfirmasi di kotak masukmu, lalu masuk lagi.",
  over_email_send_rate_limit: "Terlalu banyak email dikirim. Tunggu beberapa menit lalu coba lagi.",
  over_request_rate_limit: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
  email_address_invalid: "Alamat email tidak valid. Periksa penulisannya.",
  validation_failed: "Email atau password tidak valid. Periksa penulisannya.",
  signup_disabled: "Pendaftaran akun baru sedang ditutup.",
  provider_disabled: "Metode login ini belum diaktifkan. Pakai email dan password dulu.",
};

function authError(error: AuthError): StoreError {
  const byCode = error.code ? AUTH_MESSAGES[error.code] : undefined;
  if (byCode) return new StoreError(byCode, "auth");
  const msg = error.message ?? "";
  if (/provider is not enabled|unsupported provider/i.test(msg)) return new StoreError(AUTH_MESSAGES.provider_disabled, "auth");
  if (/invalid login credentials/i.test(msg)) return new StoreError(AUTH_MESSAGES.invalid_credentials, "auth");
  if (/password should be at least/i.test(msg)) return new StoreError("Password minimal 6 karakter.", "auth");
  if (/fetch|network/i.test(msg)) return networkError();
  return new StoreError("Login gagal karena kendala server. Coba lagi sebentar lagi.", "auth");
}

const networkError = () =>
  new StoreError("Tidak bisa terhubung ke server. Periksa internetmu lalu coba lagi.", "network");

function dbError(error: PostgrestError | null, action: string): StoreError {
  const msg = error?.message ?? "";
  if (error?.code === "PGRST301" || error?.code === "42501" || /jwt/i.test(msg)) {
    return new StoreError("Sesi login sudah berakhir. Masuk lagi untuk melanjutkan.", "auth");
  }
  if (/fetch|network/i.test(msg)) return networkError();
  return new StoreError(`Gagal ${action}. Coba lagi sebentar lagi.`, "unknown");
}

function parseRow(data: unknown): RoadmapRow {
  const parsed = RoadmapRowSchema.safeParse(data);
  if (!parsed.success) throw new StoreError("Data roadmap rusak atau tidak lengkap.", "invalid");
  return parsed.data;
}

const ROADMAP_COLUMNS = "id, user_id, title, summary, dream, profile, plan, steps, progress, costs, created_at, updated_at";

async function requireSupabaseUser() {
  const supabase = getSupabaseBrowserClient()!;
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new StoreError("Kamu perlu masuk dulu untuk menyimpan roadmap.", "auth");
  return { supabase, user: data.session.user };
}

// ───────────────────────── Auth ─────────────────────────

export async function getUser(): Promise<AppUser | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return demoUser();
  const { data } = await supabase.auth.getSession();
  return data.session ? toAppUser(data.session.user) : null;
}

/** Berlangganan perubahan login (termasuk dari tab lain). Mengembalikan fungsi berhenti. */
export function onAuthChange(callback: (user: AppUser | null) => void): () => void {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session ? toAppUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }
  const notify = () => callback(demoUser());
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === DEMO_USER_KEY) notify();
  };
  window.addEventListener(AUTH_EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(AUTH_EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
}

export async function signInWithEmail(email: string, password: string): Promise<AppUser> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new StoreError("Login email aktif setelah Supabase dikonfigurasi. Pakai akun demo dulu.", "auth");
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw authError(error);
    return toAppUser(data.user);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
): Promise<{ user: AppUser | null; needsConfirmation: boolean }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new StoreError("Pendaftaran aktif setelah Supabase dikonfigurasi. Pakai akun demo dulu.", "auth");
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() || undefined },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw authError(error);
    // Saat konfirmasi email aktif, Supabase menyamarkan email terdaftar sebagai sukses tanpa identitas.
    if (data.user && data.user.identities?.length === 0) throw new StoreError(AUTH_MESSAGES.user_already_exists, "auth");
    return { user: data.session ? toAppUser(data.session.user) : null, needsConfirmation: !data.session };
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Mengarahkan browser ke Google; kembali lewat /auth/callback lalu ke `next`. */
export async function signInWithGoogle(next: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new StoreError("Login Google aktif setelah Supabase dikonfigurasi. Pakai akun demo dulu.", "auth");
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) throw authError(error);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Akun demo lokal, hanya tersedia saat Supabase belum dikonfigurasi. */
export async function signInDemo(name: string): Promise<AppUser> {
  if (getSupabaseBrowserClient()) throw new StoreError("Akun demo tidak tersedia di mode online.", "auth");
  const existing = demoUser();
  const user = { id: existing?.id ?? crypto.randomUUID(), name: name.trim() || "Teman TitikNol" };
  writeJson(DEMO_USER_KEY, user);
  emitAuthChange();
  return { ...user, email: null, mode: "demo" };
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    await supabase.auth.signOut().catch(() => undefined);
    return;
  }
  demoStorage().removeItem(DEMO_USER_KEY);
  emitAuthChange();
}

// ───────────────────────── Roadmap ─────────────────────────

export async function createRoadmap(input: NewRoadmap): Promise<RoadmapRow> {
  const payload = { ...input, dream: input.dream.slice(0, 600) };
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const now = new Date().toISOString();
    const row = parseRow({
      ...payload,
      id: crypto.randomUUID(),
      user_id: user.id,
      progress: EMPTY_PROGRESS,
      costs: EMPTY_COSTS,
      created_at: now,
      updated_at: now,
    });
    writeJson(DEMO_ROADMAPS_KEY, [...demoRows(), row]);
    return row;
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("roadmaps").insert(payload).select(ROADMAP_COLUMNS).single();
    if (error) throw dbError(error, "menyimpan roadmap");
    return parseRow(data);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** null bila tidak ada atau bukan milik pengguna yang sedang masuk (RLS). */
export async function getRoadmap(id: string): Promise<RoadmapRow | null> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    return demoRows().find((r) => r.id === id && r.user_id === user.id) ?? null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("roadmaps").select(ROADMAP_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw dbError(error, "memuat roadmap");
    return data ? parseRow(data) : null;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function listRoadmaps(): Promise<RoadmapRow[]> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    return demoRows()
      .filter((r) => r.user_id === user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("roadmaps").select(ROADMAP_COLUMNS).order("created_at", { ascending: false });
    if (error) throw dbError(error, "memuat daftar roadmap");
    return (data ?? []).flatMap((row) => {
      const parsed = RoadmapRowSchema.safeParse(row);
      return parsed.success ? [parsed.data] : [];
    });
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function updateRoadmapProgress(id: string, progress: Progress): Promise<RoadmapRow> {
  const clean = ProgressSchema.parse(progress);
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const rows = demoRows();
    const index = rows.findIndex((r) => r.id === id && r.user_id === user.id);
    if (index === -1) throw new StoreError("Roadmap tidak ditemukan.", "not-found");
    rows[index] = { ...rows[index], progress: clean, updated_at: new Date().toISOString() };
    writeJson(DEMO_ROADMAPS_KEY, rows);
    return rows[index];
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("roadmaps").update({ progress: clean }).eq("id", id).select(ROADMAP_COLUMNS).maybeSingle();
    if (error) throw dbError(error, "menyimpan progres");
    if (!data) throw new StoreError("Roadmap tidak ditemukan.", "not-found");
    return parseRow(data);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Simpan pilihan kalkulator biaya (sumber yang diambil, koreksi harga, perkiraan AI). */
export async function updateRoadmapCosts(id: string, costs: RoadmapCosts): Promise<RoadmapRow> {
  const clean = RoadmapCostsSchema.parse(costs);
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const rows = demoRows();
    const index = rows.findIndex((r) => r.id === id && r.user_id === user.id);
    if (index === -1) throw new StoreError("Roadmap tidak ditemukan.", "not-found");
    rows[index] = { ...rows[index], costs: clean, updated_at: new Date().toISOString() };
    writeJson(DEMO_ROADMAPS_KEY, rows);
    return rows[index];
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("roadmaps").update({ costs: clean }).eq("id", id).select(ROADMAP_COLUMNS).maybeSingle();
    if (error) throw dbError(error, "menyimpan kalkulator biaya");
    if (!data) throw new StoreError("Roadmap tidak ditemukan.", "not-found");
    return parseRow(data);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function deleteRoadmap(id: string): Promise<void> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    writeJson(DEMO_ROADMAPS_KEY, demoRows().filter((r) => !(r.id === id && r.user_id === user.id)));
    return;
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { error } = await supabase.from("roadmaps").delete().eq("id", id);
    if (error) throw dbError(error, "menghapus roadmap");
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

// ───────────────────────── Experience: penugasan proyek ─────────────────────────

function parseList<T>(rows: unknown, schema: z.ZodType<T>): T[] {
  return Array.isArray(rows)
    ? rows.flatMap((row) => {
        const parsed = schema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
}

export async function listProjectInterests(): Promise<ProjectInterestRow[]> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    return parseList(readJson(DEMO_INTERESTS_KEY, []), ProjectInterestRowSchema).filter((r) => r.user_id === user.id);
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase
      .from("project_interests")
      .select("user_id, project_id, status, created_at, updated_at");
    if (error) throw dbError(error, "memuat penugasan");
    return parseList(data, ProjectInterestRowSchema);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Terima / batalkan / selesaikan penugasan (upsert per pengguna + proyek). */
export async function setProjectInterest(projectId: string, status: ProjectStatus): Promise<ProjectInterestRow> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const rows = parseList(readJson(DEMO_INTERESTS_KEY, []), ProjectInterestRowSchema);
    const now = new Date().toISOString();
    const existing = rows.find((r) => r.user_id === user.id && r.project_id === projectId);
    const row = ProjectInterestRowSchema.parse({
      user_id: user.id,
      project_id: projectId,
      status,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    writeJson(DEMO_INTERESTS_KEY, [...rows.filter((r) => r !== existing), row]);
    return row;
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase
      .from("project_interests")
      .upsert({ project_id: projectId, status }, { onConflict: "user_id,project_id" })
      .select("user_id, project_id, status, created_at, updated_at")
      .single();
    if (error) throw dbError(error, "menyimpan penugasan");
    return ProjectInterestRowSchema.parse(data);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

// ───────────────────────── Blog & komunitas (Share your story) ─────────────────────────

const StoryItemSchema = StoryRowSchema.extend({ user_id: z.uuid().nullable().default(null) });

/** Kolom yang boleh dibaca publik (anon); user_id hanya untuk yang login. */
const PUBLIC_STORY_COLUMNS = "id, author_name, kind, title, summary, body, tags, contact, status, published_at, created_at";
const OWN_STORY_COLUMNS = `${PUBLIC_STORY_COLUMNS}, user_id`;

const byPublished = (a: Story, b: Story) =>
  (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);

function demoStories(): Story[] {
  return parseList(readJson(DEMO_STORIES_KEY, []), StoryItemSchema);
}

function saveDemoStory(next: Story): Story {
  const rows = demoStories();
  const index = rows.findIndex((r) => r.id === next.id);
  writeJson(DEMO_STORIES_KEY, index === -1 ? [...rows, next] : rows.map((r, i) => (i === index ? next : r)));
  return next;
}

/** Aturan yang sama dengan trigger `stories_guard`, untuk mode demo. */
function guardDemoStory(prev: Story | null, next: Story, admin: boolean): Story {
  let status = next.status;
  if (!prev) status = status === "diturunkan" ? "draf" : status;
  else if (!admin && prev.status === "diturunkan") status = "diturunkan";
  else if (!admin && status === "diturunkan") status = prev.status;
  if (next.kind !== "artikel" && status === "terbit" && !next.contact) {
    throw new StoreError("Mentor dan komunitas wajib mencantumkan kontak supaya bisa dihubungi.", "invalid");
  }
  const publishedNow = status === "terbit" && prev?.status !== "terbit";
  return { ...next, status, published_at: publishedNow ? new Date().toISOString() : next.published_at };
}

function storyError(error: PostgrestError | null, action: string): StoreError {
  if (error?.code === "P0001") return new StoreError(error.message, "invalid");
  return dbError(error, action);
}

async function selectStories(build: (columns: string) => PromiseLike<{ data: unknown; error: PostgrestError | null }>, action: string) {
  const supabase = getSupabaseBrowserClient()!;
  try {
    const { data: session } = await supabase.auth.getSession();
    const { data, error } = await build(session.session ? OWN_STORY_COLUMNS : PUBLIC_STORY_COLUMNS);
    if (error) throw storyError(error, action);
    return parseList(data, StoryItemSchema);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Cerita yang sudah terbit, terbaru dulu. */
export async function listPublishedStories(kinds: readonly StoryKind[] = STORY_KINDS, limit = 100): Promise<Story[]> {
  if (storeMode() === "demo") {
    return demoStories()
      .filter((s) => s.status === "terbit" && kinds.includes(s.kind))
      .sort(byPublished)
      .slice(0, limit);
  }
  const supabase = getSupabaseBrowserClient()!;
  return selectStories(
    (columns) =>
      supabase
        .from("stories")
        .select(columns)
        .eq("status", "terbit")
        .in("kind", [...kinds])
        .order("published_at", { ascending: false })
        .limit(limit),
    "memuat tulisan",
  );
}

/** Satu cerita: publik bila terbit; draf/diturunkan hanya untuk penulis (dan admin). */
export async function getStory(id: string): Promise<Story | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const sample = SAMPLE_STORIES.find((s) => s.id === id);
  if (sample) return sample;
  if (storeMode() === "demo") {
    const user = demoUser();
    const row = demoStories().find((s) => s.id === id);
    return row && (row.status === "terbit" || row.user_id === user?.id) ? row : null;
  }
  const supabase = getSupabaseBrowserClient()!;
  const rows = await selectStories((columns) => supabase.from("stories").select(columns).eq("id", id).limit(1), "memuat tulisan");
  return rows[0] ?? null;
}

/** Semua tulisan milik pengguna, termasuk draf dan yang diturunkan. */
export async function listMyStories(): Promise<Story[]> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    return demoStories()
      .filter((s) => s.user_id === user.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { supabase, user } = await requireSupabaseUser();
  return selectStories(
    (columns) => supabase.from("stories").select(columns).eq("user_id", user.id).order("created_at", { ascending: false }),
    "memuat tulisanmu",
  );
}

/** Buat (tanpa id) atau ubah tulisan sendiri. Status "terbit" langsung tampil publik. */
export async function saveStory(input: StoryInput, id?: string): Promise<Story> {
  const parsed = StoryInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
  const fields = parsed.data;
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const prev = id ? (demoStories().find((s) => s.id === id && s.user_id === user.id) ?? null) : null;
    if (id && !prev) throw new StoreError("Tulisan tidak ditemukan.", "not-found");
    const base: Story = prev ?? {
      id: crypto.randomUUID(),
      user_id: user.id,
      created_at: new Date().toISOString(),
      published_at: null,
      ...fields,
    };
    return saveDemoStory(guardDemoStory(prev, { ...base, ...fields }, false));
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const query = id
      ? supabase.from("stories").update(fields).eq("id", id).select(OWN_STORY_COLUMNS).maybeSingle()
      : supabase.from("stories").insert(fields).select(OWN_STORY_COLUMNS).single();
    const { data, error } = await query;
    if (error) throw storyError(error, fields.status === "terbit" ? "menerbitkan tulisan" : "menyimpan draf");
    const row = StoryItemSchema.safeParse(data);
    if (!row.success) throw new StoreError("Tulisan tidak ditemukan.", "not-found");
    return row.data;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Terbitkan atau tarik kembali jadi draf. Tulisan yang diturunkan admin tetap diturunkan. */
export async function setStoryStatus(id: string, status: "draf" | "terbit"): Promise<Story> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const prev = demoStories().find((s) => s.id === id && s.user_id === user.id);
    if (!prev) throw new StoreError("Tulisan tidak ditemukan.", "not-found");
    return saveDemoStory(guardDemoStory(prev, { ...prev, status }, false));
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("stories").update({ status }).eq("id", id).select(OWN_STORY_COLUMNS).maybeSingle();
    if (error) throw storyError(error, status === "terbit" ? "menerbitkan tulisan" : "menarik tulisan");
    const row = StoryItemSchema.safeParse(data);
    if (!row.success) throw new StoreError("Tulisan tidak ditemukan.", "not-found");
    return row.data;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function deleteStory(id: string): Promise<void> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    writeJson(DEMO_STORIES_KEY, demoStories().filter((r) => !(r.id === id && r.user_id === user.id)));
    return;
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (error) throw dbError(error, "menghapus tulisan");
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export type StoryAdminFilter = "terbit" | "diturunkan" | "semua";

/** Moderasi: tulisan yang terbit dan yang diturunkan (draf tetap privat bagi admin di UI). */
export async function listStoriesForAdmin(filter: StoryAdminFilter): Promise<Story[]> {
  const statuses: StoryStatus[] = filter === "semua" ? ["terbit", "diturunkan"] : [filter];
  if (storeMode() === "demo") {
    requireDemoUser();
    return demoStories().filter((s) => statuses.includes(s.status)).sort(byPublished);
  }
  const { supabase } = await requireSupabaseUser();
  return selectStories(
    (columns) => supabase.from("stories").select(columns).in("status", statuses).order("created_at", { ascending: false }).limit(200),
    "memuat tulisan",
  );
}

/** Admin menurunkan atau menayangkan lagi. Isi tulisan tidak bisa diubah admin. */
export async function moderateStory(id: string, status: "terbit" | "diturunkan"): Promise<Story> {
  if (storeMode() === "demo") {
    requireDemoUser();
    const prev = demoStories().find((s) => s.id === id);
    if (!prev) throw new StoreError("Tulisan tidak ditemukan.", "not-found");
    return saveDemoStory(guardDemoStory(prev, { ...prev, status }, true));
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("stories").update({ status }).eq("id", id).select(OWN_STORY_COLUMNS).maybeSingle();
    if (error) throw storyError(error, "menyimpan moderasi");
    const row = StoryItemSchema.safeParse(data);
    if (!row.success) throw new StoreError("Moderasi tidak tersimpan. Pastikan akunmu terdaftar sebagai admin.", "auth");
    return row.data;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

// ───────────────────────── Katalog: data terbaru & pemeriksaan admin ─────────────────────────

/**
 * Data sumber terbaru untuk id tertentu, agar roadmap tersimpan memakai revisi
 * admin. Sumber yang ditolak admin (nonaktif) tidak ikut kembali. Mode demo
 * tidak punya katalog di database → null (pakai data yang tersimpan di roadmap).
 */
export async function getCatalogLinks(ids: readonly string[]): Promise<CatalogLink[] | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || ids.length === 0) return null;
  try {
    const { data, error } = await supabase
      .from("resources")
      .select("id, title, provider, type, url, cost, origin, review_status")
      .in("id", [...new Set(ids)].slice(0, 100));
    if (error) return null;
    return (data ?? []).flatMap((row) => {
      const parsed = CatalogLinkSchema.safeParse({ ...row, review: (row as { review_status: string }).review_status });
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return null;
  }
}

/** Apakah pengguna yang sedang masuk tercatat di tabel admins. Mode demo: tidak pernah. */
export async function isAdmin(): Promise<boolean> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return false;
  try {
    const { data, error } = await supabase.from("admins").select("user_id").limit(1);
    return !error && (data ?? []).length > 0;
  } catch {
    return false;
  }
}

const ADMIN_RESOURCE_COLUMNS =
  "id, title, provider, type, url, cost, tags, level, note, origin, review_status, source_query, created_at, reviewed_at";

const toAdminResource = (row: Record<string, unknown>): AdminResource | null => {
  const parsed = AdminResourceSchema.safeParse({
    ...row,
    review: row.review_status,
    sourceQuery: row.source_query ?? "",
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
  });
  return parsed.success ? parsed.data : null;
};

export type AdminFilter = ReviewStatus | "semua";

/** Daftar sumber untuk admin (RLS: hanya admin yang melihat sumber nonaktif). */
export async function listResourcesForAdmin(filter: AdminFilter): Promise<AdminResource[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new StoreError("Halaman admin butuh Supabase. Mode demo tidak punya katalog di database.", "invalid");
  await requireSupabaseUser();
  try {
    let query = supabase.from("resources").select(ADMIN_RESOURCE_COLUMNS).order("created_at", { ascending: false }).limit(300);
    if (filter !== "semua") query = query.eq("review_status", filter);
    const { data, error } = await query;
    if (error) throw dbError(error, "memuat katalog");
    return (data ?? []).flatMap((row) => {
      const r = toAdminResource(row as Record<string, unknown>);
      return r ? [r] : [];
    });
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Revisi isi/status sumber oleh admin. Penanda pemeriksa & waktunya diisi otomatis. */
export async function updateResourceByAdmin(id: string, patch: AdminResourcePatch): Promise<AdminResource> {
  const parsed = AdminResourcePatchSchema.safeParse(patch);
  if (!parsed.success) {
    throw new StoreError("Isian belum valid. Cek URL (harus https), judul, dan minimal satu tag.", "invalid");
  }
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new StoreError("Halaman admin butuh Supabase.", "invalid");
  const { user } = await requireSupabaseUser();
  const { review, ...fields } = parsed.data;
  try {
    const { data, error } = await supabase
      .from("resources")
      .update({ ...fields, review_status: review, reviewed_at: new Date().toISOString(), reviewed_by: user.id })
      .eq("id", id)
      .select(ADMIN_RESOURCE_COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error, "menyimpan revisi");
    const row = data ? toAdminResource(data as Record<string, unknown>) : null;
    if (!row) throw new StoreError("Revisi tidak tersimpan. Pastikan akunmu terdaftar sebagai admin.", "auth");
    return row;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

// ───────────────────────── Experience: mitra, lowongan, lamaran ─────────────────────────

const DEMO_ORGS_KEY = "titiknol:demo:orgs";
const DEMO_OPPS_KEY = "titiknol:demo:opportunities";
const DEMO_APPS_KEY = "titiknol:demo:applications";

const nowIso = () => new Date().toISOString();
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;

/** Pesan dari trigger database (P0001 / 42501 / unik) diteruskan apa adanya karena sudah ramah pengguna. */
function experienceError(error: PostgrestError | null, action: string): StoreError {
  if (error?.code === "23505") return new StoreError("Kamu sudah mendaftar ke lowongan ini.", "invalid");
  if (error?.code === "P0001" || (error?.code === "42501" && /tidak diizinkan/.test(error.message))) {
    return new StoreError(error.message, "invalid");
  }
  return dbError(error, action);
}

function invalidInput(issue: { message: string } | undefined): StoreError {
  return new StoreError(issue?.message && !/^Invalid|^Too|^String/.test(issue.message) ? issue.message : "Isian belum lengkap atau tidak valid. Periksa lagi.", "invalid");
}

// ── bentuk baris ↔ objek ──

type OrgRow = {
  id: string;
  owner_id: string;
  name: string;
  kind: string;
  province: string;
  city: string;
  contact_name: string;
  contact: string;
  description: string;
  created_at: string;
};

const fromOrgRow = (r: OrgRow): Organization =>
  OrganizationSchema.parse({
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    kind: r.kind,
    province: r.province,
    city: r.city,
    contactName: r.contact_name,
    contact: r.contact,
    description: r.description ?? "",
    createdAt: r.created_at,
  });

const OPP_COLUMNS =
  "id, org_id, org_name, org_kind, title, category, kind, province, city, remote, description, requirements, stipend, duration, slots, deadline, tags, review_status, admin_note, closed, created_at";

type OppRow = {
  id: string;
  org_id: string;
  org_name: string;
  org_kind: string;
  title: string;
  category: string;
  kind: string;
  province: string | null;
  city: string;
  remote: boolean;
  description: string;
  requirements: string;
  stipend: string;
  duration: string;
  slots: number;
  deadline: string | null;
  tags: string[];
  review_status: string;
  admin_note: string;
  closed: boolean;
  created_at: string;
};

const fromOppRow = (r: OppRow): Opportunity | null => {
  const parsed = OpportunitySchema.safeParse({
    id: r.id,
    orgId: r.org_id,
    orgName: r.org_name,
    orgKind: r.org_kind,
    title: r.title,
    category: r.category,
    kind: r.kind,
    province: r.province,
    city: r.city ?? "",
    remote: r.remote,
    description: r.description,
    requirements: r.requirements ?? "",
    stipend: r.stipend,
    duration: r.duration,
    slots: r.slots,
    deadline: r.deadline,
    tags: r.tags ?? [],
    review: r.review_status,
    adminNote: r.admin_note ?? "",
    closed: r.closed,
    createdAt: r.created_at,
    sample: false,
  });
  return parsed.success ? parsed.data : null;
};

const toOppRow = (o: ReturnType<typeof OpportunityInputSchema.parse>) => ({
  title: o.title,
  category: o.category,
  kind: o.kind,
  province: o.province,
  city: o.city,
  remote: o.remote,
  description: o.description,
  requirements: o.requirements,
  stipend: o.stipend,
  duration: o.duration,
  slots: o.slots,
  deadline: o.deadline,
  tags: o.tags,
});

const APP_COLUMNS =
  "id, opportunity_id, user_id, applicant_name, profile_summary, opportunity_title, org_name, contact, motivation, portfolio_url, cv_url, roadmap_id, status, admin_note, org_note, created_at, updated_at";

type AppRow = {
  id: string;
  opportunity_id: string;
  user_id: string;
  applicant_name: string;
  profile_summary: string;
  opportunity_title: string;
  org_name: string;
  contact: string;
  motivation: string;
  portfolio_url: string | null;
  cv_url: string | null;
  roadmap_id: string | null;
  status: string;
  admin_note: string;
  org_note: string;
  created_at: string;
  updated_at: string;
};

const fromAppRow = (r: AppRow): Application | null => {
  const parsed = ApplicationSchema.safeParse({
    id: r.id,
    opportunityId: r.opportunity_id,
    userId: r.user_id,
    applicantName: r.applicant_name,
    profileSummary: r.profile_summary,
    opportunityTitle: r.opportunity_title,
    orgName: r.org_name,
    contact: r.contact,
    motivation: r.motivation,
    portfolioUrl: r.portfolio_url,
    cvUrl: r.cv_url,
    roadmapId: r.roadmap_id,
    status: r.status,
    adminNote: r.admin_note ?? "",
    orgNote: r.org_note ?? "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });
  return parsed.success ? parsed.data : null;
};

const compact = <T,>(list: (T | null)[]): T[] => list.filter((x): x is T => x !== null);

// ── data demo ──

const demoOrgs = () => parseList(readJson(DEMO_ORGS_KEY, []), OrganizationSchema);
const demoOpps = () => parseList(readJson(DEMO_OPPS_KEY, []), OpportunitySchema);
const demoApps = () => parseList(readJson(DEMO_APPS_KEY, []), ApplicationSchema);
const allDemoOpps = () => [...SAMPLE_OPPORTUNITIES, ...demoOpps()];

function saveDemoApp(next: Application): Application {
  writeJson(DEMO_APPS_KEY, [...demoApps().filter((a) => a.id !== next.id), next]);
  return next;
}

function saveDemoOpp(next: Opportunity): Opportunity {
  writeJson(DEMO_OPPS_KEY, [...demoOpps().filter((o) => o.id !== next.id), next]);
  return next;
}

// ── talenta ──

/**
 * Lowongan yang dibuka (sudah disetujui admin, belum ditutup). Bila database
 * belum punya satu pun, tampilkan lowongan contoh berlabel (tidak bisa didaftar).
 * Mode demo: lowongan contoh + lowongan buatan mitra demo yang sudah disetujui.
 */
export async function listOpenOpportunities(): Promise<{ items: Opportunity[]; samplesOnly: boolean }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const own = demoOpps().filter((o) => o.review === "disetujui" && !o.closed);
    return { items: [...own, ...SAMPLE_OPPORTUNITIES], samplesOnly: false };
  }
  try {
    const { data, error } = await supabase
      .from("opportunities")
      .select(OPP_COLUMNS)
      .eq("review_status", "disetujui")
      .eq("closed", false)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw experienceError(error, "memuat lowongan");
    const items = compact(((data ?? []) as OppRow[]).map(fromOppRow));
    return items.length > 0 ? { items, samplesOnly: false } : { items: [...SAMPLE_OPPORTUNITIES], samplesOnly: true };
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function listMyApplications(): Promise<Application[]> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    return demoApps()
      .filter((a) => a.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { supabase, user } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase
      .from("applications")
      .select(APP_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw experienceError(error, "memuat lamaranmu");
    return compact(((data ?? []) as AppRow[]).map(fromAppRow));
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function applyToOpportunity(input: ApplicationInput): Promise<Application> {
  const parsed = ApplicationInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
  const v = parsed.data;

  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const opp = allDemoOpps().find((o) => o.id === v.opportunityId && o.review === "disetujui" && !o.closed);
    if (!opp) throw new StoreError("Lowongan ini sudah ditutup atau belum dibuka.", "invalid");
    if (demoApps().some((a) => a.userId === user.id && a.opportunityId === v.opportunityId)) {
      throw new StoreError("Kamu sudah mendaftar ke lowongan ini.", "invalid");
    }
    const roadmap = v.roadmapId ? demoRows().find((r) => r.id === v.roadmapId && r.user_id === user.id) : undefined;
    const at = nowIso();
    return saveDemoApp({
      id: newId(),
      opportunityId: opp.id,
      userId: user.id,
      applicantName: user.name,
      profileSummary: roadmap?.summary.slice(0, 600) ?? "",
      opportunityTitle: opp.title,
      orgName: opp.orgName,
      contact: v.contact,
      motivation: v.motivation,
      portfolioUrl: v.portfolioUrl,
      cvUrl: v.cvUrl,
      roadmapId: roadmap ? roadmap.id : null,
      status: "dikirim",
      adminNote: "",
      orgNote: "",
      createdAt: at,
      updatedAt: at,
    });
  }

  const { supabase, user } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase
      .from("applications")
      .insert({
        opportunity_id: v.opportunityId,
        applicant_name: toAppUser(user).name.slice(0, 80),
        contact: v.contact,
        motivation: v.motivation,
        portfolio_url: v.portfolioUrl,
        cv_url: v.cvUrl,
        roadmap_id: v.roadmapId,
      })
      .select(APP_COLUMNS)
      .single();
    if (error) throw experienceError(error, "mengirim pendaftaran");
    const row = fromAppRow(data as AppRow);
    if (!row) throw new StoreError("Pendaftaran tersimpan tapi datanya tidak terbaca. Muat ulang halaman.", "invalid");
    return row;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

async function updateApplication(
  id: string,
  patch: { status?: ApplicationStatus; admin_note?: string; org_note?: string },
  demoCheck: (app: Application, user: AppUser) => boolean,
  action: string,
): Promise<Application> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const app = demoApps().find((a) => a.id === id);
    if (!app || !demoCheck(app, user)) throw new StoreError("Perubahan status lamaran ini tidak diizinkan.", "invalid");
    return saveDemoApp({
      ...app,
      status: patch.status ?? app.status,
      adminNote: patch.admin_note ?? app.adminNote,
      orgNote: patch.org_note ?? app.orgNote,
      updatedAt: nowIso(),
    });
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("applications").update(patch).eq("id", id).select(APP_COLUMNS).maybeSingle();
    if (error) throw experienceError(error, action);
    const row = data ? fromAppRow(data as AppRow) : null;
    if (!row) throw new StoreError("Lamaran tidak ditemukan atau kamu tidak punya akses.", "not-found");
    return row;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Talenta membatalkan lamarannya (hanya sebelum diteruskan ke mitra). */
export function cancelApplication(id: string): Promise<Application> {
  return updateApplication(
    id,
    { status: "dibatalkan" },
    (a, u) => a.userId === u.id && (a.status === "dikirim" || a.status === "diproses"),
    "membatalkan lamaran",
  );
}

// ── mitra ──

export async function getMyOrganization(): Promise<Organization | null> {
  if (storeMode() === "demo") {
    const user = requireDemoUser();
    return demoOrgs().find((o) => o.ownerId === user.id) ?? null;
  }
  const { supabase, user } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("organizations").select("*").eq("owner_id", user.id).maybeSingle();
    if (error) throw experienceError(error, "memuat data mitra");
    return data ? fromOrgRow(data as OrgRow) : null;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function saveMyOrganization(input: OrganizationInput): Promise<Organization> {
  const parsed = OrganizationInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
  const v = parsed.data;

  if (storeMode() === "demo") {
    const user = requireDemoUser();
    const existing = demoOrgs().find((o) => o.ownerId === user.id);
    const org: Organization = { ...v, id: existing?.id ?? newId(), ownerId: user.id, createdAt: existing?.createdAt ?? nowIso() };
    writeJson(DEMO_ORGS_KEY, [...demoOrgs().filter((o) => o.id !== org.id), org]);
    // Nama mitra ikut diperbarui di lowongannya, seperti trigger di database.
    writeJson(DEMO_OPPS_KEY, demoOpps().map((o) => (o.orgId === org.id ? { ...o, orgName: org.name, orgKind: org.kind } : o)));
    return org;
  }

  const { supabase } = await requireSupabaseUser();
  const existing = await getMyOrganization();
  const row = {
    name: v.name,
    kind: v.kind,
    province: v.province,
    city: v.city,
    contact_name: v.contactName,
    contact: v.contact,
    description: v.description,
  };
  try {
    const query = existing
      ? supabase.from("organizations").update(row).eq("id", existing.id).select("*").single()
      : supabase.from("organizations").insert(row).select("*").single();
    const { data, error } = await query;
    if (error) throw experienceError(error, "menyimpan data mitra");
    return fromOrgRow(data as OrgRow);
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function listMyOpportunities(): Promise<Opportunity[]> {
  const org = await getMyOrganization();
  if (!org) return [];
  if (storeMode() === "demo") {
    return demoOpps()
      .filter((o) => o.orgId === org.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const supabase = getSupabaseBrowserClient()!;
  try {
    const { data, error } = await supabase
      .from("opportunities")
      .select(OPP_COLUMNS)
      .eq("org_id", org.id)
      .order("created_at", { ascending: false });
    if (error) throw experienceError(error, "memuat lowonganmu");
    return compact(((data ?? []) as OppRow[]).map(fromOppRow));
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Buat atau ubah lowongan. Lowongan baru/yang isinya diubah selalu menunggu verifikasi admin. */
export async function saveOpportunity(input: OpportunityInput, id?: string): Promise<Opportunity> {
  const parsed = OpportunityInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error.issues[0]);
  const org = await getMyOrganization();
  if (!org) throw new StoreError("Lengkapi data mitra dulu sebelum membuat lowongan.", "invalid");
  const v = parsed.data;

  if (storeMode() === "demo") {
    const existing = id ? demoOpps().find((o) => o.id === id && o.orgId === org.id) : undefined;
    if (id && !existing) throw new StoreError("Lowongan tidak ditemukan.", "not-found");
    return saveDemoOpp({
      ...v,
      id: existing?.id ?? newId(),
      orgId: org.id,
      orgName: org.name,
      orgKind: org.kind,
      review: "menunggu",
      adminNote: existing?.adminNote ?? "",
      closed: existing?.closed ?? false,
      createdAt: existing?.createdAt ?? nowIso(),
      sample: false,
    });
  }

  const supabase = getSupabaseBrowserClient()!;
  try {
    const query = id
      ? supabase.from("opportunities").update(toOppRow(v)).eq("id", id).select(OPP_COLUMNS).single()
      : supabase
          .from("opportunities")
          .insert({ ...toOppRow(v), org_id: org.id })
          .select(OPP_COLUMNS)
          .single();
    const { data, error } = await query;
    if (error) throw experienceError(error, "menyimpan lowongan");
    const row = fromOppRow(data as OppRow);
    if (!row) throw new StoreError("Lowongan tersimpan tapi datanya tidak terbaca. Muat ulang halaman.", "invalid");
    return row;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function setOpportunityClosed(id: string, closed: boolean): Promise<Opportunity> {
  if (storeMode() === "demo") {
    const org = await getMyOrganization();
    const opp = demoOpps().find((o) => o.id === id && o.orgId === org?.id);
    if (!opp) throw new StoreError("Lowongan tidak ditemukan.", "not-found");
    return saveDemoOpp({ ...opp, closed });
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase.from("opportunities").update({ closed }).eq("id", id).select(OPP_COLUMNS).single();
    if (error) throw experienceError(error, closed ? "menutup lowongan" : "membuka lowongan");
    const row = fromOppRow(data as OppRow);
    if (!row) throw new StoreError("Data lowongan tidak terbaca. Muat ulang halaman.", "invalid");
    return row;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

/** Talenta yang sudah diteruskan admin ke lowongan-lowongan milik mitra ini. */
export async function listOrgApplications(): Promise<Application[]> {
  const org = await getMyOrganization();
  if (!org) return [];
  const visible = new Set<string>(VISIBLE_TO_ORG);
  if (storeMode() === "demo") {
    const mine = new Set(demoOpps().filter((o) => o.orgId === org.id).map((o) => o.id));
    return demoApps()
      .filter((a) => mine.has(a.opportunityId) && visible.has(a.status))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const supabase = getSupabaseBrowserClient()!;
  try {
    // RLS sudah membatasi ke lowongan milik mitra dengan status yang terlihat.
    const { data, error } = await supabase
      .from("applications")
      .select(APP_COLUMNS)
      .in("status", [...VISIBLE_TO_ORG])
      .order("updated_at", { ascending: false });
    if (error) throw experienceError(error, "memuat talenta");
    const mine = new Set((await listMyOpportunities()).map((o) => o.id));
    // Admin yang juga mitra bisa membaca semua lamaran; tampilkan hanya milik lowongannya.
    return compact(((data ?? []) as AppRow[]).map(fromAppRow)).filter((a) => mine.has(a.opportunityId));
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function updateApplicationByOrg(id: string, status: ApplicationStatus, orgNote: string): Promise<Application> {
  const org = await getMyOrganization();
  const mine = new Set(demoOpps().filter((o) => o.orgId === org?.id).map((o) => o.id));
  return updateApplication(
    id,
    { status, org_note: orgNote.trim().slice(0, 300) },
    (a) =>
      mine.has(a.opportunityId) &&
      (VISIBLE_TO_ORG as readonly string[]).includes(a.status) &&
      (status === a.status || (ORG_APPLICATION_STATUSES as readonly string[]).includes(status)),
    "memperbarui status talenta",
  );
}

// ── admin ──

/**
 * Bagian admin Experience. Mode demo tidak punya admin sungguhan: siapa pun
 * yang masuk boleh mencoba peran admin di /admin supaya alur lengkap bisa didemokan.
 */
export type AdminOpportunity = Opportunity & { orgContact: string; orgContactName: string };
export type OpportunityAdminFilter = OpportunityReview | "semua";
export type ApplicationAdminFilter = ApplicationStatus | "semua";

export async function listOpportunitiesForAdmin(filter: OpportunityAdminFilter): Promise<AdminOpportunity[]> {
  if (storeMode() === "demo") {
    requireDemoUser();
    const orgs = new Map(demoOrgs().map((o) => [o.id, o]));
    return demoOpps()
      .filter((o) => filter === "semua" || o.review === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => ({ ...o, orgContact: orgs.get(o.orgId)?.contact ?? "", orgContactName: orgs.get(o.orgId)?.contactName ?? "" }));
  }
  const { supabase } = await requireSupabaseUser();
  try {
    let query = supabase
      .from("opportunities")
      .select(`${OPP_COLUMNS}, organizations (contact, contact_name)`)
      .order("created_at", { ascending: false })
      .limit(300);
    if (filter !== "semua") query = query.eq("review_status", filter);
    const { data, error } = await query;
    if (error) throw experienceError(error, "memuat lowongan");
    type Contact = { contact: string; contact_name: string };
    return ((data ?? []) as unknown as (OppRow & { organizations: Contact | Contact[] | null })[]).flatMap((row) => {
      const o = fromOppRow(row);
      // Relasi many-to-one: PostgREST mengembalikan objek; tipe hasil generator menganggapnya array.
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      return o ? [{ ...o, orgContact: org?.contact ?? "", orgContactName: org?.contact_name ?? "" }] : [];
    });
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function reviewOpportunity(id: string, review: OpportunityReview, note: string): Promise<Opportunity> {
  const adminNote = note.trim().slice(0, 300);
  if (storeMode() === "demo") {
    requireDemoUser();
    const opp = demoOpps().find((o) => o.id === id);
    if (!opp) throw new StoreError("Lowongan tidak ditemukan.", "not-found");
    return saveDemoOpp({ ...opp, review, adminNote });
  }
  const { supabase } = await requireSupabaseUser();
  try {
    const { data, error } = await supabase
      .from("opportunities")
      .update({ review_status: review, admin_note: adminNote })
      .eq("id", id)
      .select(OPP_COLUMNS)
      .maybeSingle();
    if (error) throw experienceError(error, "menyimpan verifikasi");
    const row = data ? fromOppRow(data as OppRow) : null;
    if (!row) throw new StoreError("Verifikasi tidak tersimpan. Pastikan akunmu terdaftar sebagai admin.", "auth");
    return row;
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export async function listApplicationsForAdmin(filter: ApplicationAdminFilter): Promise<Application[]> {
  if (storeMode() === "demo") {
    requireDemoUser();
    return demoApps()
      .filter((a) => filter === "semua" || a.status === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { supabase } = await requireSupabaseUser();
  try {
    let query = supabase.from("applications").select(APP_COLUMNS).order("created_at", { ascending: false }).limit(300);
    if (filter !== "semua") query = query.eq("status", filter);
    const { data, error } = await query;
    if (error) throw experienceError(error, "memuat pendaftar");
    return compact(((data ?? []) as AppRow[]).map(fromAppRow));
  } catch (error) {
    throw error instanceof StoreError ? error : networkError();
  }
}

export function updateApplicationByAdmin(id: string, status: ApplicationStatus, adminNote: string): Promise<Application> {
  return updateApplication(
    id,
    { status, admin_note: adminNote.trim().slice(0, 300) },
    (a) => status === a.status || (ADMIN_APPLICATION_STATUSES as readonly string[]).includes(status),
    "memperbarui status pendaftar",
  );
}
