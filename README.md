# TitikNol

**Tell me your dream. We will help you.**

Aplikasi web untuk anak muda Indonesia, terutama dari daerah dan dengan biaya terbatas, agar bisa mengubah mimpi menjadi langkah nyata. Pengguna cukup bercerita, boleh lewat suara. TitikNol lalu menyusun tiga pilihan rencana, roadmap mingguan dengan sumber belajar yang sudah dicek, perkiraan biaya, pengalaman kerja nyata dari mitra, dan tempat untuk berbagi cerita.

Dibuat untuk JOINTS UGM 2026. Versi live: https://titiknol-inspireugm.vercel.app

---

## Ringkasan proposal

**Masalah.** Banyak pemuda di daerah sudah punya akses internet, tetapi bingung harus mulai dari mana. Informasi kursus, beasiswa, dan jalur karier tersebar dan terlalu banyak (*choice overload*). Biayanya juga tidak jelas, dan kesempatan kerja pertama biasanya menuntut pengalaman yang belum mereka punya.

**Sasaran.** Siswa kelas akhir SMA/SMK, lulusan *gap year*, mahasiswa, dan lulusan baru, terutama dari daerah dan keluarga berbiaya terbatas.

**Solusi.** Satu perjalanan lima tahap: bercerita, menerima rencana yang bisa dipilih dan direvisi, menjalankan roadmap mingguan, mendapat pengalaman dari proyek nyata, lalu membagikan ceritanya untuk menginspirasi orang lain.

**Pembeda.**
- Berbasis cerita, bukan formulir. Pengguna bisa bicara dengan bahasa sehari-hari.
- Jujur soal biaya. Angka selalu bersumber dan berlabel perkiraan, disertai opsi yang lebih hemat.
- AI tidak mengarang tautan atau nama beasiswa. Semua tautan berasal dari katalog terkurasi atau metadata hasil pencarian.
- Admin TitikNol menjadi penghubung antara talenta dan mitra, sehingga lowongan dicek dan data pelamar terlindungi.
- Tangga proyek bertahap (kecil → sedang → tinggi) dan squad, agar pemula tidak langsung dilempar ke proyek berisiko tinggi.
- Ringan dan *mobile-first*: tanpa unduhan aplikasi, tanpa foto berat, dan tetap berjalan di mode demo.

**Strategi awal.** Uji coba di daerah percontohan lewat sekolah dan guru BK, komunitas kampus, dan karang taruna. Mitra UMKM membuka proyek mikro, sedangkan mitra CSR, yayasan, dan pemda diajak bekerja sama untuk beasiswa dan pendanaan proyek.

---

## Fitur

### 1. Tell me your dream (`/start`)
- Dua pertanyaan: "Apa mimpimu?" dan "Ceritakan kondisimu sekarang".
- Jawaban bisa lewat suara atau ketikan. Di Chrome, Edge, dan Safari dipakai pengenal suara bawaan browser. Di Brave dan Firefox dipakai mode rekam (maks. 1 menit) yang ditranskripsi AI di server, dan rekamannya tidak disimpan.
- Tidak perlu akun. Draf disimpan di perangkat.

### 2. Drafting (`/draft`)
- AI menyusun profil singkat (mimpi, kondisi, lokasi, kendala, modal) dan tiga rencana: Plan A, B, dan C. Tiap rencana punya durasi, kategori biaya, tonggak, dan kekurangan yang jujur.
- Profil bisa dikoreksi, dan rencana bisa direvisi lewat chat, misalnya "cari yang lebih murah" atau "aku harus sambil kerja".
- Pengguna memilih satu plan, lalu masuk untuk menyimpannya jadi roadmap.

### 3. Roadmap (`/roadmap`)
- Berisi 4–10 langkah mingguan berbentuk jalur ala Duolingo, dengan penanda "Kamu di sini" dan tugas yang bisa dicentang.
- Sumber belajar tiap langkah diambil dari katalog terkurasi (54 sumber). Bila katalog kurang, sumber dicari lewat Google Search dan diberi label "dari web, belum dicek".
- **Kalkulator biaya** menjumlahkan harga sumber, lalu mencari biaya besar di web: kuliah/UKT, biaya hidup, visa, tiket, dan asuransi. Hasilnya berupa rentang bersumber berlabel "perkiraan AI", disertai pengingat bahwa angka ini patokan, bukan kepastian.
- **Opsi lebih hemat** (beasiswa, bantuan biaya, alternatif murah) juga hanya ditampilkan bila ada sumbernya. Pengguna bisa meminta "plan lebih hemat" langsung dari roadmap.

### 4. Experience (`/experience`)
- Lowongan magang dan proyek dari mitra yang sudah diverifikasi admin. Bisa disaring berdasarkan bidang, daerah (38 provinsi atau online), dan tingkat. Lowongan diurutkan sesuai kecocokan dengan roadmap pengguna.
- **Pengguna memilih sendiri** lalu mendaftar dengan kontak, alasan, tautan portofolio/CV (opsional), dan ringkasan roadmap (opsional).
- **Tangga proyek:**

  | Tingkat | Terbuka bila |
  |---|---|
  | Kecil | Selalu (titik awal semua pengguna baru) |
  | Sedang | Sudah menyelesaikan 1 proyek |
  | Tinggi | Sudah menyelesaikan 1 proyek tingkat sedang |

  Kartu yang terkunci menjelaskan syarat membukanya. Aturan ini ditegakkan di database.
- **Squad:** tim berisi 2–4 orang yang dibentuk admin, lengkap dengan tautan grup (misalnya WhatsApp). Anggota melihat nama dan status teman satu squad, dan bisa menandai diri **izin** beserta alasan singkat. Kontak dan CV tetap privat.

### 5. Share your story (`/share`, `/blog`, `/komunitas`)
- Pengguna bercerita lewat suara atau ketikan. AI hanya merapikan kata-katanya tanpa menambah fakta, lalu pengguna mengedit dan menerbitkan.
- Tiga jenis tulisan: **artikel** (tampil di Blog), **profil mentor**, dan **profil komunitas** (tampil di Komunitas, wajib mencantumkan kontak).
- Tulisan bisa dibagikan ke WhatsApp atau lewat salin link.

### Pendukung
- Login dengan email atau Google, serta halaman Kebijakan Privasi (`/privasi`) dan Syarat Layanan (`/syarat`).
- Efek suara ringan saat berpindah tahap, navigasi tab bawah di HP, dan maskot "Titik".
- Aksesibel: lolos audit axe, fokus keyboard terlihat, dan menghormati pengaturan "kurangi animasi".

---

## Peran dan alur

Ada tiga peran: **Talenta** (pengguna), **Mitra** (pemberi lowongan), dan **Admin** (tim TitikNol, penghubung keduanya).

```
Talenta ──daftar──▶  Admin  ──teruskan──▶  Mitra
   ▲                 cek, saring,          terima, kerjakan,
   └──── squad ───── bentuk squad          tandai selesai
```

### Alur Talenta
1. Buka `/start`, ceritakan mimpi dan kondisi.
2. Di `/draft`, lihat Plan A/B/C, revisi lewat chat, lalu pilih satu.
3. Masuk akun untuk menyimpan roadmap.
4. Di `/roadmap`, jalankan langkah mingguan, centang tugas, buka sumber belajar, dan hitung biaya. Bila perlu, minta plan lebih hemat.
5. Di `/experience`, pilih lowongan sesuai tingkat yang terbuka (awalnya proyek kecil), lalu daftar.
6. Pantau status di **Lamaranku**. Lamaran bisa dibatalkan selama belum diteruskan.
7. Setelah diteruskan, admin bisa memasukkanmu ke squad. Buka grup squad, lihat kondisi teman, dan tandai **izin** bila berhalangan.
8. Setelah mitra menandai proyek **selesai**, tingkat berikutnya terbuka.
9. Bagikan pengalamanmu di `/share`.

### Alur Mitra (`/mitra`)
1. Masuk akun, lalu isi data organisasi sekali (nama, jenis, daerah, kontak). Kontak hanya terlihat oleh tim TitikNol.
2. Buka lowongan. Uang saku dan durasi wajib diisi. Tentukan juga bidang, daerah atau online, kuota, batas daftar, dan **tingkat proyek** (kecil/sedang/tinggi).
3. Lowongan berstatus **menunggu verifikasi** sampai disetujui admin. Bila isi atau tingkatnya diubah, lowongan kembali menunggu verifikasi.
4. Pendaftar baru terlihat setelah **diteruskan** admin, lengkap dengan kontak, alasan, portofolio/CV, dan ringkasan roadmap.
5. Kelola talenta dengan mengubah status ke **diterima → bekerja → selesai**, atau **ditolak**. Mitra juga bisa menambahkan catatan untuk talenta.
6. Pantau **Squad di lowonganmu**: anggota dan status izinnya.

### Alur Admin (`/admin`)
Admin adalah akun yang tercatat di tabel `admins` (lihat `npm run admin:add`). Di mode demo, siapa pun yang masuk bisa mencoba peran admin.

| Tab | Yang dilakukan admin |
|---|---|
| **Lowongan** | Memeriksa lowongan mitra, lalu **menyetujui** atau **menolak**. Catatan wajib diisi bila menolak, dan mitra bisa melihatnya. |
| **Pendaftar** | Menyaring lamaran: **dikirim → diproses → diteruskan** ke mitra, atau **ditolak**. Catatan tim bisa ditambahkan. Setelah diteruskan, status selanjutnya diatur mitra. |
| **Squad** | Membuat squad per lowongan (nama, tautan grup, catatan), memasukkan pendaftar yang sudah diteruskan (maks. 4 orang), memindahkan anggota, atau menghapus squad. |
| **Blog & komunitas** | Memoderasi tulisan yang terbit: **turunkan** tulisan yang melanggar atau **tayangkan** kembali. Admin tidak bisa mengubah isi tulisan. |
| **Katalog sumber** | Memeriksa sumber hasil pencarian web (status "belum dicek"), merevisi data seperti nama, harga, dan tautan, lalu **menyetujui** atau **menolak**. Sumber yang ditolak tidak tampil lagi di roadmap. |

### Status lamaran

| Status | Diatur oleh | Terlihat mitra? |
|---|---|---|
| dikirim, diproses | Admin | Tidak |
| diteruskan | Admin | Ya, mulai di sini |
| diterima, bekerja, selesai | Mitra | Ya |
| ditolak | Admin atau mitra | Hanya bila pernah diteruskan |
| dibatalkan | Talenta (sebelum diteruskan) | Tidak |

Semua aturan di atas ditegakkan di database lewat Row Level Security dan trigger, bukan hanya di tampilan.

---

## Menjalankan

Butuh Node 22.

```bash
npm install
npm run dev            # http://localhost:3000
```

Tanpa `.env.local`, aplikasi langsung jalan penuh dalam **mode demo**:
- AI memakai jawaban tiruan yang tetap membaca cerita pengguna.
- Login memakai akun demo, dan data tersimpan di `localStorage`.
- Peran admin bisa dicoba oleh siapa pun yang masuk.

## Konfigurasi

Salin `.env.example` ke `.env.local`. Semua variabel boleh kosong.

| Variabel | Untuk apa |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Login sungguhan dan data per akun di Supabase |
| `GEMINI_API_KEY` | AI utama dan pencarian web (Google Search grounding) |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | AI cadangan lewat OpenRouter |
| `SUPABASE_SECRET_KEY` | Server saja: menyimpan hasil pencarian web ke katalog |
| `AI_PROVIDER` | Paksa `gemini`, `openrouter`, atau `mock` |
| `AI_FALLBACK_TO_MOCK` | `false` = tampilkan error alih-alih jawaban tiruan |
| `NEXT_PUBLIC_SITE_URL` | URL dasar situs untuk metadata dan redirect login |
| `SUPABASE_DB_URL` | Hanya di mesin developer, untuk `npm run db:apply` |

Key AI dan `SUPABASE_SECRET_KEY` hanya dibaca di server. Jangan pernah memberinya prefix `NEXT_PUBLIC_`.

### Menyiapkan Supabase
1. Jalankan `supabase/setup.sql` di SQL Editor, atau `npm run db:apply` dengan `SUPABASE_DB_URL`. Skrip ini idempoten.
2. Authentication → Email: matikan **Confirm email** agar demo tidak macet karena batas email.
3. Isi URL dan key di `.env.local`, lalu cek dengan `npm run db:verify`.
4. Daftarkan admin (akunnya harus sudah ada): `npm run admin:add -- email@contoh.id`.
5. Opsional: aktifkan login Google dengan redirect `https://<project>.supabase.co/auth/v1/callback`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run check` | Typecheck, lint, unit test, dan build |
| `npx playwright test` | E2E di mode demo pada layar 390px dan 1280px, termasuk audit aksesibilitas |
| `npm run db:setup-sql` | Membangun `supabase/setup.sql` dari `schema.sql` dan katalog |
| `npm run db:apply` / `npm run db:verify` | Menerapkan skema ke Supabase / mengecek RLS dari sisi publik |
| `npm run admin:add -- email` | Menjadikan akun sebagai admin |
| `npm run check:urls` | Mengecek ulang semua URL katalog |

## Struktur

```
src/app/            halaman (App Router) dan API routes
src/app/admin/      dashboard admin (lowongan, pendaftar, squad, tulisan, katalog)
src/app/mitra/      ruang mitra
src/components/     komponen UI (maskot, jalur roadmap, input suara, tangga proyek, squad)
src/lib/ai/         prompt, normalisasi, provider, service
src/lib/store.ts    lapisan data client (Supabase atau localStorage demo)
supabase/           schema.sql (sumber) → setup.sql (hasil generate)
tests/unit, tests/e2e
```

Stack: Next.js 16, React 19, Tailwind CSS 4, Supabase, Gemini, zod, Vitest, Playwright, Vercel.
