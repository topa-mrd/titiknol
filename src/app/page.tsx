import Link from "next/link";
import type { CSSProperties } from "react";
import { AccountButton } from "@/components/AccountButton";
import { AppHeader } from "@/components/AppHeader";
import { InView } from "@/components/InView";
import { Mascot } from "@/components/Mascot";
import { ResumeDraftLink } from "@/components/ResumeDraftLink";
import { ThreadNode, ThreadSegment, seq } from "@/components/Thread";
import { ArrowRightIcon, ChatIcon, MicIcon, PathIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { SITE, STAGES } from "@/lib/site";

const STAGE_HINTS: Record<(typeof STAGES)[number], string> = {
  "Tell me your dream": "Kami dengarkan semua mimpimu. Makin banyak kamu bercerita, makin tepat kami membantumu.",
  Drafting: "Tiga pilihan rencana yang bisa kamu revisi bareng AI.",
  Roadmap: "Langkah mingguan dengan sumber belajar dari katalog yang sudah dicek.",
  Experience: "Proyek mikro untuk mengasah pengalaman nyata.",
  "Share your story": "Ceritakan lewat suara, terbitkan di Blog, atau jadi mentor di Komunitas.",
};

const HOW_IT_WORKS = [
  {
    icon: MicIcon,
    tone: "bg-link text-white shadow-[0_5px_0_var(--color-link-lip)]",
    title: "Cukup bercerita",
    body: "Jawab dua pertanyaan dengan suara atau ketikan. Kota, biaya, waktu, dan keluarga ikut diperhitungkan.",
  },
  {
    icon: ChatIcon,
    tone: "bg-brand text-on-brand shadow-[0_5px_0_var(--color-brand-lip)]",
    title: "Tiga jalur, kamu yang pilih",
    body: "Plan A, B, dan C dengan untung-rugi yang jujur. Minta revisi lewat chat sampai rasanya pas.",
  },
  {
    icon: PathIcon,
    tone: "bg-leaf text-on-leaf shadow-[0_5px_0_var(--color-leaf-lip)]",
    title: "Roadmap yang bisa dicentang",
    body: "Link sertifikasi dan beasiswa diambil dari katalog yang sudah dicek, jadi AI tidak membuat link sendiri. Biaya sumber yang berbayar dihitung di kalkulator.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>

      <main id="main" className="flex-1">
        <section
          aria-labelledby="hero-title"
          className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pt-4 pb-14 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12 lg:pt-10 lg:pb-24"
        >
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <h1
              id="hero-title"
              className="font-display text-[2.6rem] leading-[1.05] font-black tracking-display text-balance sm:text-6xl"
            >
              <span className="block motion-safe:animate-[rise_700ms_var(--ease-out-expo)_100ms_both]">Tell me your dream.</span>
              <span className="block text-brand-ink motion-safe:animate-[rise_700ms_var(--ease-out-expo)_260ms_both]">
                We will help you.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed font-medium text-pretty text-ink-muted motion-safe:animate-[rise_700ms_var(--ease-out-expo)_420ms_both] lg:mx-0">
              {SITE.description}
            </p>

            <div className="mt-8 flex flex-col items-center gap-5 motion-safe:animate-[rise_700ms_var(--ease-out-expo)_560ms_both] lg:items-start">
              <Link href="/start" className={`${buttonClass("primary", "xl")} w-full max-w-sm sm:w-auto`}>
                <MicIcon className="size-5" />
                Ceritakan mimpimu
              </Link>
              <ResumeDraftLink />
              <Link
                href="/mitra"
                className="text-sm font-emphasis text-ink-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                Mencari talenta? Buka lowongan sebagai mitra
              </Link>
            </div>
          </div>

          <div className="relative order-1 mx-auto grid w-full max-w-[17rem] place-items-center pt-14 sm:max-w-xs lg:order-2 lg:max-w-md">
            <span aria-hidden="true" className="absolute inset-x-[6%] top-[22%] bottom-[2%] rounded-full bg-sun-soft" />
            <span aria-hidden="true" className="absolute top-[26%] right-[4%] size-5 rounded-full bg-sky/80" />
            <span aria-hidden="true" className="absolute bottom-[16%] left-[2%] size-3.5 rounded-full bg-leaf/80" />
            <span aria-hidden="true" className="absolute top-[40%] left-[8%] size-2.5 rounded-full bg-brand" />
            <div className="relative w-[78%] motion-safe:animate-[pop_700ms_var(--ease-out-expo)_both]">
              <p className="absolute -top-3 left-1/2 z-10 w-max max-w-[15rem] -translate-x-1/2 -translate-y-full rounded-2xl border-2 border-b-4 border-line bg-surface px-4 py-2 text-center text-sm font-heading text-ink motion-safe:animate-[rise_500ms_var(--ease-out-expo)_900ms_both] sm:text-base">
                Hai! Aku Titik. Yuk, mulai dari mimpimu.
                <span
                  aria-hidden="true"
                  className="absolute top-full left-1/2 size-3.5 -translate-x-1/2 -translate-y-1.5 rotate-45 border-r-2 border-b-2 border-line bg-surface"
                />
              </p>
              <Mascot pose="wave" className="w-full" />
            </div>
          </div>
        </section>

        <div className="bg-surface-muted">
          <section aria-labelledby="stages-title" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 lg:py-20">
            <div className="max-w-2xl">
              <h2 id="stages-title" className="font-display text-[1.75rem] leading-tight font-black tracking-display sm:text-4xl">
                Perjalananmu
              </h2>
              <p className="mt-3 text-lg leading-relaxed font-medium text-ink-muted">
                Kamu mulai dari cerita. Setiap tahap berikutnya disusun dari jawabanmu, sampai kamu punya langkah yang bisa dicentang tiap minggu.
              </p>
            </div>

            <InView>
              <ol className="mt-12 grid gap-0 lg:grid-cols-5 lg:gap-6">
                {STAGES.map((stage, index) => {
                  const first = index === 0;
                  const last = index === STAGES.length - 1;
                  return (
                    <li key={stage} className="relative pb-8 pl-11 last:pb-0 lg:pt-10 lg:pb-0 lg:pl-0">
                      {!last && (
                        <>
                          <ThreadSegment
                            done={false}
                            axis="y"
                            style={{ "--d": `${index * 200 + 120}ms` } as CSSProperties}
                            className="reveal-seg-y absolute top-8 bottom-1 left-[10px] bg-line-strong/40! lg:hidden"
                          />
                          <ThreadSegment
                            done={false}
                            style={{ "--d": `${index * 200 + 120}ms` } as CSSProperties}
                            className="reveal-seg absolute top-[10px] right-[-1.25rem] left-9 hidden bg-line-strong/40! lg:block"
                          />
                        </>
                      )}
                      <ThreadNode
                        state={first ? "current" : "pending"}
                        style={{ "--d": `${index * 200}ms` } as CSSProperties}
                        className="reveal-node absolute top-0 left-0"
                      />
                      <p className="text-sm leading-6 font-heading text-ink-muted tabular-nums">{seq(index + 1)}</p>
                      <p lang="en" className="mt-1 font-display text-xl leading-snug font-black tracking-display">
                        {stage}
                      </p>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed font-medium text-ink-muted">{STAGE_HINTS[stage]}</p>
                    </li>
                  );
                })}
              </ol>
            </InView>
          </section>
        </div>

        <section
          aria-labelledby="how-title"
          className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-16 lg:py-24"
        >
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <h2 id="how-title" className="font-display text-[1.75rem] leading-tight font-black tracking-display sm:text-4xl">
              Cara kerjanya
            </h2>
            <div className="mt-6 flex items-end gap-3">
              <Mascot pose="talk" idle={false} className="h-24 w-auto shrink-0" />
              <p className="relative mb-6 max-w-xs rounded-2xl border-2 border-b-4 border-line bg-surface px-4 py-3 text-left font-heading">
                Jujur soal untung-rugi dan biaya. Aku bantu menyusun, kamu yang memutuskan.
                <span
                  aria-hidden="true"
                  className="absolute bottom-4 -left-[9px] size-4 rotate-45 border-b-2 border-l-2 border-line bg-surface"
                />
              </p>
            </div>
          </div>

          <ol className="relative">
            {HOW_IT_WORKS.map(({ icon: Icon, tone, title, body }, i) => (
              <li key={title} className="relative pb-10 pl-20 last:pb-0">
                {i < HOW_IT_WORKS.length - 1 && (
                  <span aria-hidden="true" className="absolute top-16 -bottom-1 left-[29px] w-1.5 rounded-full bg-line" />
                )}
                <span
                  aria-hidden="true"
                  className={`absolute top-0 left-0 grid size-16 place-items-center rounded-full ${tone}`}
                >
                  <Icon className="size-7" strokeWidth={2.5} />
                </span>
                <h3 className="pt-1 font-display text-xl font-black">{title}</h3>
                <p className="mt-2 max-w-md leading-relaxed font-medium text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="mitra-title" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8 lg:pb-20">
          <div className="grid gap-8 rounded-card border-2 border-b-4 border-sky/40 bg-sky-soft p-6 sm:p-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
            <div>
              <h2 id="mitra-title" className="font-display text-[1.75rem] leading-tight font-black tracking-display text-balance sm:text-4xl">
                Mencari talenta muda?
              </h2>
              <p className="mt-3 max-w-xl text-lg leading-relaxed font-medium text-ink-muted">
                Untuk UMKM, perusahaan, komunitas, sekolah, dan instansi yang membuka magang, proyek, atau kerja. Tim
                TitikNol mengecek lowonganmu, menyeleksi pendaftar, lalu meneruskan talenta yang cocok.
              </p>
              <Link href="/mitra" className={`${buttonClass("primary", "lg")} mt-6`}>
                Buka lowongan
                <ArrowRightIcon className="size-5" />
              </Link>
            </div>
            <ol className="grid gap-3 text-sm">
              {[
                ["1", "Daftarkan usahamu dan tulis posisi yang dibutuhkan, lengkap dengan daerahnya."],
                ["2", "Tim TitikNol mengecek lowongan, lalu menayangkannya ke talenta."],
                ["3", "Pendaftar diseleksi tim kami. Talenta yang cocok masuk ke ruang mitramu."],
                ["4", "Kelola talentamu: terima, tandai sedang bekerja, sampai selesai."],
              ].map(([n, text]) => (
                <li key={n} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-link font-heading text-white">{n}</span>
                  <span className="pt-1 leading-relaxed font-medium">{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="close-title" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8 lg:pb-24">
          <div className="flex flex-col items-center gap-6 rounded-card border-2 border-b-4 border-sun-lip/40 bg-sun-soft p-8 text-center sm:p-10 lg:flex-row lg:text-left">
            <Mascot pose="cheer" idle={false} className="h-28 w-auto shrink-0" />
            <div className="flex-1">
              <h2 id="close-title" className="font-display text-[1.75rem] leading-tight font-black tracking-display text-balance">
                Mulai dari titik nol.
              </h2>
              <p className="mt-2 text-lg font-medium text-on-sun">
                Ceritakan mimpimu, kami siap bantu menyusun langkah pertamanya.
              </p>
            </div>
            <Link href="/start" className={`${buttonClass("secondary", "lg")} shrink-0`}>
              Mulai bercerita
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        <div className="flex flex-col gap-3 border-t-2 border-line py-6 text-sm font-medium text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="font-heading text-ink">{SITE.name}</span>
          <nav aria-label="Informasi">
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              <li>
                <Link href="/syarat" className="inline-flex min-h-9 items-center hover:text-ink hover:underline">
                  Syarat Layanan
                </Link>
              </li>
              <li>
                <Link href="/privasi" className="inline-flex min-h-9 items-center hover:text-ink hover:underline">
                  Kebijakan Privasi
                </Link>
              </li>
              <li>
                <a href={`mailto:${SITE.contactEmail}`} className="inline-flex min-h-9 items-center hover:text-ink hover:underline">
                  Kontak
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
