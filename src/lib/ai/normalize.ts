import {
  COST_LEVELS,
  INPUT_LIMIT,
  LIMITS,
  MAX_NEEDS_PER_STEP,
  PLAN_IDS,
  RESOURCE_TYPES,
  SLUG_PATTERN,
  type CostLevel,
  type ResourceType,
  type StoryKind,
  EXTRA_CATEGORIES,
  EXTRA_UNITS,
  SAVING_KINDS,
  type ExtraCategory,
  type ExtraUnit,
  type SavingKind,
} from "../types";
import { cleanTags } from "../stories";

/**
 * Merapikan output AI sebelum divalidasi zod. Tujuannya menyelamatkan jawaban
 * yang isinya benar tapi bentuknya meleset (fence markdown, "3 minggu",
 * id plan salah, teks kepanjangan) agar tidak perlu retry.
 * Fungsi di sini tidak pernah melempar kecuali extractJson.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// JSON

/** Ambil objek JSON dari teks model: buang ```json fence, teks pengantar, dan penutup. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^﻿/, "").trim();
  const candidates = [cleaned];

  const fence = cleaned.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(cleaned.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // coba kandidat berikutnya
    }
  }
  throw new SyntaxError("Output AI bukan JSON yang valid");
}

/** snake_case → camelCase secara rekursif (mis. why_fits → whyFits). */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (!isObj(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), camelizeKeys(v)]),
  );
}

/** Beberapa model membungkus jawaban: {"data": {...}} atau {"draft": {...}}. */
function unwrap(value: unknown, expectedKey: string): Obj {
  if (!isObj(value)) return {};
  if (expectedKey in value) return value;
  for (const inner of Object.values(value)) {
    if (isObj(inner) && expectedKey in inner) return inner;
  }
  return value;
}

// Teks & daftar

/** Potong teks di batas kata dan tambahkan elipsis; hasil selalu ≤ max. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,.;:–-]+$/, "")}…`;
}

const TEXT_KEYS = ["text", "title", "judul", "name", "nama", "label", "value", "description"];

/** Ubah nilai apa pun menjadi teks rapi, atau undefined bila kosong. */
export function str(value: unknown, max: number): string | undefined {
  let raw: string | undefined;
  if (typeof value === "string") raw = value;
  else if (typeof value === "number" || typeof value === "boolean") raw = String(value);
  else if (isObj(value)) {
    const key = TEXT_KEYS.find((k) => typeof value[k] === "string");
    raw = key ? (value[key] as string) : undefined;
  }
  const cleaned = raw
    ?.replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned ? truncate(cleaned, max) : undefined;
}

/** Ubah nilai menjadi daftar teks unik, maksimal `maxItems`. String tunggal dipecah per baris. */
export function list(value: unknown, maxItems: number, itemMax: number = LIMITS.item): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\n|;/).map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""))
      : [];
  const out: string[] = [];
  for (const item of items) {
    const text = str(item, itemMax);
    if (text && !out.includes(text)) out.push(text);
    if (out.length === maxItems) break;
  }
  return out;
}

// Nilai khusus

/** "3 minggu" → 3, "2–3 minggu" → 3, "1 bulan" → 4, "10 hari" → 2. Default 2. */
export function weeks(value: unknown): number {
  let n: number | undefined;
  if (typeof value === "number" && Number.isFinite(value)) n = value;
  else if (typeof value === "string") {
    const m = value.toLowerCase().match(/(\d+(?:[.,]\d+)?)(?:\s*(?:-|–|—|s\.?d\.?|sampai|hingga|to)\s*(\d+(?:[.,]\d+)?))?\s*([a-z]*)/);
    if (m) {
      const amount = Number((m[2] ?? m[1]).replace(",", "."));
      const unit = m[3];
      n = /^(bulan|bln|month)/.test(unit) ? amount * 4 : /^(hari|day)/.test(unit) ? amount / 7 : amount;
    }
  }
  if (n === undefined || !Number.isFinite(n)) return 2;
  return Math.min(LIMITS.weeks.max, Math.max(LIMITS.weeks.min, Math.ceil(n - 1e-9)));
}

const COST_ALIASES: Record<string, CostLevel> = {
  gratis: "gratis",
  free: "gratis",
  "tanpa biaya": "gratis",
  nol: "gratis",
  rendah: "rendah",
  murah: "rendah",
  low: "rendah",
  terjangkau: "rendah",
  hemat: "rendah",
  sedang: "sedang",
  menengah: "sedang",
  medium: "sedang",
  moderate: "sedang",
  tinggi: "tinggi",
  mahal: "tinggi",
  high: "tinggi",
};

export function costLevel(value: unknown): CostLevel {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((COST_LEVELS as readonly string[]).includes(key)) return key as CostLevel;
  const alias = Object.keys(COST_ALIASES).find((alias) => key.includes(alias));
  return alias ? COST_ALIASES[alias] : "sedang";
}

const NO_LOCATION = /^(-|—|null|none|n\/a|tidak (?:ada|disebutkan|diketahui)|belum (?:disebutkan|diketahui)|unknown)$/i;

function location(value: unknown): string | null {
  const text = str(value, LIMITS.short);
  return text && !NO_LOCATION.test(text) ? text : null;
}

export function slug(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const s = value.trim().toLowerCase();
  return SLUG_PATTERN.test(s) && s.length <= 64 ? s : undefined;
}

// Bentuk domain

export function normalizeProfile(raw: unknown): unknown {
  const p = isObj(raw) ? raw : {};
  return {
    dream: str(p.dream ?? p.mimpi, LIMITS.dream),
    summary: str(p.summary ?? p.ringkasan, LIMITS.text),
    currentCondition: str(p.currentCondition ?? p.kondisi ?? p.condition, LIMITS.text),
    location: location(p.location ?? p.lokasi ?? p.city ?? p.kota),
    constraints: list(p.constraints ?? p.kendala, LIMITS.list),
    strengths: list(p.strengths ?? p.kekuatan, LIMITS.list),
  };
}

export function normalizePlan(raw: unknown, index: number): unknown {
  const p = isObj(raw) ? raw : {};
  return {
    id: PLAN_IDS[index],
    title: str(p.title ?? p.judul, LIMITS.short),
    tagline: str(p.tagline, LIMITS.tagline),
    approach: str(p.approach ?? p.pendekatan, LIMITS.text),
    whyFits: str(p.whyFits ?? p.alasan, LIMITS.text),
    duration: str(p.duration ?? p.durasi, 60),
    costLevel: costLevel(p.costLevel ?? p.cost ?? p.biaya),
    milestones: list(p.milestones, LIMITS.milestones.max),
    tradeoff: str(p.tradeoff ?? p.kekurangan, LIMITS.text),
  };
}

function plansOf(value: unknown): unknown[] {
  const plans = Array.isArray(value) ? value : isObj(value) ? Object.values(value) : [];
  return plans.slice(0, PLAN_IDS.length).map(normalizePlan);
}

export function normalizeDraft(raw: unknown): unknown {
  const d = unwrap(camelizeKeys(raw), "plans");
  return {
    message: str(d.message ?? d.pesan ?? d.reply, LIMITS.message),
    profile: normalizeProfile(d.profile),
    plans: plansOf(d.plans),
  };
}

export function normalizeRefine(raw: unknown): unknown {
  const d = unwrap(camelizeKeys(raw), "plans");
  return {
    reply: str(d.reply ?? d.message ?? d.balasan, LIMITS.message),
    profile: normalizeProfile(d.profile),
    plans: plansOf(d.plans),
  };
}

const TYPE_ALIASES: Record<string, ResourceType> = {
  certification: "sertifikasi",
  sertifikat: "sertifikasi",
  course: "kursus",
  kelas: "kursus",
  pelatihan: "kursus",
  scholarship: "beasiswa",
  university: "kampus",
  universitas: "kampus",
  kuliah: "kampus",
  exam: "ujian",
  tes: "ujian",
  test: "ujian",
  volunteer: "relawan",
  magang: "program",
  internship: "program",
};

export function resourceType(value: unknown): ResourceType | undefined {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  if ((RESOURCE_TYPES as readonly string[]).includes(key)) return key as ResourceType;
  return TYPE_ALIASES[key];
}

/** Kebutuhan sumber: jenis valid + kata kunci huruf kecil; yang tidak dikenal dibuang. */
function needs(value: unknown): unknown[] {
  const items = Array.isArray(value) ? value : isObj(value) ? [value] : [];
  return items
    .flatMap((raw) => {
      if (!isObj(raw)) return [];
      const type = resourceType(raw.type ?? raw.jenis);
      const keywords = list(raw.keywords ?? raw.kataKunci ?? raw.tags, 6, 40).map((k) => k.toLowerCase());
      return type && keywords.length > 0 ? [{ type, keywords }] : [];
    })
    .slice(0, MAX_NEEDS_PER_STEP);
}

/** Langkah dari AI #1: id dibuat ulang s1..sN, durasi jadi angka, kebutuhan sumber dirapikan. */
export function normalizeStepDraft(raw: unknown, index: number): unknown {
  const s = isObj(raw) ? raw : {};
  return {
    id: `s${index + 1}`,
    title: str(s.title ?? s.judul, LIMITS.short),
    description: str(s.description ?? s.deskripsi, LIMITS.text),
    why: str(s.why ?? s.alasan ?? s.reason, LIMITS.text),
    weeks: weeks(s.weeks ?? s.minggu ?? s.duration ?? s.durasi),
    todos: list(s.todos ?? s.tasks ?? s.todo, LIMITS.todos.max),
    skills: list(s.skills ?? s.keterampilan, LIMITS.list, 60),
    needs: needs(s.needs ?? s.kebutuhan ?? s.resourceNeeds),
  };
}

export function normalizeRoadmapDraft(raw: unknown): unknown {
  const r = unwrap(camelizeKeys(raw), "steps");
  const steps = Array.isArray(r.steps) ? r.steps : [];
  return {
    title: str(r.title ?? r.judul, LIMITS.short),
    summary: str(r.summary ?? r.ringkasan, LIMITS.text),
    steps: steps.slice(0, LIMITS.steps.max).map(normalizeStepDraft),
  };
}

/** Pilihan AI #2: id langkah "1"/"S1"/"langkah 1" → "s1", id sumber huruf kecil. */
export function normalizePicks(raw: unknown): unknown {
  const r = camelizeKeys(raw);
  const items = Array.isArray(r) ? r : isObj(r) && Array.isArray(r.picks) ? r.picks : [];
  return {
    picks: items.flatMap((p) => {
      if (!isObj(p)) return [];
      const stepNumber = String(p.stepId ?? p.step ?? p.langkah ?? "").match(/\d+/)?.[0];
      const resourceId = slug(p.resourceId ?? p.id ?? p.resource);
      const reason = str(p.reason ?? p.alasan, LIMITS.item);
      return stepNumber && resourceId && reason ? [{ stepId: `s${Number(stepNumber)}`, resourceId, reason }] : [];
    }),
  };
}

// Tulisan (Share your story)

const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|id|net|org|co\.id|ac\.id|io|me|ly)(?:\/\S*)?/gi;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const PHONE = /(?:\+?62|\b0)[\s-]?8[\d\s-]{7,15}\d/g;

/** Buang URL, email, dan nomor telepon: kontak hanya dari isian form, bukan dari AI. */
export function scrubContacts(text: string): string {
  return text
    .replace(EMAIL, "")
    .replace(URL_LIKE, "")
    .replace(PHONE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1");
}

const KIND_TAG: Record<StoryKind, string> = { artikel: "cerita", mentor: "mentor", komunitas: "komunitas" };

export function storyTags(value: unknown, kind: StoryKind): string[] {
  const tags = cleanTags(list(value, 8, 40));
  return tags.length > 0 ? tags.slice(0, 4) : [KIND_TAG[kind]];
}

export function normalizeStoryDraft(raw: unknown, kind: StoryKind): unknown {
  const camel = camelizeKeys(raw);
  const key = ["body", "isi", "content", "title", "judul"].find((k) => k in unwrap(camel, k)) ?? "body";
  const d = unwrap(camel, key);
  const text = (value: unknown, max: number) => {
    const s = str(typeof value === "string" ? scrubContacts(value) : value, max);
    return s && s.replace(/\s+/g, "").length > 0 ? s : undefined;
  };
  return {
    title: text(d.title ?? d.judul, LIMITS.story.title)?.replace(/^["“]|["”]$/g, ""),
    summary: text(d.summary ?? d.ringkasan ?? d.excerpt, 200) ?? "",
    body: text(d.body ?? d.isi ?? d.content ?? d.article, LIMITS.story.body),
    tags: storyTags(d.tags ?? d.tag ?? d.label, kind),
  };
}

/** Transkrip: ambil teks dari bentuk apa pun ({text}, {transcript}, string), rapikan spasi. */
export function normalizeTranscript(raw: unknown): unknown {
  const d = typeof raw === "string" ? { text: raw } : unwrap(camelizeKeys(raw), "text");
  return { text: str(d.text ?? d.transcript ?? d.transkrip, INPUT_LIMIT) ?? "" };
}

// Riset biaya besar

export type CostProposal = {
  label: string;
  category: ExtraCategory;
  currency: string;
  min: number;
  max: number;
  unit: ExtraUnit;
  qty: number;
  note: string;
  site: string;
};

const UNIT_ALIASES: [RegExp, ExtraUnit][] = [
  [/tahun|year|annual|annum/i, "per tahun"],
  [/semester|term/i, "per semester"],
  [/bulan|month/i, "per bulan"],
];

const CATEGORY_ALIASES: [RegExp, ExtraCategory][] = [
  [/kuliah|pendidikan|tuition|ukt|spp|education|sekolah/i, "pendidikan"],
  [/hidup|living|kos|sewa|makan|akomodasi/i, "hidup"],
  [/perjalanan|tiket|travel|pesawat|flight/i, "perjalanan"],
  [/dokumen|visa|paspor|asuransi|insurance|legalisasi/i, "dokumen"],
  [/tes|test|ujian|ielts|toefl/i, "tes"],
  [/perangkat|laptop|device|alat/i, "perangkat"],
];

const num = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Domain polos dari "https://www.tudelft.nl/x" atau "tudelft.nl". */
export const bareSite = (value: unknown) =>
  typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split(/[/?#\s]/)[0]
    : "";

/** Usulan biaya dari jawaban model; baris yang tidak lengkap dibuang (tidak pernah melempar). */
export function normalizeCostProposals(raw: unknown): CostProposal[] | null {
  const root = camelizeKeys(raw);
  const list = Array.isArray(root) ? root : isObj(root) ? (root.items ?? root.biaya ?? root.costs) : null;
  if (!Array.isArray(list)) return null;
  const out: CostProposal[] = [];
  for (const entry of list.slice(0, 8)) {
    if (!isObj(entry)) continue;
    const label = str(entry.label ?? entry.nama ?? entry.name, 90);
    let min = num(entry.min ?? entry.minimum);
    let max = num(entry.max ?? entry.maksimum ?? entry.min);
    const site = bareSite(entry.situs ?? entry.site ?? entry.sumber ?? entry.source);
    if (!label || min === null || max === null || !site.includes(".")) continue;
    if (max < min) [min, max] = [max, min];
    if (min < 0) continue;
    const unitText = String(entry.satuan ?? entry.unit ?? "");
    const catText = String(entry.kategori ?? entry.category ?? "");
    const qty = Math.round(num(entry.jumlah ?? entry.qty ?? 1) ?? 1);
    out.push({
      label,
      category: (EXTRA_CATEGORIES as readonly string[]).includes(catText)
        ? (catText as ExtraCategory)
        : (CATEGORY_ALIASES.find(([re]) => re.test(`${catText} ${label}`))?.[1] ?? "lainnya"),
      currency: String(entry.mataUang ?? entry.currency ?? "IDR").trim().toUpperCase().slice(0, 3),
      min,
      max,
      unit: (EXTRA_UNITS as readonly string[]).includes(unitText)
        ? (unitText as ExtraUnit)
        : (UNIT_ALIASES.find(([re]) => re.test(unitText))?.[1] ?? "sekali"),
      qty: Math.min(120, Math.max(1, qty)),
      note: str(entry.catatan ?? entry.note ?? entry.keterangan, 150) ?? "",
      site,
    });
  }
  return out;
}

export type SavingProposal = { title: string; kind: SavingKind; covers: string; requirement: string; site: string };

const SAVING_ALIASES: [RegExp, SavingKind][] = [
  [/beasiswa|scholarship|fellowship/i, "beasiswa"],
  [/gratis|free|tanpa biaya/i, "gratis"],
  [/bantuan|subsidi|keringanan|kip|grant|aid/i, "bantuan"],
];

export function normalizeSavingProposals(raw: unknown): SavingProposal[] | null {
  const root = camelizeKeys(raw);
  const list = Array.isArray(root) ? root : isObj(root) ? (root.opsi ?? root.options ?? root.items) : null;
  if (!Array.isArray(list)) return null;
  const out: SavingProposal[] = [];
  for (const entry of list.slice(0, 6)) {
    if (!isObj(entry)) continue;
    const title = str(entry.judul ?? entry.title ?? entry.nama, 90);
    const site = bareSite(entry.situs ?? entry.site ?? entry.sumber);
    if (!title || !site.includes(".")) continue;
    const kindText = String(entry.jenis ?? entry.kind ?? "");
    out.push({
      title,
      kind: (SAVING_KINDS as readonly string[]).includes(kindText)
        ? (kindText as SavingKind)
        : (SAVING_ALIASES.find(([re]) => re.test(`${kindText} ${title}`))?.[1] ?? "lebih-murah"),
      covers: str(entry.menanggung ?? entry.covers ?? entry.manfaat, 200) ?? "",
      requirement: str(entry.syarat ?? entry.requirement ?? entry.requirements, 200) ?? "",
      site,
    });
  }
  return out;
}
