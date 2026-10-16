import { RESOURCES } from "./resources";
import type { RoadmapRow } from "./types";

/**
 * Proyek mikro CONTOH untuk tahap Experience. Semua organisasi fiktif;
 * UI wajib menampilkan label "data contoh". Pencocokan memakai tag proyek
 * terhadap mimpi, plan, skill, dan tag sumber di roadmap pengguna.
 */

export type MicroProject = {
  id: string;
  title: string;
  organization: string;
  description: string;
  tags: string[];
  teamSize: 2 | 4;
  duration: string;
  stipend: string;
  deliverable: string;
};

export const PROJECTS: readonly MicroProject[] = [
  {
    id: "desain-menu-kedai-kopi",
    title: "Desain ulang menu kedai kopi",
    organization: "Kedai Kopi Senja (contoh)",
    description: "Menu lama sulit dibaca pembeli. Rancang ulang menu cetak dan versi media sosial yang konsisten.",
    tags: ["desain", "umkm", "konten"],
    teamSize: 2,
    duration: "2 minggu",
    stipend: "Rp400.000 per orang",
    deliverable: "Menu cetak A3 dan 3 unggahan Instagram",
  },
  {
    id: "riset-aplikasi-antrean",
    title: "Riset pengguna aplikasi antrean klinik",
    organization: "Klinik Sehat Bersama (contoh)",
    description: "Wawancarai pasien dan petugas, temukan titik masalah antrean, lalu usulkan perbaikan alur aplikasi.",
    tags: ["ux", "desain", "riset", "kesehatan"],
    teamSize: 2,
    duration: "3 minggu",
    stipend: "Rp600.000 per orang",
    deliverable: "Laporan riset dan 3 rekomendasi desain",
  },
  {
    id: "landing-page-katering",
    title: "Landing page katering rumahan",
    organization: "Dapur Bu Sri (contoh)",
    description: "Buat halaman web satu halaman berisi menu, testimoni, dan tombol pesan lewat WhatsApp.",
    tags: ["web", "pemrograman", "umkm"],
    teamSize: 2,
    duration: "3 minggu",
    stipend: "Rp750.000 per orang",
    deliverable: "Website satu halaman yang sudah online",
  },
  {
    id: "dashboard-toko-kelontong",
    title: "Dashboard penjualan toko kelontong",
    organization: "Toko Makmur Jaya (contoh)",
    description: "Rapikan catatan penjualan tiga bulan terakhir dan buat dashboard sederhana untuk pemilik toko.",
    tags: ["data", "umkm", "bisnis"],
    teamSize: 2,
    duration: "2 minggu",
    stipend: "Rp500.000 per orang",
    deliverable: "Dashboard spreadsheet dan ringkasan temuan",
  },
  {
    id: "konten-koperasi-tani",
    title: "Kalender konten koperasi tani",
    organization: "Koperasi Tani Lestari (contoh)",
    description: "Susun strategi dan jadwal konten sebulan supaya produk koperasi lebih dikenal pembeli kota.",
    tags: ["pemasaran", "konten", "desain"],
    teamSize: 4,
    duration: "4 minggu",
    stipend: "Rp350.000 per orang",
    deliverable: "30 konten terjadwal dan panduan gaya visual",
  },
  {
    id: "katalog-kerajinan",
    title: "Foto dan katalog produk kerajinan",
    organization: "Sanggar Anyaman Nusa (contoh)",
    description: "Foto ulang produk dengan peralatan sederhana dan susun katalog yang siap diunggah ke marketplace.",
    tags: ["umkm", "pemasaran", "desain"],
    teamSize: 2,
    duration: "2 minggu",
    stipend: "Rp450.000 per orang",
    deliverable: "Katalog 20 produk siap unggah",
  },
  {
    id: "kelas-literasi-digital",
    title: "Kelas literasi digital untuk lansia",
    organization: "Karang Taruna Harapan (contoh)",
    description: "Rancang dan ajarkan empat sesi kelas: memakai ponsel dengan aman, mengenali hoaks, dan dompet digital.",
    tags: ["pendidikan", "relawan", "komunikasi"],
    teamSize: 4,
    duration: "3 minggu",
    stipend: "Rp300.000 per orang",
    deliverable: "Modul ajar dan 4 sesi kelas",
  },
  {
    id: "chatbot-faq-sekolah",
    title: "Chatbot FAQ pendaftaran sekolah",
    organization: "SMK Bina Karya (contoh)",
    description: "Kumpulkan pertanyaan yang paling sering muncul saat pendaftaran dan bangun chatbot sederhana untuk menjawabnya.",
    tags: ["pemrograman", "ai", "pendidikan"],
    teamSize: 4,
    duration: "4 minggu",
    stipend: "Rp800.000 per orang",
    deliverable: "Chatbot sederhana dan dokumentasinya",
  },
];

/** Kata yang dianggap cocok dengan tiap tag proyek. */
export const TAG_KEYWORDS: Record<string, string[]> = {
  desain: ["desain", "design", "grafis", "visual", "canva", "figma", "ilustrasi"],
  ux: ["ux", "ui/ux", "riset pengguna", "prototipe", "wireframe"],
  riset: ["riset", "wawancara", "analisis"],
  umkm: ["umkm", "usaha", "wirausaha", "bisnis", "jualan", "toko"],
  konten: ["konten", "media sosial", "media-sosial", "copywriting"],
  web: ["web", "website", "javascript", "react", "front-end", "html"],
  pemrograman: ["pemrograman", "programmer", "coding", "developer", "javascript", "python", "git"],
  data: ["data", "analitik", "spreadsheet", "sql", "statistik", "visualisasi"],
  bisnis: ["bisnis", "pembukuan", "keuangan", "usaha"],
  pemasaran: ["pemasaran", "marketing", "iklan", "digital-marketing", "e-commerce"],
  kesehatan: ["kesehatan", "perawat", "klinik", "bidan"],
  pendidikan: ["pendidikan", "guru", "mengajar", "pembelajaran", "kelas"],
  relawan: ["relawan", "sosial", "komunitas"],
  komunikasi: ["komunikasi", "berbicara", "public speaking", "presentasi"],
  ai: ["ai", "machine-learning", "machine learning", "kecerdasan buatan"],
};

export type MatchedProject = { project: MicroProject; score: number; matched: string[] };

/** Minimal tag yang cocok agar proyek diberi label "Cocok untukmu"; satu tag saja terlalu lemah. */
export const STRONG_MATCH = 2;

/** Teks profil roadmap yang dipakai untuk mencocokkan (huruf kecil). */
export function roadmapKeywords(roadmap: RoadmapRow): string {
  const resourceTags = roadmap.steps
    .flatMap((s) => s.resourceIds)
    .flatMap((id) => RESOURCES.find((r) => r.id === id)?.tags ?? []);
  return [
    roadmap.dream,
    roadmap.title,
    roadmap.plan.title,
    roadmap.plan.approach,
    ...roadmap.steps.flatMap((s) => [s.title, ...s.skills]),
    ...resourceTags,
  ]
    .join(" ")
    .toLowerCase();
}

const hasWord = (text: string, keyword: string) =>
  new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}($|[^a-z0-9])`).test(text);

/** Urutkan proyek berdasarkan jumlah tag yang cocok; seri → urutan asli. */
export function rankProjects(projects: readonly MicroProject[], roadmap: RoadmapRow | null): MatchedProject[] {
  const text = roadmap ? roadmapKeywords(roadmap) : "";
  return projects
    .map((project, order) => {
      const matched = text
        ? project.tags.filter((tag) => [tag, ...(TAG_KEYWORDS[tag] ?? [])].some((k) => hasWord(text, k)))
        : [];
      return { project, score: matched.length, matched, order };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ project, score, matched }) => ({ project, score, matched }));
}
