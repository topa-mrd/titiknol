import { z } from "zod";
import { PROVINCES } from "./regions";

/**
 * Kontrak data TitikNol. Batas panjang di sini dipakai juga oleh
 * lib/ai/normalize.ts (memotong output AI) dan harus sejalan dengan
 * check constraint di supabase/schema.sql.
 */
export const LIMITS = {
  short: 120,
  tagline: 160,
  item: 200,
  text: 600,
  message: 1200,
  dream: 600,
  list: 8,
  milestones: { min: 2, max: 8 },
  steps: { min: 4, max: 10 },
  todos: { min: 1, max: 6 },
  resourceIds: 6,
  weeks: { min: 1, max: 52 },
  story: { author: 80, titleMin: 3, title: 120, bodyMin: 20, body: 5000 },
} as const;

/** Batas cerita lisan/ketikan untuk Share your story (sama dengan batas cerita awal). */
const INPUT_LIMIT_STORY = 4000;

const text = (max: number) => z.string().trim().min(1).max(max);
const list = (max: number, itemMax: number = LIMITS.item) => z.array(text(itemMax)).max(max);

// ───────────────────────── Katalog sumber ─────────────────────────

export const RESOURCE_TYPES = [
  "sertifikasi",
  "kursus",
  "beasiswa",
  "kampus",
  "program",
  "ujian",
  "relawan",
] as const;
export const ResourceTypeSchema = z.enum(RESOURCE_TYPES);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

export const RESOURCE_COSTS = ["Gratis", "Berbayar", "Bervariasi"] as const;
export const ResourceCostSchema = z.enum(RESOURCE_COSTS);
export type ResourceCost = z.infer<typeof ResourceCostSchema>;

export const RESOURCE_LEVELS = ["pemula", "menengah", "lanjut", "semua"] as const;
export const ResourceLevelSchema = z.enum(RESOURCE_LEVELS);
export type ResourceLevel = z.infer<typeof ResourceLevelSchema>;

export const PRICE_UNITS = ["sekali", "per bulan", "per semester"] as const;
export const PriceUnitSchema = z.enum(PRICE_UNITS);
export type PriceUnit = z.infer<typeof PriceUnitSchema>;

/**
 * Perkiraan harga dari situs resmi (dikurasi, bukan dari AI). Rentang rupiah
 * karena harga bisa berbeda per penyelenggara atau mengikuti kurs.
 */
export const PriceSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
    unit: PriceUnitSchema,
    note: z.string().trim().max(160),
    sourceUrl: z.url({ protocol: /^https$/ }).nullable(),
    checkedAt: z.iso.date(),
    /** "kurasi" = dicek manusia; "ai" = hasil pencarian web Gemini, ditampilkan sebagai perkiraan AI. */
    source: z.enum(["kurasi", "ai"]).default("kurasi"),
  })
  .refine((p) => p.max >= p.min, { message: "Harga maksimum lebih kecil dari minimum" });
export type Price = z.infer<typeof PriceSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Asal sumber: dikurasi manusia, atau ditemukan lewat pencarian web Gemini. */
export const RESOURCE_ORIGINS = ["kurasi", "web"] as const;
export const ResourceOriginSchema = z.enum(RESOURCE_ORIGINS);
export type ResourceOrigin = z.infer<typeof ResourceOriginSchema>;

/** Status pemeriksaan admin. Sumber web mulai dari "belum_dicek"; "ditolak" disembunyikan dari pengguna. */
export const REVIEW_STATUSES = ["disetujui", "belum_dicek", "ditolak"] as const;
export const ReviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ResourceSchema = z.object({
  id: z.string().max(64).regex(SLUG_PATTERN),
  title: text(LIMITS.short),
  provider: text(LIMITS.short),
  type: ResourceTypeSchema,
  url: z.url({ protocol: /^https$/ }),
  cost: ResourceCostSchema,
  tags: z.array(z.string().max(40).regex(TAG_PATTERN)).min(1).max(12),
  level: ResourceLevelSchema,
  note: text(LIMITS.item),
  /** null = harga belum diketahui; kalkulator meminta pengguna mengisi perkiraannya. */
  price: PriceSchema.nullable(),
  origin: ResourceOriginSchema.default("kurasi"),
  review: ReviewStatusSchema.default("disetujui"),
});
export type Resource = z.infer<typeof ResourceSchema>;

/**
 * Sumber yang dilampirkan ke langkah roadmap: URL dan harga asli dari katalog,
 * plus alasan pemilihan dari AI #2. Default null agar roadmap lama tetap terbaca.
 */
export const ResourceLinkSchema = ResourceSchema.pick({
  id: true,
  title: true,
  provider: true,
  type: true,
  url: true,
  cost: true,
}).extend({
  price: PriceSchema.nullable().default(null),
  reason: z.string().trim().max(LIMITS.item).nullable().default(null),
  origin: ResourceOriginSchema.default("kurasi"),
  review: ReviewStatusSchema.default("disetujui"),
});
export type ResourceLink = z.infer<typeof ResourceLinkSchema>;

/** Data sumber terbaru dari katalog untuk menyegarkan roadmap yang sudah tersimpan (revisi admin). */
export const CatalogLinkSchema = ResourceLinkSchema.pick({
  id: true,
  title: true,
  provider: true,
  type: true,
  url: true,
  cost: true,
  origin: true,
  review: true,
});
export type CatalogLink = z.infer<typeof CatalogLinkSchema>;

/** Isi sumber yang boleh diubah admin di /admin (id, asal, dan harga kurasi tidak). */
export const AdminResourcePatchSchema = ResourceSchema.pick({
  title: true,
  provider: true,
  type: true,
  url: true,
  cost: true,
  tags: true,
  level: true,
  note: true,
}).extend({ review: ReviewStatusSchema });
export type AdminResourcePatch = z.infer<typeof AdminResourcePatchSchema>;

export const AdminResourceSchema = AdminResourcePatchSchema.extend({
  id: ResourceSchema.shape.id,
  origin: ResourceOriginSchema,
  sourceQuery: z.string(),
  createdAt: z.string(),
  reviewedAt: z.string().nullable(),
});
export type AdminResource = z.infer<typeof AdminResourceSchema>;

// ───────────────────────── Drafting ─────────────────────────

export const ProfileSchema = z.object({
  dream: text(LIMITS.dream),
  summary: text(LIMITS.text),
  currentCondition: text(LIMITS.text),
  location: text(LIMITS.short).nullable(),
  constraints: list(LIMITS.list),
  strengths: list(LIMITS.list),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const PLAN_IDS = ["A", "B", "C"] as const;
export const PlanIdSchema = z.enum(PLAN_IDS);
export type PlanId = z.infer<typeof PlanIdSchema>;

export const COST_LEVELS = ["gratis", "rendah", "sedang", "tinggi"] as const;
export const CostLevelSchema = z.enum(COST_LEVELS);
export type CostLevel = z.infer<typeof CostLevelSchema>;

export const PlanSchema = z.object({
  id: PlanIdSchema,
  title: text(LIMITS.short),
  tagline: text(LIMITS.tagline),
  approach: text(LIMITS.text),
  whyFits: text(LIMITS.text),
  duration: text(60),
  costLevel: CostLevelSchema,
  milestones: z.array(text(LIMITS.item)).min(LIMITS.milestones.min).max(LIMITS.milestones.max),
  tradeoff: text(LIMITS.text),
});
export type Plan = z.infer<typeof PlanSchema>;

/** Tepat tiga plan dengan id A, B, C sesuai urutan. */
export const PlansSchema = z
  .array(PlanSchema)
  .length(3)
  .refine((plans) => plans.every((plan, i) => plan.id === PLAN_IDS[i]), {
    message: "Plan harus berurutan dengan id A, B, C",
  });

export const DraftSchema = z.object({
  message: text(LIMITS.message),
  profile: ProfileSchema,
  plans: PlansSchema,
});
export type Draft = z.infer<typeof DraftSchema>;

export const RefineSchema = z.object({
  reply: text(LIMITS.message),
  profile: ProfileSchema,
  plans: PlansSchema,
});
export type Refine = z.infer<typeof RefineSchema>;

// ───────────────────────── Roadmap ─────────────────────────

export const STEP_ID_PATTERN = /^s[1-9]\d*$/;

export const StepSchema = z.object({
  id: z.string().regex(STEP_ID_PATTERN),
  title: text(LIMITS.short),
  description: text(LIMITS.text),
  why: text(LIMITS.text),
  weeks: z.number().int().min(LIMITS.weeks.min).max(LIMITS.weeks.max),
  todos: z.array(text(LIMITS.item)).min(LIMITS.todos.min).max(LIMITS.todos.max),
  resourceIds: z.array(z.string().max(64).regex(SLUG_PATTERN)).max(LIMITS.resourceIds),
  skills: list(LIMITS.list, 60),
});
export type Step = z.infer<typeof StepSchema>;

const sequentialStepIds = (steps: { id: string }[]) => steps.every((step, i) => step.id === `s${i + 1}`);

/** Kebutuhan sumber per langkah dari AI #1: jenis + kata kunci, tanpa nama/URL sumber. */
export const ResourceNeedSchema = z.object({
  type: ResourceTypeSchema,
  keywords: z.array(z.string().trim().toLowerCase().min(2).max(40)).min(1).max(6),
});
export type ResourceNeed = z.infer<typeof ResourceNeedSchema>;

export const MAX_NEEDS_PER_STEP = 2;
export const MAX_PICKS_PER_STEP = 3;

/** Output AI #1: langkah roadmap beserta kebutuhan sumbernya (AI tidak melihat katalog). */
export const StepDraftSchema = StepSchema.omit({ resourceIds: true }).extend({
  needs: z.array(ResourceNeedSchema).max(MAX_NEEDS_PER_STEP),
});
export type StepDraft = z.infer<typeof StepDraftSchema>;

export const RoadmapDraftSchema = z.object({
  title: text(LIMITS.short),
  summary: text(LIMITS.text),
  steps: z
    .array(StepDraftSchema)
    .min(LIMITS.steps.min)
    .max(LIMITS.steps.max)
    .refine(sequentialStepIds, { message: "Id langkah harus berurutan s1..sN" }),
});
export type RoadmapDraft = z.infer<typeof RoadmapDraftSchema>;

/** Output AI #2: sumber terpilih per langkah, hanya dari kandidat yang disaring server. */
export const ResourcePickSchema = z.object({
  stepId: z.string().regex(STEP_ID_PATTERN),
  resourceId: z.string().max(64).regex(SLUG_PATTERN),
  reason: text(LIMITS.item),
});
export const ResourcePicksSchema = z.object({
  picks: z.array(ResourcePickSchema).max(LIMITS.steps.max * MAX_PICKS_PER_STEP),
});
export type ResourcePick = z.infer<typeof ResourcePickSchema>;
export type ResourcePicks = z.infer<typeof ResourcePicksSchema>;

/** Kontrak output AI untuk roadmap. */
export const RoadmapSchema = z.object({
  title: text(LIMITS.short),
  summary: text(LIMITS.text),
  steps: z
    .array(StepSchema)
    .min(LIMITS.steps.min)
    .max(LIMITS.steps.max)
    .refine(sequentialStepIds, { message: "Id langkah harus berurutan s1..sN" }),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

/** Langkah setelah server mencocokkan resourceIds ke katalog dan melampirkan URL asli. */
export const ResolvedStepSchema = StepSchema.extend({
  resources: z.array(ResourceLinkSchema).max(LIMITS.resourceIds),
  needs: z.array(ResourceNeedSchema).max(MAX_NEEDS_PER_STEP).default([]),
});
export type ResolvedStep = z.infer<typeof ResolvedStepSchema>;

export const ResolvedRoadmapSchema = RoadmapSchema.extend({
  steps: z
    .array(ResolvedStepSchema)
    .min(LIMITS.steps.min)
    .max(LIMITS.steps.max)
    .refine(sequentialStepIds, { message: "Id langkah harus berurutan s1..sN" }),
});
export type ResolvedRoadmap = z.infer<typeof ResolvedRoadmapSchema>;

/** Kunci to-do yang dicentang: `${stepId}#${index}`. */
export function todoKey(stepId: string, index: number): string {
  return `${stepId}#${index}`;
}

export const ProgressSchema = z.object({
  doneSteps: z.array(z.string().regex(STEP_ID_PATTERN)).max(LIMITS.steps.max),
  doneTodos: z.array(z.string().regex(/^s[1-9]\d*#\d+$/)).max(LIMITS.steps.max * LIMITS.todos.max),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const EMPTY_PROGRESS: Progress = { doneSteps: [], doneTodos: [] };

/** Pilihan kalkulator biaya per roadmap: sumber yang diambil, koreksi harga, dan jumlah (bulan/semester). */
export const CostItemSchema = z.object({
  included: z.boolean(),
  /** Koreksi harga satuan dari pengguna (rupiah); null = pakai harga katalog. */
  amount: z.number().int().min(0).max(1_000_000_000).nullable(),
  qty: z.number().int().min(1).max(48),
  /** Perkiraan harga hasil pencarian AI untuk sumber yang belum punya harga di katalog. */
  estimate: PriceSchema.nullable().default(null),
});
export type CostItem = z.infer<typeof CostItemSchema>;

/**
 * Biaya besar di luar sumber belajar (kuliah, biaya hidup, visa, tiket, perangkat):
 * hasil pencarian web AI. Setiap baris WAJIB punya sumber dari hasil pencarian
 * (URL dari metadata pencarian, bukan teks AI) dan selalu ditampilkan sebagai perkiraan AI.
 */
export const EXTRA_UNITS = ["sekali", "per bulan", "per semester", "per tahun"] as const;
export type ExtraUnit = (typeof EXTRA_UNITS)[number];
export const EXTRA_CATEGORIES = ["pendidikan", "hidup", "perjalanan", "dokumen", "tes", "perangkat", "lainnya"] as const;
export type ExtraCategory = (typeof EXTRA_CATEGORIES)[number];
/** Batas per satuan (rupiah): biaya kuliah luar negeri setahun bisa ratusan juta. */
export const MAX_EXTRA_IDR = 2_000_000_000;

export const CostExtraSchema = z
  .object({
    id: z.string().max(48).regex(SLUG_PATTERN),
    label: z.string().trim().min(2).max(90),
    category: z.enum(EXTRA_CATEGORIES),
    min: z.number().int().min(0).max(MAX_EXTRA_IDR),
    max: z.number().int().min(0).max(MAX_EXTRA_IDR),
    unit: z.enum(EXTRA_UNITS),
    qty: z.number().int().min(1).max(120),
    included: z.boolean(),
    /** Koreksi harga satuan dari pengguna; null = pakai perkiraan. */
    amount: z.number().int().min(0).max(MAX_EXTRA_IDR).nullable(),
    note: z.string().trim().max(200).default(""),
    sourceUrl: z.url({ protocol: /^https$/ }),
    sourceTitle: z.string().trim().max(120).default(""),
    checkedAt: z.iso.date(),
  })
  .refine((e) => e.max >= e.min, { message: "Harga maksimum lebih kecil dari minimum" });
export type CostExtra = z.infer<typeof CostExtraSchema>;

/** Opsi lebih hemat untuk roadmap (beasiswa, bantuan biaya, alternatif murah/gratis), selalu bersumber. */
export const SAVING_KINDS = ["beasiswa", "bantuan", "lebih-murah", "gratis"] as const;
export type SavingKind = (typeof SAVING_KINDS)[number];
export const SavingOptionSchema = z.object({
  id: z.string().max(48).regex(SLUG_PATTERN),
  title: z.string().trim().min(2).max(90),
  kind: z.enum(SAVING_KINDS),
  /** Apa yang ditanggung atau dihemat. */
  covers: z.string().trim().max(200).default(""),
  /** Syarat singkat. */
  requirement: z.string().trim().max(200).default(""),
  sourceUrl: z.url({ protocol: /^https$/ }),
  sourceTitle: z.string().trim().max(120).default(""),
});
export type SavingOption = z.infer<typeof SavingOptionSchema>;

export const RoadmapCostsSchema = z.object({
  items: z.record(z.string().max(64).regex(SLUG_PATTERN), CostItemSchema),
  extras: z.array(CostExtraSchema).max(10).default([]),
  savings: z.array(SavingOptionSchema).max(6).default([]),
  /** belum = belum dicari; selesai = ada hasil; kosong = sudah dicari, tidak ada biaya besar yang relevan/bersumber. */
  extrasStatus: z.enum(["belum", "selesai", "kosong"]).default("belum"),
});
export type RoadmapCosts = z.infer<typeof RoadmapCostsSchema>;
export const EMPTY_COSTS: RoadmapCosts = { items: {}, extras: [], savings: [], extrasStatus: "belum" };

/** Permintaan riset biaya besar untuk satu roadmap. */
export const CostResearchRequestSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.short * 2),
  dream: z.string().trim().min(1).max(LIMITS.dream),
  location: z.string().trim().max(LIMITS.short).nullable(),
  constraints: z.array(z.string().trim().max(LIMITS.item)).max(LIMITS.list),
  plan: z.object({
    title: z.string().trim().max(LIMITS.short),
    approach: z.string().trim().max(LIMITS.text * 2),
    duration: z.string().trim().max(60),
  }),
  steps: z.array(z.string().trim().max(LIMITS.short * 2)).min(1).max(LIMITS.steps.max),
  /** Judul sumber berbayar yang sudah dihitung kalkulator (agar tidak dihitung dua kali). */
  existing: z.array(z.string().trim().max(200)).max(40),
});
export type CostResearchRequest = z.infer<typeof CostResearchRequestSchema>;

// ───────────────────────── Baris database ─────────────────────────
// Dipakai lib/store.ts untuk memvalidasi data yang dibaca dari Supabase
// maupun localStorage (mode demo) sebelum masuk ke UI.

const timestamp = z.string().min(1);

export const RoadmapRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  title: text(LIMITS.short),
  summary: text(LIMITS.text),
  dream: text(LIMITS.dream),
  profile: ProfileSchema,
  plan: PlanSchema,
  steps: ResolvedRoadmapSchema.shape.steps,
  progress: ProgressSchema,
  costs: RoadmapCostsSchema.default(EMPTY_COSTS),
  created_at: timestamp,
  updated_at: timestamp,
});
export type RoadmapRow = z.infer<typeof RoadmapRowSchema>;

export const PROJECT_STATUSES = ["diterima", "selesai", "dibatalkan"] as const;
export const ProjectStatusSchema = z.enum(PROJECT_STATUSES);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectInterestRowSchema = z.object({
  user_id: z.uuid(),
  project_id: z.string().max(64).regex(SLUG_PATTERN),
  status: ProjectStatusSchema,
  created_at: timestamp,
  updated_at: timestamp,
});
export type ProjectInterestRow = z.infer<typeof ProjectInterestRowSchema>;

// ───────────────────────── Experience: mitra, lowongan, lamaran ─────────────────────────

export const ProvinceSchema = z.enum(PROVINCES);

export const ORG_KINDS = ["umkm", "perusahaan", "komunitas", "sekolah", "instansi", "lainnya"] as const;
export const OrgKindSchema = z.enum(ORG_KINDS);
export type OrgKind = z.infer<typeof OrgKindSchema>;

const WHITESPACE = /\s+/g;
const oneLine = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.replace(WHITESPACE, " ").trim())
    .pipe(z.string().min(min).max(max));
const paragraph = (min: number, max: number) => z.string().trim().min(min).max(max);
/** Nomor WhatsApp (08…/+62…) atau email. */
export const ContactSchema = oneLine(5, 120).refine(
  (v) => /^(\+?62|0)8[0-9\s-]{7,15}$/.test(v) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  "Isi nomor WhatsApp (08…) atau email yang valid.",
);
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https:\/\/[^\s]+\.[^\s]+/.test(v), "Link harus diawali https://");

export const OrganizationInputSchema = z.object({
  name: oneLine(2, 120),
  kind: OrgKindSchema,
  province: ProvinceSchema,
  city: oneLine(2, 80),
  contactName: oneLine(2, 80),
  contact: ContactSchema,
  description: paragraph(0, 600).default(""),
});
export type OrganizationInput = z.input<typeof OrganizationInputSchema>;

export const OrganizationSchema = OrganizationInputSchema.extend({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  createdAt: z.string(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const OPPORTUNITY_KINDS = ["magang", "proyek", "paruh_waktu", "relawan", "kerja"] as const;
export const OpportunityKindSchema = z.enum(OPPORTUNITY_KINDS);
export type OpportunityKind = z.infer<typeof OpportunityKindSchema>;

/** Kategori posisi untuk filter "posisi". */
export const POSITION_CATEGORIES = [
  "desain",
  "teknologi",
  "data",
  "pemasaran",
  "konten",
  "administrasi",
  "pendidikan",
  "kesehatan",
  "pertanian",
  "kuliner",
  "kerajinan",
  "lainnya",
] as const;
export const PositionCategorySchema = z.enum(POSITION_CATEGORIES);
export type PositionCategory = z.infer<typeof PositionCategorySchema>;

/** Pemeriksaan admin sebelum lowongan tampil ke talenta. */
export const OPPORTUNITY_REVIEWS = ["menunggu", "disetujui", "ditolak"] as const;
export const OpportunityReviewSchema = z.enum(OPPORTUNITY_REVIEWS);
export type OpportunityReview = z.infer<typeof OpportunityReviewSchema>;

/**
 * Tangga proyek: tingkat risiko/tanggung jawab sebuah lowongan. Talenta baru
 * hanya bisa mengambil proyek kecil; sedang terbuka setelah satu proyek selesai,
 * tinggi setelah satu proyek sedang selesai (ditegakkan trigger applications_guard).
 */
export const OPPORTUNITY_LEVELS = ["kecil", "sedang", "tinggi"] as const;
export const OpportunityLevelSchema = z.enum(OPPORTUNITY_LEVELS);
export type OpportunityLevel = z.infer<typeof OpportunityLevelSchema>;

export const OpportunityInputSchema = z
  .object({
    title: oneLine(3, 120),
    category: PositionCategorySchema,
    kind: OpportunityKindSchema,
    province: ProvinceSchema.nullable(),
    city: oneLine(0, 80).default(""),
    remote: z.boolean().default(false),
    description: paragraph(20, 1200),
    requirements: paragraph(0, 600).default(""),
    stipend: oneLine(2, 80),
    duration: oneLine(2, 60),
    slots: z.number().int().min(1).max(50),
    deadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    tags: z.array(z.string().trim().toLowerCase().regex(TAG_PATTERN).max(30)).max(8).default([]),
    level: OpportunityLevelSchema.default("kecil"),
  })
  .refine((o) => o.remote || o.province !== null, {
    message: "Pilih provinsi, atau tandai lowongan ini bisa dikerjakan online.",
    path: ["province"],
  });
export type OpportunityInput = z.input<typeof OpportunityInputSchema>;

export const OpportunitySchema = z.object({
  id: z.string().min(1),
  orgId: z.string().min(1),
  orgName: z.string(),
  orgKind: OrgKindSchema,
  title: z.string(),
  category: PositionCategorySchema,
  kind: OpportunityKindSchema,
  province: ProvinceSchema.nullable(),
  city: z.string(),
  remote: z.boolean(),
  description: z.string(),
  requirements: z.string(),
  stipend: z.string(),
  duration: z.string(),
  slots: z.number().int(),
  deadline: z.string().nullable(),
  tags: z.array(z.string()),
  level: OpportunityLevelSchema.default("kecil"),
  review: OpportunityReviewSchema,
  adminNote: z.string(),
  closed: z.boolean(),
  createdAt: z.string(),
  /** Lowongan contoh bawaan (organisasi fiktif); selalu diberi label. */
  sample: z.boolean().default(false),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

/**
 * Status lamaran. Admin menghubungkan: dikirim → diproses → diteruskan (ke mitra).
 * Setelah diteruskan, mitra mengelola: diterima → bekerja → selesai. Ditolak bisa
 * oleh admin atau mitra; dibatalkan oleh talenta selama belum diteruskan.
 */
export const APPLICATION_STATUSES = [
  "dikirim",
  "diproses",
  "diteruskan",
  "diterima",
  "bekerja",
  "selesai",
  "ditolak",
  "dibatalkan",
] as const;
export const ApplicationStatusSchema = z.enum(APPLICATION_STATUSES);
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

/** Status yang boleh diatur admin, mitra (setelah diteruskan), dan talenta. */
export const ADMIN_APPLICATION_STATUSES = ["dikirim", "diproses", "diteruskan", "ditolak"] as const satisfies readonly ApplicationStatus[];
export const ORG_APPLICATION_STATUSES = ["diterima", "bekerja", "selesai", "ditolak"] as const satisfies readonly ApplicationStatus[];
/** Status yang membuat lamaran terlihat oleh mitra. */
export const VISIBLE_TO_ORG = ["diteruskan", "diterima", "bekerja", "selesai"] as const satisfies readonly ApplicationStatus[];

export const ApplicationInputSchema = z.object({
  opportunityId: z.string().min(1),
  contact: ContactSchema,
  motivation: paragraph(20, 600),
  portfolioUrl: httpsUrl.nullable().default(null),
  cvUrl: httpsUrl.nullable().default(null),
  roadmapId: z.string().uuid().nullable().default(null),
});
export type ApplicationInput = z.input<typeof ApplicationInputSchema>;

export const ApplicationSchema = z.object({
  id: z.string().min(1),
  opportunityId: z.string().min(1),
  userId: z.string().min(1),
  applicantName: z.string(),
  /** Ringkasan mimpi/roadmap talenta (diambil dari roadmap yang dilampirkan). */
  profileSummary: z.string(),
  opportunityTitle: z.string(),
  orgName: z.string(),
  contact: z.string(),
  motivation: z.string(),
  portfolioUrl: z.string().nullable(),
  cvUrl: z.string().nullable(),
  roadmapId: z.string().nullable(),
  status: ApplicationStatusSchema,
  adminNote: z.string(),
  orgNote: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Squad (tim kecil) yang diatur admin; null bila belum masuk squad. */
  squadId: z.string().nullable().default(null),
  /** Kesediaan anggota: "izin" bila sedang berhalangan (diatur talenta sendiri). */
  availability: z.enum(["siap", "izin"]).default("siap"),
  availabilityNote: z.string().default(""),
  /** Kapan pertama kali diteruskan ke mitra; menentukan apakah mitra boleh melihat lamaran yang ditolak. */
  forwardedAt: z.string().nullable().default(null),
});
export type Application = z.infer<typeof ApplicationSchema>;

/** Squad: 2–4 talenta di satu lowongan, dibentuk admin, dengan link grup bersama. */
export const MAX_SQUAD_SIZE = 4;
export const SquadInputSchema = z.object({
  name: oneLine(2, 60),
  contactLink: httpsUrl.nullable().default(null),
  note: paragraph(0, 300).default(""),
});
export type SquadInput = z.input<typeof SquadInputSchema>;

export const SquadMemberSchema = z.object({
  applicationId: z.string().min(1),
  name: z.string(),
  status: ApplicationStatusSchema,
  availability: z.enum(["siap", "izin"]),
  availabilityNote: z.string(),
  isMe: z.boolean(),
});
export type SquadMember = z.infer<typeof SquadMemberSchema>;

export const SquadSchema = z.object({
  id: z.string().min(1),
  opportunityId: z.string().min(1),
  name: z.string(),
  contactLink: z.string().nullable(),
  note: z.string(),
  createdAt: z.string(),
  members: z.array(SquadMemberSchema).default([]),
});
export type Squad = z.infer<typeof SquadSchema>;

/** artikel = tulisan blog; mentor & komunitas = profil di halaman Komunitas. */
export const STORY_KINDS = ["artikel", "mentor", "komunitas"] as const;
export const StoryKindSchema = z.enum(STORY_KINDS);
export type StoryKind = z.infer<typeof StoryKindSchema>;

/** draf = hanya penulis; terbit = publik; diturunkan = disembunyikan admin. */
export const STORY_STATUSES = ["draf", "terbit", "diturunkan"] as const;
export const StoryStatusSchema = z.enum(STORY_STATUSES);
export type StoryStatus = z.infer<typeof StoryStatusSchema>;

/** Tag bebas: huruf kecil, angka, tanda hubung (mis. "beasiswa", "ui-ux"). */
export const StoryTagSchema = z.string().trim().toLowerCase().regex(TAG_PATTERN).max(30);

/**
 * Kontak publik mentor/komunitas: link https (Instagram, LinkedIn, grup) atau
 * nomor WhatsApp (08…/+62…). Tampil ke semua orang, jadi penulis diberi peringatan.
 */
export const PublicContactSchema = z
  .string()
  .trim()
  .max(200)
  .refine(
    (v) => /^https:\/\/[^\s]+\.[^\s]+$/.test(v) || /^(\+?62|0)8[0-9\s-]{7,15}$/.test(v),
    "Isi link https (mis. Instagram/LinkedIn) atau nomor WhatsApp (08…).",
  );

/** Input form cerita; batasnya sama dengan check constraint tabel `stories`. */
export const StoryInputSchema = z
  .object({
    author_name: z.string().trim().min(1).max(LIMITS.story.author),
    kind: StoryKindSchema,
    title: z.string().trim().min(LIMITS.story.titleMin).max(LIMITS.story.title),
    summary: z.string().trim().max(200).default(""),
    body: z.string().trim().min(LIMITS.story.bodyMin).max(LIMITS.story.body),
    tags: z.array(StoryTagSchema).max(6).default([]),
    contact: PublicContactSchema.nullable().default(null),
    status: z.enum(["draf", "terbit"]).default("terbit"),
  })
  .refine((s) => s.kind === "artikel" || s.status === "draf" || s.contact !== null, {
    message: "Mentor dan komunitas wajib mencantumkan kontak supaya bisa dihubungi.",
    path: ["contact"],
  });
export type StoryInput = z.input<typeof StoryInputSchema>;

export const StoryRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  author_name: z.string(),
  kind: StoryKindSchema,
  title: z.string(),
  summary: z.string().default(""),
  body: z.string(),
  tags: z.array(z.string()).default([]),
  contact: z.string().nullable().default(null),
  status: StoryStatusSchema.default("terbit"),
  published_at: timestamp.nullable().default(null),
  created_at: timestamp,
});
export type StoryRow = z.infer<typeof StoryRowSchema>;

/** Permintaan AI: ubah cerita lisan/ketikan jadi draf artikel atau profil mentor/komunitas. */
export const StoryDraftRequestSchema = z.object({
  kind: StoryKindSchema,
  transcript: z.string().trim().min(20, "Ceritakan sedikit lebih panjang, minimal 20 karakter.").max(INPUT_LIMIT_STORY),
  authorName: z.string().trim().max(LIMITS.story.author).default(""),
});
export type StoryDraftRequest = z.infer<typeof StoryDraftRequestSchema>;

export const StoryDraftSchema = z.object({
  title: z.string().trim().min(LIMITS.story.titleMin).max(LIMITS.story.title),
  summary: z.string().trim().max(200),
  body: z.string().trim().min(LIMITS.story.bodyMin).max(LIMITS.story.body),
  tags: z.array(StoryTagSchema).min(1).max(6),
});
export type StoryDraft = z.infer<typeof StoryDraftSchema>;

// ───────────────────────── Input API ─────────────────────────

/** Batas karakter per jawaban pengguna. */
export const INPUT_LIMIT = 4000;

export const DraftRequestSchema = z.object({
  dream: z
    .string({ error: "Ceritakan mimpimu dulu." })
    .trim()
    .min(10, "Ceritakan mimpimu sedikit lebih panjang (minimal 10 karakter).")
    .max(INPUT_LIMIT, `Ceritamu terlalu panjang. Maksimal ${INPUT_LIMIT} karakter.`),
  background: z
    .string()
    .trim()
    .max(INPUT_LIMIT, `Ceritamu terlalu panjang. Maksimal ${INPUT_LIMIT} karakter.`)
    .default(""),
});
export type DraftRequest = z.infer<typeof DraftRequestSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(LIMITS.message),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const RefineRequestSchema = z.object({
  profile: ProfileSchema,
  plans: PlansSchema,
  messages: z
    .array(ChatMessageSchema)
    .min(1)
    .max(20)
    .refine((messages) => messages.at(-1)?.role === "user", {
      message: "Pesan terakhir harus dari pengguna.",
    }),
});
export type RefineRequest = z.infer<typeof RefineRequestSchema>;

export const RoadmapRequestSchema = z.object({
  profile: ProfileSchema,
  plan: PlanSchema,
});
export type RoadmapRequest = z.infer<typeof RoadmapRequestSchema>;

export const AI_PROVIDERS = ["gemini", "openrouter", "mock"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Penanda asal jawaban AI yang ikut di setiap respons API. */
export type AiMeta = { provider: AiProvider; fallback: boolean };

// ───────────────────────── Suara → teks (cadangan saat browser tidak punya pengenal suara) ─────────────────────────

/** Rekaman maksimal per sekali tekan (detik). WAV 16 kHz mono ≈ 32 KB/detik. */
export const MAX_RECORDING_SEC = 60;
/** base64 WAV 60 detik ≈ 2,6 juta karakter; beri ruang sedikit. */
const MAX_AUDIO_BASE64 = 2_800_000;

export const TranscribeRequestSchema = z.object({
  audio: z
    .string()
    .min(1000, "Rekaman terlalu pendek. Tekan mikrofon lalu bicara beberapa kalimat.")
    .max(MAX_AUDIO_BASE64, "Rekaman terlalu panjang. Maksimal satu menit per rekaman.")
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Rekaman rusak. Coba rekam lagi."),
  mime: z.literal("audio/wav"),
});
export type TranscribeRequest = z.infer<typeof TranscribeRequestSchema>;

export const TranscriptSchema = z.object({ text: z.string().trim().max(INPUT_LIMIT) });
export type Transcript = z.infer<typeof TranscriptSchema>;

export type StatusResponse = { ai: AiProvider; supabase: boolean };
