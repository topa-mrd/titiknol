import {
  COST_LEVELS,
  LIMITS,
  type ChatMessage,
  type CostLevel,
  type Draft,
  type DraftRequest,
  type Plan,
  type Profile,
  type Refine,
  type ResourceNeed,
  type RoadmapDraft,
  type StepDraft,
  type StoryDraft,
  type StoryDraftRequest,
} from "../types";
import { scrubContacts, storyTags, truncate } from "./normalize";

/**
 * AI tiruan untuk mode demo dan cadangan saat AI sungguhan gagal.
 * Deterministik: membaca cerita (bidang, kota, kendala, modal) lalu
 * menyusun jawaban dari templat. Roadmap tiruan hanya menulis kebutuhan sumber;
 * sumber nyatanya dicari dari katalog oleh lib/resource-search.ts, sama seperti mode asli.
 */

// Bidang

type Field = {
  key: string;
  /** Untuk kalimat "belajar dasar …". */
  topic: string;
  /** Untuk kalimat "menjadi …". */
  role: string;
  pattern: RegExp;
  skills: [string, string, string, string];
  project: string;
  /** Kata kunci topik untuk kebutuhan sumber (dicocokkan ke tag katalog). */
  tags: string[];
  certNeed: ResourceNeed;
  formalNeeds: ResourceNeed[];
  formalTitle: string;
};

const FIELDS: Field[] = [
  {
    key: "beasiswa",
    topic: "persiapan studi lanjut",
    role: "penerima beasiswa kuliah",
    pattern: /luar negeri|beasiswa|\bs2\b|master|magister|jepang|korea|jerman|eropa|belanda|amerika|australia|inggris raya/i,
    skills: ["Bahasa Inggris akademik", "Menulis esai motivasi", "Riset kampus tujuan", "Wawancara beasiswa"],
    project: "draf esai motivasi dan daftar kampus tujuan",
    tags: ["bahasa inggris", "tes bahasa", "luar negeri"],
    certNeed: { type: "ujian", keywords: ["bahasa inggris", "tes bahasa"] },
    formalNeeds: [{ type: "beasiswa", keywords: ["s2", "luar negeri"] }],
    formalTitle: "Daftar beasiswa penuh",
  },
  {
    key: "uiux",
    topic: "desain UI/UX",
    role: "desainer UI/UX",
    pattern: /\bui\b|\bux\b|ui\/ux|figma|desain (?:aplikasi|web|produk)|product design/i,
    skills: ["Riset pengguna", "Wireframe", "Prototipe di Figma", "Studi kasus portofolio"],
    project: "redesain aplikasi yang sering kamu pakai sebagai studi kasus",
    tags: ["ux", "ui", "desain", "portofolio"],
    certNeed: { type: "sertifikasi", keywords: ["ux", "desain"] },
    formalNeeds: [{ type: "kampus", keywords: ["kuliah", "s1"] }, { type: "ujian", keywords: ["utbk", "kuliah"] }],
    formalTitle: "Kuliah desain sambil membangun portofolio",
  },
  {
    key: "grafis",
    topic: "desain grafis",
    role: "desainer grafis",
    pattern: /desain|design|grafis|ilustra|canva|animasi/i,
    skills: ["Prinsip desain visual", "Tipografi dan warna", "Software desain", "Portofolio karya"],
    project: "seri desain promosi untuk UMKM di sekitarmu",
    tags: ["desain", "konten", "media sosial"],
    certNeed: { type: "sertifikasi", keywords: ["desain", "kompetensi"] },
    formalNeeds: [{ type: "kampus", keywords: ["kuliah", "s1"] }, { type: "ujian", keywords: ["utbk", "kuliah"] }],
    formalTitle: "Kuliah desain komunikasi visual",
  },
  {
    key: "data",
    topic: "analisis data",
    role: "data analyst",
    pattern: /\bdata\b|analis|statistik|machine learning|\bai\b|kecerdasan buatan/i,
    skills: ["Spreadsheet", "SQL", "Visualisasi data", "Python dasar"],
    project: "analisis data publik (mis. harga pangan di kotamu) lalu tulis temuannya",
    tags: ["data", "analitik", "sql", "python"],
    certNeed: { type: "sertifikasi", keywords: ["data", "analitik"] },
    formalNeeds: [{ type: "kampus", keywords: ["kuliah", "s1"] }, { type: "ujian", keywords: ["utbk", "kuliah"] }],
    formalTitle: "Kuliah statistika atau sistem informasi",
  },
  {
    key: "programmer",
    topic: "pemrograman",
    role: "software developer",
    pattern: /program|coding|koding|developer|software|aplikasi|website|\bweb\b|\bit\b|komputer|android|game/i,
    skills: ["Dasar pemrograman", "JavaScript", "Git & GitHub", "Membangun aplikasi web"],
    project: "aplikasi web sederhana yang menyelesaikan masalah di sekitarmu",
    tags: ["pemrograman", "web", "javascript"],
    certNeed: { type: "sertifikasi", keywords: ["pemrograman", "web", "cloud"] },
    formalNeeds: [{ type: "kampus", keywords: ["kuliah", "teknik"] }, { type: "ujian", keywords: ["utbk", "kuliah"] }],
    formalTitle: "Kuliah informatika",
  },
  {
    key: "pemasaran",
    topic: "pemasaran digital",
    role: "digital marketer",
    pattern: /marketing|pemasaran|konten|content|sosial media|media sosial|iklan|influencer|copywrit/i,
    skills: ["Strategi konten", "Iklan digital", "Analitik media sosial", "Copywriting"],
    project: "kelola akun media sosial UMKM kenalanmu selama sebulan",
    tags: ["pemasaran", "konten", "digital marketing"],
    certNeed: { type: "sertifikasi", keywords: ["pemasaran", "digital marketing"] },
    formalNeeds: [{ type: "kampus", keywords: ["kuliah", "s1"] }, { type: "ujian", keywords: ["utbk", "kuliah"] }],
    formalTitle: "Kuliah komunikasi atau manajemen pemasaran",
  },
  {
    key: "usaha",
    topic: "mengelola usaha",
    role: "pemilik usaha yang berkembang",
    pattern: /usaha|bisnis|jualan|berjualan|umkm|toko|wirausaha|dagang|kuliner|warung|pengusaha|catering|katering/i,
    skills: ["Pemasaran digital", "Pembukuan sederhana", "Legalitas usaha", "Desain konten promosi"],
    project: "uji jual produk kecil ke 20 pembeli pertama",
    tags: ["umkm", "bisnis", "wirausaha"],
    certNeed: { type: "sertifikasi", keywords: ["pemasaran", "e-commerce"] },
    formalNeeds: [{ type: "program", keywords: ["umkm", "legalitas", "wirausaha"] }],
    formalTitle: "Pelatihan usaha + legalitas resmi",
  },
  {
    key: "guru",
    topic: "dunia pendidikan",
    role: "guru",
    pattern: /guru|mengajar|pendidik|dosen|tutor|pengajar/i,
    skills: ["Merancang pembelajaran", "Berbicara di depan kelas", "Literasi digital", "Penilaian belajar"],
    project: "kelas belajar gratis untuk anak-anak di lingkunganmu",
    tags: ["pendidikan", "guru"],
    certNeed: { type: "program", keywords: ["guru", "sertifikat pendidik"] },
    formalNeeds: [{ type: "beasiswa", keywords: ["s1", "kuliah"] }, { type: "kampus", keywords: ["kuliah", "s1"] }],
    formalTitle: "Kuliah keguruan lalu PPG",
  },
  {
    key: "kesehatan",
    topic: "bidang kesehatan",
    role: "tenaga kesehatan",
    pattern: /perawat|dokter|bidan|kesehatan|farmasi|apoteker|gizi/i,
    skills: ["Biologi dan anatomi dasar", "Komunikasi dengan pasien", "Pertolongan pertama", "Etika profesi"],
    project: "jadi relawan kegiatan kesehatan masyarakat di daerahmu",
    tags: ["kesehatan", "sains"],
    certNeed: { type: "sertifikasi", keywords: ["kompetensi", "vokasi"] },
    formalNeeds: [{ type: "ujian", keywords: ["utbk", "kuliah"] }, { type: "beasiswa", keywords: ["s1", "kuliah"] }],
    formalTitle: "Kuliah kesehatan lewat SNPMB",
  },
  {
    key: "teknik",
    topic: "keterampilan teknik",
    role: "teknisi bersertifikat",
    pattern: /mesin|otomotif|\blas\b|listrik|teknisi|bengkel|montir|elektronik/i,
    skills: ["Keselamatan kerja", "Membaca gambar teknik", "Perawatan alat", "Diagnosis kerusakan"],
    project: "praktik servis di bengkel atau usaha teknik dekat rumah",
    tags: ["vokasi", "keterampilan"],
    certNeed: { type: "sertifikasi", keywords: ["kompetensi", "vokasi"] },
    formalNeeds: [{ type: "program", keywords: ["vokasi", "pelatihan"] }],
    formalTitle: "Pelatihan vokasi resmi",
  },
];

const GENERAL: Field = {
  key: "umum",
  topic: "bidang impianmu",
  role: "profesional di bidang impianmu",
  pattern: /$^/,
  skills: ["Belajar mandiri", "Komunikasi", "Manajemen waktu", "Portofolio karya"],
  project: "proyek kecil yang bisa kamu tunjukkan ke orang lain",
  tags: ["kerja", "karier"],
  certNeed: { type: "sertifikasi", keywords: ["kompetensi", "kerja"] },
  formalNeeds: [{ type: "kampus", keywords: ["kuliah", "s1"] }],
  formalTitle: "Pendidikan formal yang fleksibel",
};

/** Bidang dibaca dari mimpi dulu; latar belakang hanya dipakai bila mimpi tidak jelas. */
export function detectField(dream: string, background = ""): Field {
  return FIELDS.find((f) => f.pattern.test(dream)) ?? FIELDS.find((f) => f.pattern.test(background)) ?? GENERAL;
}

// Kota, kendala, modal

const CITIES = [
  "Jakarta", "Bandung", "Surabaya", "Medan", "Semarang", "Makassar", "Palembang", "Yogyakarta", "Jogja",
  "Solo", "Surakarta", "Malang", "Kediri", "Denpasar", "Balikpapan", "Samarinda", "Pontianak", "Banjarmasin",
  "Manado", "Padang", "Pekanbaru", "Batam", "Jambi", "Bengkulu", "Bandar Lampung", "Lampung", "Banda Aceh",
  "Aceh", "Mataram", "Lombok", "Kupang", "Ambon", "Jayapura", "Sorong", "Ternate", "Kendari", "Palu",
  "Gorontalo", "Bogor", "Depok", "Tangerang", "Bekasi", "Cirebon", "Tasikmalaya", "Purwokerto", "Tegal",
  "Pekalongan", "Magelang", "Klaten", "Madiun", "Jember", "Banyuwangi", "Probolinggo", "Blitar",
  "Tulungagung", "Garut", "Sukabumi", "Serang", "Cilegon", "Karawang", "Sidoarjo", "Gresik", "Lamongan",
  "Bojonegoro", "Kudus", "Pati", "Salatiga", "Wonosobo", "Cilacap", "Mojokerto", "Pasuruan", "Ponorogo",
  "Pacitan", "Nganjuk", "Lumajang", "Bali", "Papua", "Kalimantan", "Sulawesi", "Sumatra", "Madura", "Flores",
];

export function detectLocation(text: string): string | null {
  for (const city of CITIES) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) return city === "Jogja" ? "Yogyakarta" : city;
  }
  return null;
}

const CONSTRAINTS: [RegExp, string][] = [
  [/\b(?:biaya|uang|ekonomi|mahal|finansial|dana)\b|(?:tidak|gak|nggak|kurang) mampu|gaji (?:kecil|pas-pasan)/i, "Biaya terbatas"],
  [/sambil (?:kerja|bekerja)|(?:sudah|lagi|sedang) (?:kerja|bekerja)|kerja (?:paruh|shift|serabutan)|jaga toko|\bkaryawan\b|\bburuh\b/i, "Harus sambil bekerja"],
  [/(?:tidak|gak|nggak|kurang) (?:punya )?waktu|\bsibuk\b|(?:cuma|hanya) bisa (?:belajar )?malam/i, "Waktu belajar terbatas"],
  [/orang ?tua|\bkeluarga\b|\badik\b|\bmerawat\b|tulang punggung/i, "Ada tanggung jawab keluarga"],
  [/(?:tidak|gak|nggak|belum) punya (?:laptop|komputer)|\bsinyal\b|internet (?:lemot|susah|terbatas)|\bkuota\b/i, "Akses perangkat atau internet terbatas"],
  [/\b(?:desa|kampung|pelosok|terpencil)\b|jauh dari kota/i, "Jauh dari pusat pelatihan"],
  [/bahasa inggris(?:ku)? (?:masih )?(?:lemah|kurang|jelek|pas-pasan)|(?:tidak|gak|nggak|belum) bisa bahasa inggris/i, "Bahasa Inggris masih perlu ditingkatkan"],
  [/\b(?:bingung|ragu|minder|takut)\b|(?:tidak|gak|nggak|kurang) percaya diri/i, "Masih ragu harus mulai dari mana"],
];

const STRENGTHS: [RegExp, string][] = [
  [/\bsmk\b/i, "Berlatar belakang SMK, terbiasa praktik"],
  [/\bsma\b|\bma\b|aliyah/i, "Lulusan SMA/sederajat"],
  [/\bs1\b|\bd3\b|sarjana|mahasiswa|(?:sedang|lagi|pernah|sudah) kuliah/i, "Punya pengalaman pendidikan tinggi"],
  [/pernah|pengalaman|sudah (?:belajar|coba|mencoba)|terbiasa|bisa sedikit/i, "Sudah punya pengalaman awal"],
  [/\b(?:suka|hobi|senang|tertarik|passion)\b/i, "Punya minat kuat pada bidang ini"],
  [/(?:sudah|lagi|sedang) (?:kerja|bekerja)/i, "Punya pengalaman kerja"],
];

const matches = (text: string, rules: [RegExp, string][]) =>
  rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s+|\n+/)[0]?.trim() ?? "";
const has = (profile: Profile, constraint: string) => profile.constraints.includes(constraint);

// Draft

export function buildProfile(input: DraftRequest): Profile {
  const story = `${input.dream}\n${input.background}`;
  const field = detectField(input.dream, input.background);
  const location = detectLocation(story);
  const constraints = matches(story, CONSTRAINTS).slice(0, LIMITS.list);
  const strengths = [...matches(story, STRENGTHS), "Punya tekad untuk mulai sekarang"].slice(0, LIMITS.list);

  const where = location ? ` dari ${location}` : "";
  const hurdle = constraints.length
    ? ` Kendala utamamu: ${constraints.map((c) => c.toLowerCase()).join(", ")}.`
    : "";
  return {
    dream: truncate(input.dream.trim(), LIMITS.dream),
    summary: truncate(`Kamu${where} ingin menjadi ${field.role}.${hurdle}`, LIMITS.text),
    currentCondition: truncate(firstSentence(input.background) || "Belum diceritakan secara detail.", LIMITS.text),
    location,
    constraints,
    strengths,
  };
}

function buildPlans(profile: Profile, field: Field): Plan[] {
  const tight = has(profile, "Biaya terbatas");
  const working = has(profile, "Harus sambil bekerja") || has(profile, "Waktu belajar terbatas");
  const schedule = working ? " Jadwalnya 1–2 jam per hari di luar jam kerja." : "";
  const usaha = field.key === "usaha";

  return [
    {
      id: "A",
      title: `Belajar mandiri + sertifikasi ${field.topic}`,
      tagline: "Mulai dari kursus gratis, buktikan kemampuan dengan sertifikat dan karya.",
      approach: `Ikuti kursus online ${field.topic}, kerjakan ${field.project}, lalu ambil sertifikasi yang diakui industri.${schedule}`,
      whyFits: tight
        ? "Biayanya paling rendah dan bisa dijalani dari rumah tanpa harus pindah kota."
        : "Paling cepat untuk membuktikan kemampuan dan bisa disesuaikan dengan ritmemu.",
      duration: working ? "8–12 bulan" : "6–9 bulan",
      costLevel: tight ? "gratis" : "rendah",
      milestones: [
        `Selesai kursus dasar ${field.topic}`,
        `Punya karya pertama: ${field.project}`,
        "Lulus satu sertifikasi",
        "Mulai melamar magang, kerja, atau proyek",
      ],
      tradeoff: "Butuh disiplin tinggi karena tidak ada dosen atau jadwal tetap.",
    },
    {
      id: "B",
      title: working && !usaha ? "Kuliah jarak jauh sambil bekerja" : field.formalTitle,
      tagline: usaha
        ? "Rapikan usaha lewat pelatihan resmi dan legalitas sejak awal."
        : "Jalur formal yang lebih lama, tapi membuka lebih banyak pintu.",
      approach: usaha
        ? "Ikuti pelatihan usaha dari pemerintah, urus NIB lewat OSS, lalu kembangkan pemasaran online secara bertahap."
        : `Siapkan jalur pendidikan formal di ${field.topic}${tight ? " sambil mengincar beasiswa atau bantuan biaya kuliah" : ""}.${schedule}`,
      whyFits: tight
        ? "Ada skema bantuan biaya, jadi keterbatasan dana tidak harus jadi penghalang."
        : "Cocok kalau kamu ingin dasar yang kuat dan ijazah resmi.",
      duration: usaha ? "3–6 bulan" : field.key === "beasiswa" ? "12–18 bulan persiapan" : "3–4 tahun",
      costLevel: tight ? "rendah" : "sedang",
      milestones: usaha
        ? ["Ikut pelatihan usaha", "NIB terbit", "Katalog produk online siap", "Penjualan rutin tiap minggu"]
        : ["Pilih kampus atau program tujuan", "Siapkan berkas dan nilai yang dibutuhkan", "Daftar dan ikut seleksi", "Mulai kuliah"],
      tradeoff: usaha
        ? "Hasilnya bergantung pada konsistensi berjualan, bukan hanya pelatihan."
        : "Waktunya paling panjang dan seleksinya kompetitif.",
    },
    {
      id: "C",
      title: usaha ? "Mulai jualan kecil sekarang" : "Praktik langsung lewat magang dan proyek",
      tagline: "Belajar sambil mengerjakan hal nyata, jaringan tumbuh dari situ.",
      approach: usaha
        ? "Mulai dari produk paling sederhana, jual ke lingkungan terdekat, dan perbaiki dari masukan pembeli."
        : `Cari magang, kegiatan relawan, atau proyek mikro di ${field.topic} sambil belajar seperlunya.${schedule}`,
      whyFits: profile.location
        ? `Bisa dimulai dari ${profile.location} dan lewat program online, jadi tidak perlu menunggu.`
        : "Bisa dimulai segera dan langsung menambah pengalaman untuk CV.",
      duration: "3–6 bulan",
      costLevel: "gratis",
      milestones: usaha
        ? ["Produk pertama terjual", "Punya 20 pelanggan pertama", "Catatan keuangan rapi"]
        : ["Ikut satu kegiatan relawan atau proyek", "Dapat magang pertama", "Punya rekomendasi dari pembimbing"],
      tradeoff: "Teori kurang terstruktur, jadi perlu dilengkapi belajar mandiri.",
    },
  ];
}

export function mockDraft(input: DraftRequest): Draft {
  const profile = buildProfile(input);
  const field = detectField(input.dream, input.background);
  const greet = profile.location ? `Halo, teman dari ${profile.location}!` : "Terima kasih sudah bercerita!";
  return {
    message: `${greet} Aku sudah membaca ceritamu tentang menjadi ${field.role}. Ini tiga jalur yang bisa kamu pertimbangkan; pilih yang paling pas, atau minta aku merevisinya.`,
    profile,
    plans: buildPlans(profile, field),
  };
}

// Refine

const cheaper = (level: CostLevel): CostLevel => COST_LEVELS[Math.max(0, COST_LEVELS.indexOf(level) - 1)];

const addConstraint = (profile: Profile, constraint: string): Profile =>
  profile.constraints.includes(constraint) || profile.constraints.length >= LIMITS.list
    ? profile
    : { ...profile, constraints: [...profile.constraints, constraint] };

const appendText = (text: string, extra: string, max: number) =>
  text.includes(extra) ? text : truncate(`${text} ${extra}`, max);

export function mockRefine(profile: Profile, plans: Plan[], messages: ChatMessage[]): Refine {
  const last = messages.at(-1)?.content ?? "";

  if (/murah|biaya|gratis|hemat|uang|terjangkau/i.test(last)) {
    return {
      reply: "Sudah kuperbarui. Semua plan kuarahkan ke opsi yang lebih hemat: kursus gratis, bantuan biaya, dan program pemerintah.",
      profile: addConstraint(profile, "Biaya terbatas"),
      plans: plans.map((plan) =>
        plan.costLevel === "gratis"
          ? plan
          : {
              ...plan,
              costLevel: cheaper(plan.costLevel),
              approach: appendText(plan.approach, "Prioritaskan kelas gratis dan skema bantuan biaya.", LIMITS.text),
            },
      ),
    };
  }

  if (/kerja|sambil|paruh waktu|shift/i.test(last)) {
    const extra = "Jadwalnya 1–2 jam per hari di luar jam kerja.";
    return {
      reply: "Siap. Semua plan kusesuaikan supaya bisa dijalani sambil bekerja, dengan jadwal belajar yang lebih ringan.",
      profile: addConstraint(profile, "Harus sambil bekerja"),
      plans: plans.map((plan) =>
        plan.approach.includes(extra)
          ? plan
          : {
              ...plan,
              approach: appendText(plan.approach, extra, LIMITS.text),
              ...(plan.id === "B" ? { title: "Kuliah jarak jauh sambil bekerja" } : {}),
            },
      ),
    };
  }

  if (/kota|tetap di|tidak pindah|gak pindah|nggak pindah|daerah|rumah/i.test(last)) {
    const where = profile.location ? `di ${profile.location}` : "di kotamu";
    const extra = `Bisa dijalani ${where} lewat kelas online dan program jarak jauh.`;
    return {
      reply: `Oke, kamu tetap ${where}. Plan yang butuh pindah kota kuganti dengan opsi online dan jarak jauh.`,
      profile: addConstraint(profile, "Ingin tetap di kota asal"),
      plans: plans.map((plan) =>
        plan.whyFits.includes(extra) ? plan : { ...plan, whyFits: appendText(plan.whyFits, extra, LIMITS.text) },
      ),
    };
  }

  const note = truncate(last, 120);
  return {
    reply: `Catatanmu sudah kumasukkan ke Plan A: "${note}". Kalau ingin perubahan lain, ceritakan saja.`,
    profile,
    plans: plans.map((plan) =>
      plan.id === "A" ? { ...plan, whyFits: appendText(plan.whyFits, `Mempertimbangkan: ${note}`, LIMITS.text) } : plan,
    ),
  };
}

// Roadmap

export function mockRoadmap(profile: Profile, plan: Plan): RoadmapDraft {
  const field = detectField(`${profile.dream} ${plan.title}`, plan.approach);
  const working = has(profile, "Harus sambil bekerja") || has(profile, "Waktu belajar terbatas");
  const pace = working ? "Sisihkan 1 jam tiap malam untuk" : "Luangkan waktu rutin untuk";
  const [skill1, skill2, skill3, skill4] = field.skills;
  const learn: ResourceNeed = { type: "kursus", keywords: field.tags };
  const experience: ResourceNeed[] = [
    { type: "relawan", keywords: ["relawan", "pengalaman"] },
    { type: "program", keywords: ["magang", "pengalaman"] },
  ];

  const focus: Record<Plan["id"], { title: string; description: string; needs: ResourceNeed[]; todos: string[] }> = {
    A: {
      title: field.certNeed.type === "ujian" ? "Ambil tes bahasa" : "Ambil sertifikasi pertama",
      description: "Pilih satu sertifikasi atau tes yang paling relevan, pelajari materi persiapannya, lalu ikuti ujiannya.",
      needs: [field.certNeed],
      todos: ["Bandingkan syarat dan biaya", "Kerjakan latihan soal", "Daftar dan ikut ujian"],
    },
    B: {
      title: field.key === "usaha" ? "Urus legalitas dan pelatihan resmi" : "Siapkan jalur pendidikan formal",
      description:
        field.key === "usaha"
          ? "Daftarkan usahamu dan ikuti pelatihan dari pemerintah supaya lebih mudah dipercaya pembeli dan mitra."
          : "Kumpulkan informasi seleksi, syarat berkas, dan skema bantuan biaya untuk kampus atau beasiswa tujuan.",
      needs: field.formalNeeds,
      todos: ["Catat tenggat pendaftaran", "Siapkan dokumen yang diminta", "Minta masukan dari guru atau kakak tingkat"],
    },
    C: {
      title: "Cari pengalaman nyata",
      description: "Ikuti magang, kegiatan relawan, atau proyek mikro supaya punya pengalaman yang bisa diceritakan.",
      needs: [experience[1], experience[0]],
      todos: ["Daftar ke dua kesempatan sekaligus", "Siapkan CV satu halaman", "Tulis catatan belajar tiap minggu"],
    },
  };
  const chosen = focus[plan.id];

  const steps: StepDraft[] = [
    {
      id: "s1",
      title: `Kenali dasar ${field.topic}`,
      description: `Pahami gambaran besar ${field.topic} dan tentukan target yang ingin dicapai dalam 3 bulan pertama.`,
      why: "Fondasi yang jelas membuat langkah berikutnya lebih terarah dan tidak mudah menyerah.",
      weeks: 2,
      todos: [`${pace} materi pengantar`, "Tulis tujuan 3 bulan dalam satu kalimat", "Cari satu orang yang sudah di bidang ini untuk ditanya"],
      skills: [skill1],
      needs: [learn],
    },
    {
      id: "s2",
      title: "Ikuti kursus inti",
      description: `Selesaikan satu kursus terstruktur tentang ${field.topic} sampai tuntas.`,
      why: "Kursus terstruktur mencegah belajar loncat-loncat dan memberi bukti selesai.",
      weeks: working ? 6 : 4,
      todos: ["Selesaikan modul minggu ini", "Rangkum materi dengan kata-katamu sendiri", "Kerjakan semua latihan"],
      skills: [skill1, skill2],
      needs: [learn],
    },
    {
      id: "s3",
      title: "Bangun karya pertama",
      description: `Kerjakan ${field.project}.`,
      why: "Karya nyata lebih meyakinkan daripada sekadar daftar kursus.",
      weeks: 3,
      todos: ["Tentukan ruang lingkup yang kecil", "Kerjakan versi pertama", "Minta masukan dari dua orang"],
      skills: [skill2, skill3],
      needs: [],
    },
    {
      id: "s4",
      title: chosen.title,
      description: chosen.description,
      why: `Ini inti dari ${plan.title}.`,
      weeks: plan.id === "B" ? 6 : 4,
      todos: chosen.todos,
      skills: [skill3],
      needs: chosen.needs.slice(0, 2),
    },
    {
      id: "s5",
      title: "Tambah pengalaman dan jejaring",
      description: "Gabung kegiatan atau komunitas supaya kemampuanmu teruji dan dikenal orang.",
      why: "Banyak kesempatan datang dari orang yang pernah melihat hasil kerjamu.",
      weeks: 4,
      todos: ["Ikut satu kegiatan atau proyek mikro", "Kenalan dengan tiga orang di bidang ini", "Dokumentasikan hasilnya"],
      skills: [skill4, "Kolaborasi"],
      needs: experience,
    },
    {
      id: "s6",
      title: field.key === "beasiswa" ? "Kirim lamaran beasiswa" : "Rapikan portofolio dan mulai melamar",
      description:
        field.key === "beasiswa"
          ? "Finalkan esai, rekomendasi, dan sertifikat bahasa, lalu kirim lamaran sebelum tenggat."
          : "Susun portofolio dan CV, lalu kirim lamaran ke magang, pekerjaan, atau klien pertama.",
      why: "Langkah terakhir yang mengubah semua persiapan menjadi kesempatan nyata.",
      weeks: 3,
      todos: ["Rapikan CV dan portofolio", "Kirim minimal lima lamaran", "Catat dan evaluasi setiap jawaban"],
      skills: [skill4],
      needs:
        field.key === "beasiswa"
          ? [{ type: "beasiswa", keywords: ["s2", "luar negeri"] }]
          : [{ type: "program", keywords: ["kerja", "lowongan", "karier"] }],
    },
  ];

  return {
    title: truncate(`Roadmap ${plan.title}`, LIMITS.short),
    summary: truncate(
      `Enam langkah dari kondisimu sekarang menuju mimpimu menjadi ${field.role}, lewat jalur "${plan.title}".`,
      LIMITS.text,
    ),
    steps,
  };
}

// Tulisan (Share your story)

const STORY_TOPICS: [RegExp, string][] = [
  [/beasiswa|scholarship/i, "beasiswa"],
  [/magang|intern/i, "magang"],
  [/freelance|klien|lepas/i, "freelance"],
  [/\bhp\b|handphone|ponsel/i, "belajar-dari-hp"],
  [/kuliah|kampus|mahasiswa/i, "kuliah"],
  [/\bcv\b|wawancara|interview|melamar/i, "melamar-kerja"],
  [/bahasa inggris|ielts|toefl|english/i, "bahasa-inggris"],
  [/gagal|ditolak|menyerah/i, "bangkit"],
  [/komunitas|kumpul|bareng/i, "belajar-bareng"],
  [/online|daring|zoom|video call/i, "online"],
];

const sentencesOf = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Tulisan tiruan: memakai kalimat pengguna apa adanya (tidak menambah fakta),
 * dirapikan jadi paragraf, ditambah judul, ringkasan, dan tag dari kata kunci.
 */
export function mockStory(input: StoryDraftRequest): StoryDraft {
  const clean = scrubContacts(input.transcript).trim();
  const sentences = sentencesOf(clean);
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const first = capital(sentences[0] ?? clean).replace(/[.!?]+$/, "");
  const fallbackTitle = { artikel: "Ceritaku", mentor: "Siap berbagi pengalaman", komunitas: "Kenalan dengan komunitas kami" }[input.kind];
  const title = first.length >= LIMITS.story.titleMin ? truncate(first, 80) : fallbackTitle;

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) paragraphs.push(sentences.slice(i, i + 3).map(capital).join(" "));
  const body = truncate(paragraphs.join("\n\n") || clean, LIMITS.story.body);

  const field = detectField(clean);
  const tags = [
    ...(field.key === "umum" ? [] : [field.tags[0]]),
    ...STORY_TOPICS.filter(([re]) => re.test(clean)).map(([, tag]) => tag),
  ];
  return {
    title,
    summary: truncate(sentences.slice(0, 2).join(" ") || clean, 200),
    body,
    tags: storyTags(tags, input.kind),
  };
}
