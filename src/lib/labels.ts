import type { CostLevel, ResourceType, ReviewStatus } from "./types";

export const COST_LABEL: Record<CostLevel, string> = {
  gratis: "Gratis",
  rendah: "Biaya rendah",
  sedang: "Biaya sedang",
  tinggi: "Biaya tinggi",
};

/** Kelas warna chip biaya: makin murah makin hijau. */
export const COST_TONE: Record<CostLevel, string> = {
  gratis: "bg-leaf-soft text-ink",
  rendah: "bg-leaf-soft text-ink",
  sedang: "bg-sun-soft text-ink",
  tinggi: "bg-danger-soft text-ink",
};

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  sertifikasi: "Sertifikasi",
  kursus: "Kursus",
  beasiswa: "Beasiswa",
  kampus: "Kampus",
  program: "Program",
  ujian: "Ujian",
  relawan: "Relawan",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  belum_dicek: "Belum dicek",
  disetujui: "Disetujui",
  ditolak: "Ditolak",
};
