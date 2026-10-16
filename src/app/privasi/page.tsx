import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Kebijakan Privasi",
  description: "Data apa yang dikumpulkan TitikNol, untuk apa, siapa yang bisa melihatnya, dan cara menghapusnya.",
};

const link = "font-emphasis text-link underline decoration-link/40 underline-offset-4";

const SECTIONS: LegalSection[] = [
  {
    id: "data",
    title: "Data yang kami kumpulkan",
    body: (
      <ul>
        <li>
          <strong>Akun:</strong> email dan nama. Bila masuk dengan Google, kami menerima nama, email, dan foto profil
          dari Google.
        </li>
        <li>
          <strong>Ceritamu:</strong> mimpi, kondisi, dan kendala yang kamu tulis atau ucapkan, beserta profil, rencana,
          dan roadmap yang disusun darinya.
        </li>
        <li>
          <strong>Kemajuan:</strong> to-do dan langkah yang kamu centang, serta isian kalkulator biaya.
        </li>
        <li>
          <strong>Experience:</strong> data lamaran (kontak WhatsApp atau email, alasan, link portofolio dan CV, ringkasan
          roadmap bila kamu lampirkan). Untuk mitra: nama organisasi, jenis, provinsi dan kota, nama dan kontak
          penanggung jawab, serta isi lowongan.
        </li>
        <li>
          <strong>Tulisan:</strong> artikel, profil mentor, dan profil komunitas, termasuk nama yang ditampilkan dan
          kontak publik bila kamu isi.
        </li>
        <li>
          <strong>Data teknis:</strong> alamat IP dipakai sesaat di memori server untuk membatasi permintaan berlebihan
          dan tidak kami simpan. Penyedia hosting kami mencatat log permintaan standar untuk keamanan dan perbaikan galat.
        </li>
      </ul>
    ),
  },
  {
    id: "suara",
    title: "Input suara",
    body: (
      <ul>
        <li>
          Di Chrome, Edge, dan Safari, suara diubah jadi teks oleh layanan suara bawaan browser, sesuai kebijakan
          penyedia browser itu. Suaranya tidak dikirim ke server TitikNol.
        </li>
        <li>
          Di browser lain (misalnya Brave dan Firefox), suara direkam lalu dikirim ke server kami dan penyedia AI untuk
          dituliskan. Rekaman itu tidak kami simpan; yang tersisa hanya teks yang masuk ke kolom isianmu.
        </li>
      </ul>
    ),
  },
  {
    id: "penggunaan",
    title: "Untuk apa data dipakai",
    body: (
      <>
        <ul>
          <li>Menyusun rencana, roadmap, dan rapian tulisan sesuai ceritamu.</li>
          <li>Menyimpan roadmap dan kemajuanmu supaya bisa dibuka lagi dari perangkat lain.</li>
          <li>Menghubungkan pendaftar dengan mitra Experience dan memeriksa lowongan.</li>
          <li>Menampilkan tulisan yang kamu terbitkan di Blog dan Komunitas, dan menjaga keamanannya dari penyalahgunaan.</li>
        </ul>
        <p>
          Kami <strong>tidak menjual data</strong>, tidak menampilkan iklan, dan tidak memakai alat analitik atau
          pelacak pihak ketiga.
        </p>
      </>
    ),
  },
  {
    id: "google",
    title: "Data dari akun Google",
    body: (
      <>
        <p>
          Bila kamu masuk dengan Google, TitikNol hanya meminta akses dasar: nama, alamat email, dan foto profil. Data ini
          dipakai semata-mata untuk membuat akun, membuatmu tetap masuk, dan menampilkan namamu di aplikasi. Kami tidak
          mengakses Gmail, Drive, kontak, atau data Google lainnya.
        </p>
        <p>
          Penggunaan dan pemindahan informasi yang diterima TitikNol dari Google API mematuhi{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className={link}
          >
            Google API Services User Data Policy
            <span className="sr-only"> (buka di tab baru)</span>
          </a>
          , termasuk persyaratan Limited Use.
        </p>
      </>
    ),
  },
  {
    id: "pihak-lain",
    title: "Pihak lain yang memproses data",
    body: (
      <>
        <p>Kami memakai beberapa penyedia layanan untuk menjalankan TitikNol:</p>
        <ul>
          <li>
            <strong>Supabase</strong>: database dan login. Data disimpan di server wilayah Seoul, Korea Selatan.
          </li>
          <li>
            <strong>Vercel</strong>: hosting situs dan server.
          </li>
          <li>
            <strong>Google (Gemini) dan OpenRouter</strong>: AI yang menyusun rencana, roadmap, rapian tulisan, dan
            transkripsi suara, serta pencarian sumber belajar di web. Teks ceritamu dikirim ke penyedia ini untuk
            diproses. Penyedia AI memproses data sesuai kebijakan masing-masing, dan layanan gratis tertentu dapat
            memakai data untuk meningkatkan layanannya. Karena itu,{" "}
            <strong>jangan menulis data sensitif</strong> seperti NIK, nomor rekening, atau alamat rumah di ceritamu.
          </li>
          <li>
            <strong>Google</strong>: login dengan Google.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "siapa",
    title: "Siapa yang bisa melihat datamu",
    body: (
      <ul>
        <li>
          <strong>Hanya kamu:</strong> ceritamu, rencana, roadmap, kemajuan, dan draf tulisan.
        </li>
        <li>
          <strong>Admin TitikNol:</strong> lamaran, lowongan, data mitra, dan tulisan, untuk memeriksa dan menghubungkan.
          Admin tidak bisa mengubah isi tulisanmu.
        </li>
        <li>
          <strong>Mitra:</strong> data lamaranmu, hanya setelah admin meneruskannya ke mitra itu.
        </li>
        <li>
          <strong>Semua orang:</strong> tulisan yang kamu terbitkan, termasuk nama yang ditampilkan dan kontak publik di
          profil mentor atau komunitas, serta lowongan yang sudah disetujui.
        </li>
      </ul>
    ),
  },
  {
    id: "perangkat",
    title: "Data di perangkatmu dan cookie",
    body: (
      <p>
        Sebelum login, jawabanmu dan draf rencana disimpan di penyimpanan browser (localStorage) perangkatmu. Pilihan
        efek suara juga disimpan di sana. Cookie hanya dipakai untuk menjaga sesi login. Kamu bisa menghapus semuanya
        lewat pengaturan browser.
      </p>
    ),
  },
  {
    id: "simpan-hapus",
    title: "Berapa lama disimpan dan cara menghapus",
    body: (
      <>
        <p>Data disimpan selama akunmu aktif. Kamu bisa menghapus sendiri:</p>
        <ul>
          <li>
            roadmap dari halaman{" "}
            <Link href="/roadmap" className={link}>
              Roadmap
            </Link>
            ;
          </li>
          <li>
            tulisan dari halaman{" "}
            <Link href="/share" className={link}>
              Share your story
            </Link>
            ;
          </li>
          <li>lamaran dengan membatalkannya selama belum diteruskan ke mitra.</li>
        </ul>
        <p>
          Untuk menghapus akun beserta seluruh datanya, kirim email dari alamat akunmu ke <ContactLink />. Kami
          memprosesnya paling lambat 30 hari.
        </p>
      </>
    ),
  },
  {
    id: "hak",
    title: "Hakmu",
    body: (
      <p>
        Sesuai Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi, kamu berhak mengetahui data apa yang
        kami simpan, meminta salinannya, memperbaikinya, menghapusnya, dan menarik persetujuan. Ajukan lewat{" "}
        <ContactLink />.
      </p>
    ),
  },
  {
    id: "keamanan",
    title: "Keamanan",
    body: (
      <p>
        Koneksi ke TitikNol memakai HTTPS. Akses database dibatasi per akun dengan aturan keamanan di tingkat database,
        dan kunci layanan AI hanya ada di server. Tidak ada sistem yang sepenuhnya kebal; bila terjadi kebocoran yang
        menyangkut datamu, kami akan memberi tahu kamu.
      </p>
    ),
  },
  {
    id: "anak",
    title: "Pengguna di bawah 18 tahun",
    body: (
      <p>
        TitikNol terbuka untuk pelajar. Bila kamu belum berusia 18 tahun, pakai TitikNol dengan sepengetahuan orang tua
        atau wali, terutama sebelum mendaftar lowongan atau membagikan kontak.
      </p>
    ),
  },
  {
    id: "perubahan",
    title: "Perubahan kebijakan",
    body: (
      <p>
        Kebijakan ini bisa diperbarui. Tanggal di bagian atas menunjukkan versi terbaru, dan perubahan penting akan kami
        umumkan di aplikasi.
      </p>
    ),
  },
];

export default function PrivasiPage() {
  return (
    <LegalPage
      title="Kebijakan Privasi"
      updated="2026-10-16"
      intro={
        <p>
          Kebijakan ini menjelaskan data apa yang dikumpulkan TitikNol, untuk apa, siapa yang bisa melihatnya, dan cara
          menghapusnya.
        </p>
      }
      sections={SECTIONS}
      other={{ href: "/syarat", label: "Syarat Layanan" }}
    />
  );
}
