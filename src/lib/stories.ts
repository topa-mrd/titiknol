import type { StoryKind, StoryRow, StoryStatus } from "./types";

/** Cerita yang tampil di Blog/Komunitas. user_id null bila dibaca tanpa login. */
export type Story = Omit<StoryRow, "user_id"> & { user_id: string | null; sample?: boolean };

export const STORY_KIND_LABEL: Record<StoryKind, string> = {
  artikel: "Artikel",
  mentor: "Mentor",
  komunitas: "Komunitas",
};

export const STORY_KIND_HINT: Record<StoryKind, string> = {
  artikel: "Ceritakan perjalananmu: apa yang kamu coba, apa yang gagal, apa yang akhirnya berhasil.",
  mentor: "Ceritakan bidangmu, pengalamanmu, dan bantuan apa yang bisa kamu berikan ke teman yang baru mulai.",
  komunitas: "Ceritakan komunitasmu: siapa saja anggotanya, kegiatannya apa, dan siapa yang boleh bergabung.",
};

export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  draf: "Draf",
  terbit: "Terbit",
  diturunkan: "Diturunkan admin",
};

/** Ubah teks bebas jadi tag: huruf kecil, spasi → tanda hubung, buang karakter lain. */
export function toTag(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
}

/** Tag unik yang valid, maksimal `max`. */
export function cleanTags(raw: readonly string[], max = 6): string[] {
  const out: string[] = [];
  for (const value of raw) {
    const tag = toTag(value);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === max) break;
  }
  return out;
}

/** Nomor WhatsApp → link wa.me; selain itu null (berarti kontaknya link https biasa). */
export function whatsappLink(contact: string): string | null {
  const digits = contact.replace(/[\s-]/g, "");
  if (!/^(\+?62|0)8\d{7,13}$/.test(digits)) return null;
  return `https://wa.me/${digits.replace(/^\+/, "").replace(/^0/, "62")}`;
}

/** Tautan kontak yang aman dibuka: wa.me atau https. */
export function contactHref(contact: string): string | null {
  const wa = whatsappLink(contact);
  if (wa) return wa;
  return /^https:\/\/[^\s]+\.[^\s]+$/.test(contact) ? contact : null;
}

export type StoryFilter = { tag?: string | null; query?: string };

export function filterStories<T extends Pick<Story, "title" | "summary" | "body" | "tags" | "author_name">>(
  stories: readonly T[],
  { tag, query }: StoryFilter,
): T[] {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return stories.filter((s) => {
    if (tag && !s.tags.includes(tag)) return false;
    if (words.length === 0) return true;
    const hay = `${s.title} ${s.summary} ${s.body} ${s.author_name} ${s.tags.join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Tag yang paling sering dipakai, untuk chip filter. */
export function popularTags(stories: readonly Pick<Story, "tags">[], max = 12): string[] {
  const counts = new Map<string, number>();
  for (const s of stories) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t]) => t);
}

/** Perkiraan menit baca (≈200 kata/menit), minimal 1. */
export const readingMinutes = (body: string) => Math.max(1, Math.round(body.trim().split(/\s+/).length / 200));

/** Paragraf dari teks biasa (baris kosong memisahkan paragraf). */
export const paragraphs = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

const SAMPLE_DATE = "2026-09-01T08:00:00.000Z";
const sample = (s: Omit<Story, "user_id" | "status" | "created_at" | "published_at" | "sample">): Story => ({
  ...s,
  user_id: null,
  status: "terbit",
  created_at: SAMPLE_DATE,
  published_at: SAMPLE_DATE,
  sample: true,
});

/**
 * Contoh tulisan agar Blog dan Komunitas tidak kosong saat belum ada yang
 * menulis. Selalu diberi label "Contoh" di UI dan tidak punya kontak sungguhan.
 */
export const SAMPLE_STORIES: readonly Story[] = [
  sample({
    id: "00000000-0000-4000-a000-0000000000a1",
    author_name: "Dimas, Lombok Timur",
    kind: "artikel",
    title: "Belajar data dari HP sampai dapat magang pertama",
    summary: "Laptop belum ada, kuota terbatas. Aku mulai dari spreadsheet di HP dan satu kursus gratis.",
    body:
      "Waktu lulus SMK aku cuma punya HP dan kuota 10 GB sebulan. Semua orang bilang belajar data butuh laptop, jadi aku hampir menyerah sebelum mulai.\n\n" +
      "Aku mulai dari Google Sheets di HP. Tiap malam aku rapikan data penjualan warung ibuku: berapa yang laku, jam berapa ramai. Dari situ aku paham apa gunanya rumus dan grafik.\n\n" +
      "Setelah tiga bulan, aku pinjam laptop sepupu tiap Sabtu untuk mengerjakan kursus gratis. Portofolioku cuma dua proyek, tapi dua-duanya dari data nyata.\n\n" +
      "Waktu melamar magang di dinas kabupaten, yang ditanya bukan sertifikat, tapi proyek warung itu. Mulai dari yang ada di tanganmu dulu.",
    tags: ["data", "belajar-dari-hp", "magang"],
    contact: null,
  }),
  sample({
    id: "00000000-0000-4000-a000-0000000000a2",
    author_name: "Sari, Kupang",
    kind: "artikel",
    title: "Tiga kali ditolak beasiswa, yang keempat aku ubah caranya",
    summary: "Esaiku dulu isinya mimpi besar. Setelah kuganti jadi cerita kecil yang jujur, aku lolos wawancara.",
    body:
      "Tiga esai pertamaku isinya kalimat besar: ingin mengubah Indonesia, ingin membangun daerah. Semuanya ditolak.\n\n" +
      "Kakak tingkat menyarankan satu hal: tulis satu kejadian nyata. Aku menulis tentang listrik yang mati tiap sore di kampungku dan bagaimana aku belajar pakai lampu senter.\n\n" +
      "Esai keempat itu lolos ke wawancara. Pewawancara malah bertanya soal lampu senter itu. Cerita kecil yang jujur lebih diingat daripada janji besar.",
    tags: ["beasiswa", "menulis-esai"],
    contact: null,
  }),
  sample({
    id: "00000000-0000-4000-a000-0000000000a3",
    author_name: "Bayu, Banyumas",
    kind: "artikel",
    title: "Klien desain pertamaku adalah tetangga sendiri",
    summary: "Tanpa portofolio, aku tawarkan desain menu gratis ke warung sebelah. Dari situ datang klien berbayar.",
    body:
      "Aku belajar desain dari video gratis selama dua bulan, tapi tidak ada yang mau membayar desainer tanpa portofolio.\n\n" +
      "Jadi aku tawarkan desain menu gratis ke tiga warung di dekat rumah. Satu setuju. Menunya kupasang di Instagram dengan izin pemiliknya.\n\n" +
      "Dua minggu kemudian, pemilik toko kue melihatnya dan memesan desain kemasan. Itu klien berbayar pertamaku: Rp150 ribu, tapi rasanya seperti gaji pertama.",
    tags: ["desain", "freelance", "portofolio"],
    contact: null,
  }),
  sample({
    id: "00000000-0000-4000-a000-0000000000b1",
    author_name: "Kak Nadia",
    kind: "mentor",
    title: "Siap bantu review CV dan latihan wawancara",
    summary: "HR di perusahaan logistik, lima tahun menyaring CV. Bisa bantu review CV dan simulasi wawancara online.",
    body:
      "Aku bekerja sebagai HR selama lima tahun dan sudah membaca ribuan CV. Banyak kandidat bagus gugur karena CV-nya tidak menunjukkan apa yang sebenarnya mereka bisa.\n\n" +
      "Aku bisa bantu review CV lewat chat dan simulasi wawancara 30 menit lewat video call, gratis, dua orang per minggu. Ceritakan dulu posisi yang kamu incar.",
    tags: ["cv", "wawancara", "karier"],
    contact: null,
  }),
  sample({
    id: "00000000-0000-4000-a000-0000000000b2",
    author_name: "Rizal",
    kind: "mentor",
    title: "Teman belajar web dasar untuk pemula",
    summary: "Developer web lulusan SMK. Bisa menemani belajar HTML, CSS, dan JavaScript dari nol.",
    body:
      "Aku belajar coding sendiri setelah lulus SMK dan sekarang bekerja sebagai developer web. Aku ingat betapa bingungnya mulai sendirian.\n\n" +
      "Kalau kamu sedang belajar HTML, CSS, atau JavaScript dasar dan macet, kirim pertanyaanmu. Aku jawab tiap akhir pekan.",
    tags: ["web", "coding", "pemula"],
    contact: null,
  }),
  sample({
    id: "00000000-0000-4000-a000-0000000000c1",
    author_name: "Komunitas Ngoding Pantura",
    kind: "komunitas",
    title: "Belajar coding bareng tiap Minggu, gratis",
    summary: "Komunitas belajar pemrograman untuk anak muda Pantura. Pertemuan online tiap Minggu malam.",
    body:
      "Kami kumpulan pelajar dan pekerja muda dari kota-kota Pantura yang belajar pemrograman bersama. Anggota sekarang sekitar 120 orang.\n\n" +
      "Tiap Minggu malam ada sesi online: satu orang berbagi materi, sisanya mengerjakan latihan bareng. Terbuka untuk pemula, tidak dipungut biaya.",
    tags: ["coding", "online", "pemula"],
    contact: null,
  }),
  sample({
    id: "00000000-0000-4000-a000-0000000000c2",
    author_name: "Ruang Baca Timur",
    kind: "komunitas",
    title: "Kelompok belajar beasiswa luar negeri",
    summary: "Saling review esai, berbagi info beasiswa, dan latihan IELTS bareng. Anggota dari seluruh Indonesia timur.",
    body:
      "Kami berkumpul karena informasi beasiswa jarang sampai ke daerah kami. Sekarang kami saling berbagi info, saling review esai, dan latihan IELTS bersama dua kali seminggu.\n\n" +
      "Siapa pun yang sedang menyiapkan beasiswa boleh bergabung, dari daerah mana pun.",
    tags: ["beasiswa", "ielts", "online"],
    contact: null,
  }),
];
