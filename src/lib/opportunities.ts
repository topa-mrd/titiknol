import { TAG_KEYWORDS, roadmapKeywords } from "./projects";
import type { Province } from "./regions";
import type {
  Application,
  ApplicationStatus,
  Opportunity,
  OpportunityKind,
  OpportunityLevel,
  OrgKind,
  PositionCategory,
  RoadmapRow,
} from "./types";

export const OPPORTUNITY_KIND_LABEL: Record<OpportunityKind, string> = {
  magang: "Magang",
  proyek: "Proyek",
  paruh_waktu: "Paruh waktu",
  relawan: "Relawan",
  kerja: "Kerja",
};

export const POSITION_LABEL: Record<PositionCategory, string> = {
  desain: "Desain",
  teknologi: "Teknologi",
  data: "Data",
  pemasaran: "Pemasaran",
  konten: "Konten",
  administrasi: "Administrasi",
  pendidikan: "Pendidikan",
  kesehatan: "Kesehatan",
  pertanian: "Pertanian",
  kuliner: "Kuliner",
  kerajinan: "Kerajinan",
  lainnya: "Lainnya",
};

export const ORG_KIND_LABEL: Record<OrgKind, string> = {
  umkm: "UMKM",
  perusahaan: "Perusahaan",
  komunitas: "Komunitas",
  sekolah: "Sekolah/kampus",
  instansi: "Instansi",
  lainnya: "Lainnya",
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  dikirim: "Terkirim",
  diproses: "Sedang dicek admin",
  diteruskan: "Diteruskan ke mitra",
  diterima: "Diterima",
  bekerja: "Sedang bekerja",
  selesai: "Selesai",
  ditolak: "Belum lolos",
  dibatalkan: "Dibatalkan",
};

/** Urutan tahap lamaran untuk penanda kemajuan (ditolak/dibatalkan di luar urutan). */
export const APPLICATION_FLOW: readonly ApplicationStatus[] = ["dikirim", "diproses", "diteruskan", "diterima", "bekerja", "selesai"];

/** Kata kunci roadmap yang dianggap cocok dengan tiap kategori posisi. */
const CATEGORY_TAGS: Record<PositionCategory, string[]> = {
  desain: ["desain", "ux"],
  teknologi: ["pemrograman", "web", "ai"],
  data: ["data"],
  pemasaran: ["pemasaran", "bisnis"],
  konten: ["konten", "komunikasi"],
  administrasi: ["bisnis"],
  pendidikan: ["pendidikan"],
  kesehatan: ["kesehatan"],
  pertanian: ["umkm"],
  kuliner: ["umkm"],
  kerajinan: ["umkm"],
  lainnya: [],
};

/** Lokasi untuk ditampilkan: "Kediri, Jawa Timur", "Online", atau gabungannya. */
export function locationLabel(o: Pick<Opportunity, "city" | "province" | "remote">): string {
  const place = [o.city, o.province].filter(Boolean).join(", ");
  if (o.remote && place) return `${place} atau online`;
  return o.remote ? "Online / jarak jauh" : place;
}

export type OpportunityFilter = {
  q: string;
  category: PositionCategory | "semua";
  /** Provinsi, "online", atau "semua". */
  place: Province | "online" | "semua";
  level: OpportunityLevel | "semua";
};

export const EMPTY_FILTER: OpportunityFilter = { q: "", category: "semua", place: "semua", level: "semua" };

const normalize = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, " ");

/** Saring lowongan menurut kata kunci posisi, kategori, dan daerah. */
export function filterOpportunities(list: readonly Opportunity[], f: OpportunityFilter): Opportunity[] {
  const words = normalize(f.q).split(/\s+/).filter(Boolean);
  return list.filter((o) => {
    if (f.category !== "semua" && o.category !== f.category) return false;
    if (f.level !== "semua" && o.level !== f.level) return false;
    if (f.place === "online" && !o.remote) return false;
    if (f.place !== "online" && f.place !== "semua" && o.province !== f.place) return false;
    if (words.length === 0) return true;
    const hay = normalize([o.title, o.orgName, o.city, o.province ?? "", o.description, ...o.tags, POSITION_LABEL[o.category]].join(" "));
    return words.every((w) => hay.includes(w));
  });
}

const hasWord = (text: string, keyword: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(text);

// Tangga proyek

export const LEVEL_LABEL: Record<OpportunityLevel, string> = { kecil: "Proyek kecil", sedang: "Proyek sedang", tinggi: "Proyek tinggi" };
export const LEVEL_HINT: Record<OpportunityLevel, string> = {
  kecil: "Risiko kecil, tugas jelas, cocok untuk pengalaman pertama.",
  sedang: "Tanggung jawab lebih besar, butuh pengalaman dari proyek kecil.",
  tinggi: "Proyek besar atau berjangka panjang, untuk yang sudah teruji di proyek sedang.",
};
export const levelRank = (level: OpportunityLevel) => ({ kecil: 1, sedang: 2, tinggi: 3 })[level];
const LEVEL_BY_RANK = ["kecil", "sedang", "tinggi"] as const satisfies readonly OpportunityLevel[];

/**
 * Tingkat tertinggi yang boleh diambil (1–3) = 1 + tingkat tertinggi proyek yang
 * sudah selesai. Sama dengan fungsi `talent_tier` di database.
 */
export function talentTier(applications: readonly Pick<Application, "status" | "opportunityId">[], opportunities: readonly Opportunity[]): number {
  const levels = new Map(opportunities.map((o) => [o.id, o.level]));
  const done = applications.filter((a) => a.status === "selesai").map((a) => levelRank(levels.get(a.opportunityId) ?? "kecil"));
  return Math.min(3, 1 + Math.max(0, ...done));
}

export const tierLevel = (tier: number): OpportunityLevel => LEVEL_BY_RANK[Math.min(3, Math.max(1, tier)) - 1];
export const canTake = (level: OpportunityLevel, tier: number) => levelRank(level) <= tier;

/** Kalimat syarat untuk tingkat yang masih terkunci. */
export function unlockHint(level: OpportunityLevel): string {
  return level === "tinggi"
    ? "Terbuka setelah kamu menyelesaikan satu proyek tingkat sedang."
    : "Terbuka setelah kamu menyelesaikan satu proyek kecil.";
}

/** Tanggal hari ini di WIB (YYYY-MM-DD), pembanding yang sama dengan database. */
export const todayWib = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** Batas daftar sudah lewat? Hari terakhir masih boleh mendaftar. */
export const isPastDeadline = (deadline: string | null, now = new Date()) => !!deadline && deadline < todayWib(now);

export type RankedOpportunity = { opportunity: Opportunity; matched: string[] };

/**
 * Urutkan lowongan. Dengan `tier`: yang bisa diambil sesuai tangga proyek lebih
 * dulu (tingkat yang sedang dijalani paling atas), lalu menurut kecocokan dengan
 * roadmap. Tanpa `tier`: kecocokan roadmap saja. Urutan asli dipertahankan untuk nilai sama.
 */
export function rankOpportunities(list: readonly Opportunity[], roadmap: RoadmapRow | null, tier?: number): RankedOpportunity[] {
  const text = roadmap ? roadmapKeywords(roadmap) : "";
  return list
    .map((opportunity, order) => {
      const tags = [...new Set([...opportunity.tags, ...CATEGORY_TAGS[opportunity.category]])];
      const matched = text ? tags.filter((tag) => [tag, ...(TAG_KEYWORDS[tag] ?? [])].some((k) => hasWord(text, k))) : [];
      return { opportunity, matched, order };
    })
    .sort((a, b) => {
      // Tanpa tingkat talenta (mis. katalog umum): urutkan menurut kecocokan roadmap saja.
      if (tier === undefined) return b.matched.length - a.matched.length || a.order - b.order;
      const lockA = canTake(a.opportunity.level, tier) ? 0 : 1;
      const lockB = canTake(b.opportunity.level, tier) ? 0 : 1;
      // Di antara yang terbuka, tingkat yang setara tingkat talenta saat ini didahulukan.
      const fitA = levelRank(a.opportunity.level) === tier ? 0 : 1;
      const fitB = levelRank(b.opportunity.level) === tier ? 0 : 1;
      return lockA - lockB || fitA - fitB || b.matched.length - a.matched.length || a.order - b.order;
    })
    .map(({ opportunity, matched }) => ({ opportunity, matched }));
}

// Lowongan contoh (organisasi fiktif)

type Sample = Pick<
  Opportunity,
  "title" | "orgName" | "orgKind" | "category" | "kind" | "province" | "city" | "remote" | "description" | "requirements" | "stipend" | "duration" | "slots" | "tags"
>;

const SAMPLES: readonly (Sample & { id: string })[] = [
  {
    id: "contoh-desain-menu-kedai-kopi",
    title: "Desainer grafis menu kedai kopi",
    orgName: "Kedai Kopi Senja (contoh)",
    orgKind: "umkm",
    category: "desain",
    kind: "proyek",
    province: "Jawa Timur",
    city: "Kediri",
    remote: true,
    description: "Menu lama sulit dibaca pembeli. Rancang ulang menu cetak dan versi media sosial yang konsisten.",
    requirements: "Bisa Canva atau Figma. Punya contoh desain, walau tugas sekolah.",
    stipend: "Rp400.000 per proyek",
    duration: "2 minggu",
    slots: 2,
    tags: ["desain", "umkm", "konten"],
  },
  {
    id: "contoh-riset-aplikasi-antrean",
    title: "Asisten riset pengguna aplikasi antrean",
    orgName: "Klinik Sehat Bersama (contoh)",
    orgKind: "perusahaan",
    category: "desain",
    kind: "magang",
    province: "DI Yogyakarta",
    city: "Sleman",
    remote: false,
    description: "Wawancarai pasien dan petugas, temukan titik masalah antrean, lalu usulkan perbaikan alur aplikasi.",
    requirements: "Nyaman berbicara dengan orang baru. Paham dasar UI/UX jadi nilai tambah.",
    stipend: "Rp1.200.000 per bulan",
    duration: "3 bulan",
    slots: 2,
    tags: ["ux", "riset", "kesehatan"],
  },
  {
    id: "contoh-landing-page-katering",
    title: "Pembuat landing page katering rumahan",
    orgName: "Dapur Bu Sri (contoh)",
    orgKind: "umkm",
    category: "teknologi",
    kind: "proyek",
    province: "Jawa Tengah",
    city: "Semarang",
    remote: true,
    description: "Buat halaman web satu halaman berisi menu, testimoni, dan tombol pesan lewat WhatsApp.",
    requirements: "Bisa HTML/CSS atau pembuat situs seperti Carrd/Wix.",
    stipend: "Rp750.000 per proyek",
    duration: "3 minggu",
    slots: 1,
    tags: ["web", "pemrograman", "umkm"],
  },
  {
    id: "contoh-dashboard-toko-kelontong",
    title: "Analis data penjualan toko kelontong",
    orgName: "Toko Makmur Jaya (contoh)",
    orgKind: "umkm",
    category: "data",
    kind: "paruh_waktu",
    province: "Sumatera Utara",
    city: "Medan",
    remote: true,
    description: "Rapikan catatan penjualan tiga bulan terakhir dan buat dashboard sederhana untuk pemilik toko.",
    requirements: "Bisa Google Sheets atau Excel (rumus dasar, grafik).",
    stipend: "Rp500.000 per bulan",
    duration: "2 bulan",
    slots: 1,
    tags: ["data", "umkm", "bisnis"],
  },
  {
    id: "contoh-konten-koperasi-tani",
    title: "Pembuat konten media sosial koperasi tani",
    orgName: "Koperasi Tani Lestari (contoh)",
    orgKind: "komunitas",
    category: "konten",
    kind: "magang",
    province: "Jawa Barat",
    city: "Garut",
    remote: true,
    description: "Susun strategi dan jadwal konten sebulan supaya produk koperasi lebih dikenal pembeli kota.",
    requirements: "Aktif di Instagram/TikTok, bisa memotret dan mengedit video pendek dari HP.",
    stipend: "Rp800.000 per bulan",
    duration: "3 bulan",
    slots: 2,
    tags: ["pemasaran", "konten", "desain"],
  },
  {
    id: "contoh-katalog-kerajinan",
    title: "Fotografer katalog produk kerajinan",
    orgName: "Sanggar Anyaman Nusa (contoh)",
    orgKind: "umkm",
    category: "kerajinan",
    kind: "proyek",
    province: "Nusa Tenggara Barat",
    city: "Lombok Tengah",
    remote: false,
    description: "Foto ulang produk dengan peralatan sederhana dan susun katalog yang siap diunggah ke marketplace.",
    requirements: "Punya HP dengan kamera yang baik. Teliti dan rapi.",
    stipend: "Rp450.000 per proyek",
    duration: "2 minggu",
    slots: 2,
    tags: ["umkm", "pemasaran", "desain"],
  },
  {
    id: "contoh-kelas-literasi-digital",
    title: "Relawan pengajar literasi digital lansia",
    orgName: "Karang Taruna Harapan (contoh)",
    orgKind: "komunitas",
    category: "pendidikan",
    kind: "relawan",
    province: "Sulawesi Selatan",
    city: "Makassar",
    remote: false,
    description: "Rancang dan ajarkan empat sesi kelas: memakai ponsel dengan aman, mengenali hoaks, dan dompet digital.",
    requirements: "Sabar, suka mengajar, bisa hadir Sabtu pagi.",
    stipend: "Uang transport Rp300.000",
    duration: "1 bulan",
    slots: 4,
    tags: ["pendidikan", "relawan", "komunikasi"],
  },
  {
    id: "contoh-chatbot-faq-sekolah",
    title: "Pengembang chatbot FAQ pendaftaran sekolah",
    orgName: "SMK Bina Karya (contoh)",
    orgKind: "sekolah",
    category: "teknologi",
    kind: "proyek",
    province: null,
    city: "",
    remote: true,
    description: "Kumpulkan pertanyaan yang paling sering muncul saat pendaftaran dan bangun chatbot sederhana untuk menjawabnya.",
    requirements: "Pernah membuat program sederhana (Python/JavaScript) atau chatbot tanpa kode.",
    stipend: "Rp800.000 per proyek",
    duration: "4 minggu",
    slots: 2,
    tags: ["pemrograman", "ai", "pendidikan"],
  },
  {
    id: "contoh-admin-gudang-online",
    title: "Admin toko online dan pengemasan",
    orgName: "Batik Laweyan Asri (contoh)",
    orgKind: "umkm",
    category: "administrasi",
    kind: "kerja",
    province: "Jawa Tengah",
    city: "Surakarta",
    remote: false,
    description: "Membalas chat pembeli, mencatat pesanan, dan menyiapkan paket kiriman harian.",
    requirements: "Teliti, ramah, bisa memakai aplikasi marketplace.",
    stipend: "Rp1.800.000 per bulan",
    duration: "Kontrak 6 bulan",
    slots: 1,
    tags: ["bisnis", "umkm"],
  },
  {
    id: "contoh-asisten-kebun-hidroponik",
    title: "Asisten kebun hidroponik",
    orgName: "Kebun Hijau Desa (contoh)",
    orgKind: "umkm",
    category: "pertanian",
    kind: "magang",
    province: "Bali",
    city: "Tabanan",
    remote: false,
    description: "Belajar merawat tanaman hidroponik, mencatat panen, dan membantu penjualan ke restoran sekitar.",
    requirements: "Suka bekerja di luar ruangan. Tidak perlu pengalaman.",
    stipend: "Rp1.000.000 per bulan + makan siang",
    duration: "3 bulan",
    slots: 3,
    tags: ["umkm", "pertanian"],
  },
  {
    id: "contoh-juru-masak-katering",
    title: "Asisten dapur katering sekolah",
    orgName: "Katering Sehat Ceria (contoh)",
    orgKind: "umkm",
    category: "kuliner",
    kind: "paruh_waktu",
    province: "Kalimantan Timur",
    city: "Samarinda",
    remote: false,
    description: "Membantu persiapan bahan dan pengemasan makan siang untuk tiga sekolah dasar.",
    requirements: "Bisa datang pukul 05.00–10.00 di hari sekolah. Menjaga kebersihan.",
    stipend: "Rp1.100.000 per bulan",
    duration: "4 bulan",
    slots: 2,
    tags: ["umkm"],
  },
  {
    id: "contoh-kader-posyandu-digital",
    title: "Pendamping pencatatan posyandu digital",
    orgName: "Puskesmas Mekar Sari (contoh)",
    orgKind: "instansi",
    category: "kesehatan",
    kind: "relawan",
    province: "Aceh",
    city: "Banda Aceh",
    remote: false,
    description: "Membantu kader memasukkan data timbang balita ke aplikasi dan membuat rekap bulanan.",
    requirements: "Teliti dengan angka. Bisa memakai HP Android.",
    stipend: "Uang transport Rp250.000 per bulan",
    duration: "2 bulan",
    slots: 3,
    tags: ["kesehatan", "data"],
  },
  {
    id: "contoh-penulis-artikel-wisata",
    title: "Penulis artikel wisata daerah",
    orgName: "Jelajah Nusantara Media (contoh)",
    orgKind: "perusahaan",
    category: "konten",
    kind: "proyek",
    province: null,
    city: "",
    remote: true,
    description: "Tulis lima artikel tentang tempat wisata di daerahmu, lengkap dengan foto dari HP.",
    requirements: "Suka menulis dan memotret. Contoh tulisan dari media sosial boleh.",
    stipend: "Rp150.000 per artikel",
    duration: "1 bulan",
    slots: 5,
    tags: ["konten", "komunikasi"],
  },
  {
    id: "contoh-magang-it-support",
    title: "Magang IT support kantor desa",
    orgName: "Kantor Desa Sukamaju (contoh)",
    orgKind: "instansi",
    category: "teknologi",
    kind: "magang",
    province: "Lampung",
    city: "Pringsewu",
    remote: false,
    description: "Merawat komputer dan jaringan kantor desa, serta membantu warga mengurus layanan online.",
    requirements: "Lulusan atau siswa SMK TKJ/RPL, atau sudah belajar jaringan dasar.",
    stipend: "Rp900.000 per bulan",
    duration: "3 bulan",
    slots: 1,
    tags: ["pemrograman", "web"],
  },
];

/** Tangga proyek contoh: proyek singkat/relawan = kecil, magang & paruh waktu berbulan-bulan = sedang, kontrak kerja = tinggi. */
const SAMPLE_LEVELS: Partial<Record<string, OpportunityLevel>> = {
  "contoh-riset-aplikasi-antrean": "sedang",
  "contoh-dashboard-toko-kelontong": "sedang",
  "contoh-konten-koperasi-tani": "sedang",
  "contoh-chatbot-faq-sekolah": "sedang",
  "contoh-asisten-kebun-hidroponik": "sedang",
  "contoh-juru-masak-katering": "sedang",
  "contoh-magang-it-support": "sedang",
  "contoh-admin-gudang-online": "tinggi",
};

/** Lowongan contoh, dipakai saat mode demo dan saat database belum punya lowongan. */
export const SAMPLE_OPPORTUNITIES: readonly Opportunity[] = SAMPLES.map((s) => ({
  ...s,
  level: SAMPLE_LEVELS[s.id] ?? "kecil",
  orgId: "contoh",
  deadline: null,
  review: "disetujui",
  adminNote: "",
  closed: false,
  createdAt: "2026-10-15T00:00:00.000Z",
  sample: true,
}));
