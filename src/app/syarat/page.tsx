import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Syarat Layanan",
  description: "Aturan pemakaian TitikNol: apa yang kami sediakan, batasan AI, konten pengguna, dan Experience.",
};

const link = "font-emphasis text-link underline decoration-link/40 underline-offset-4";

const SECTIONS: LegalSection[] = [
  {
    id: "layanan",
    title: "Apa itu TitikNol",
    body: (
      <>
        <p>
          TitikNol adalah layanan gratis yang membantu anak muda Indonesia menyusun rencana belajar dan karier. Kamu
          bercerita tentang mimpi dan kondisimu, lalu TitikNol menyusun tiga pilihan rencana, roadmap mingguan, daftar
          sumber belajar, kesempatan pengalaman (Experience), serta ruang berbagi cerita (Blog dan Komunitas).
        </p>
        <p>
          TitikNol dikembangkan oleh tim TitikNol sebagai proyek untuk JOINTS UGM dan masih terus diperbaiki. Fitur bisa
          berubah, bertambah, atau dihentikan sewaktu-waktu.
        </p>
      </>
    ),
  },
  {
    id: "akun",
    title: "Akun",
    body: (
      <>
        <p>
          Kamu bisa memakai sebagian besar fitur tanpa akun. Untuk menyimpan roadmap, mendaftar Experience, atau
          menulis, kamu perlu masuk dengan email dan password atau akun Google.
        </p>
        <ul>
          <li>Jaga kerahasiaan password-mu. Aktivitas dari akunmu dianggap dilakukan olehmu.</li>
          <li>Isi data dengan jujur, termasuk nama yang ditampilkan dan kontak.</li>
          <li>
            Kalau kamu belum berusia 18 tahun, pakai TitikNol dengan sepengetahuan orang tua atau wali, terutama sebelum
            mendaftar ke lowongan atau membagikan kontak.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ai",
    title: "Saran dari AI",
    body: (
      <>
        <p>
          Profil, rencana, roadmap, dan rapian tulisan disusun oleh AI berdasarkan ceritamu. AI bisa keliru atau tidak
          lengkap.
        </p>
        <ul>
          <li>
            <strong>Saran TitikNol bukan nasihat profesional</strong> (karier, pendidikan, keuangan, atau hukum) dan
            tidak menjamin hasil apa pun, termasuk diterima beasiswa, lulus sertifikasi, atau mendapat pekerjaan.
          </li>
          <li>Keputusan tetap milikmu. Periksa lagi informasi penting sebelum bertindak, terutama yang menyangkut uang.</li>
          <li>
            Link sumber diambil dari katalog kami, bukan ditulis AI. Sumber yang ditemukan lewat pencarian web diberi
            label &ldquo;dari web, belum dicek&rdquo; sampai diperiksa tim. Harga bisa berubah; perkiraan harga dari AI
            selalu diberi label dan sumber.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "konten",
    title: "Tulisan dan konten yang kamu bagikan",
    body: (
      <>
        <p>
          Tulisan, profil mentor, profil komunitas, dan isian lain tetap milikmu. Dengan menerbitkannya, kamu mengizinkan
          TitikNol menampilkan dan membagikan konten itu di dalam layanan (misalnya di Blog dan Komunitas) selama konten
          itu masih terbit.
        </p>
        <p>Kamu bertanggung jawab atas konten yang kamu bagikan. Jangan membagikan:</p>
        <ul>
          <li>data pribadi orang lain tanpa izin, atau data pribadimu yang tidak ingin dilihat publik;</li>
          <li>penipuan, ajakan membayar untuk lowongan atau bimbingan, atau promosi menyesatkan;</li>
          <li>ujaran kebencian, pelecehan, kekerasan, pornografi, atau konten yang melanggar hukum Indonesia;</li>
          <li>karya orang lain yang kamu akui sebagai milikmu.</li>
        </ul>
        <p>
          Kontak yang kamu cantumkan di profil mentor atau komunitas tampil untuk semua orang. Tim TitikNol dapat
          menurunkan konten yang melanggar aturan ini tanpa pemberitahuan sebelumnya. Kamu bisa menghapus tulisanmu
          kapan saja dari halaman Share your story.
        </p>
      </>
    ),
  },
  {
    id: "experience",
    title: "Experience: lowongan dan lamaran",
    body: (
      <>
        <p>
          Mitra (perusahaan, UMKM, lembaga, atau komunitas) bisa membuka lowongan. Tim TitikNol memeriksa lowongan
          sebelum tayang dan meneruskan pendaftar yang cocok ke mitra.
        </p>
        <ul>
          <li>
            TitikNol <strong>bukan pemberi kerja</strong> dan bukan pihak dalam kesepakatan antara kamu dan mitra.
            Pemeriksaan kami tidak menjamin lowongan, mitra, atau hasilnya.
          </li>
          <li>
            Data lamaranmu (kontak, alasan, link portofolio dan CV, ringkasan roadmap bila kamu lampirkan) baru terlihat
            oleh mitra setelah admin meneruskannya.
          </li>
          <li>
            <strong>Jangan pernah membayar</strong> untuk melamar, pelatihan, atau &ldquo;biaya administrasi&rdquo;.
            Laporkan permintaan seperti itu ke <ContactLink />.
          </li>
          <li>Mitra wajib memberi informasi lowongan yang benar dan memperlakukan pendaftar dengan layak.</li>
        </ul>
      </>
    ),
  },
  {
    id: "larangan",
    title: "Pemakaian yang tidak diperbolehkan",
    body: (
      <ul>
        <li>Mengakses akun atau data orang lain tanpa izin, atau mencoba membobol keamanan layanan.</li>
        <li>Mengirim permintaan otomatis dalam jumlah besar yang membebani layanan atau AI.</li>
        <li>Memakai TitikNol untuk menipu, memeras, atau merugikan orang lain.</li>
      </ul>
    ),
  },
  {
    id: "batasan",
    title: "Batasan tanggung jawab",
    body: (
      <>
        <p>
          TitikNol disediakan apa adanya dan gratis. Kami berusaha menjaga layanan tetap berjalan dan informasinya akurat,
          tetapi tidak menjamin layanan selalu tersedia, bebas galat, atau cocok untuk keperluanmu.
        </p>
        <p>
          Sejauh diizinkan hukum, TitikNol tidak bertanggung jawab atas kerugian yang timbul dari keputusan berdasarkan
          saran AI, isi situs pihak lain yang ditautkan, atau hubunganmu dengan mitra, mentor, maupun komunitas.
        </p>
      </>
    ),
  },
  {
    id: "perubahan",
    title: "Perubahan dan penghentian",
    body: (
      <>
        <p>
          Syarat ini bisa diperbarui. Tanggal di bagian atas menunjukkan versi terbaru; perubahan penting akan kami
          umumkan di aplikasi. Dengan tetap memakai TitikNol setelah perubahan, kamu menyetujui versi terbaru.
        </p>
        <p>
          Kamu boleh berhenti memakai TitikNol kapan saja. Kami dapat menangguhkan akun yang melanggar syarat ini. Cara
          menghapus data dijelaskan di{" "}
          <Link href="/privasi" className={link}>
            Kebijakan Privasi
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "hukum",
    title: "Hukum yang berlaku dan kontak",
    body: (
      <p>
        Syarat ini tunduk pada hukum Republik Indonesia. Pertanyaan, laporan konten, atau keluhan bisa dikirim ke{" "}
        <ContactLink />. Kami akan berusaha membalas dalam 7 hari kerja.
      </p>
    ),
  },
];

export default function SyaratPage() {
  return (
    <LegalPage
      title="Syarat Layanan"
      updated="2026-10-16"
      intro={
        <p>
          Dengan memakai TitikNol, kamu menyetujui syarat di bawah ini. Kami menulisnya sesingkat dan sejelas mungkin.
          Kalau ada yang membingungkan, tanyakan saja ke <ContactLink />.
        </p>
      }
      sections={SECTIONS}
      other={{ href: "/privasi", label: "Kebijakan Privasi" }}
    />
  );
}
