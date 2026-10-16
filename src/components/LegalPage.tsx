import Link from "next/link";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";
import { AccountButton } from "./AccountButton";
import { AppHeader } from "./AppHeader";

export type LegalSection = { id: string; title: string; body: ReactNode };

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

/** Halaman dokumen (Syarat Layanan, Kebijakan Privasi): satu kolom bacaan dengan daftar isi. */
export function LegalPage({
  title,
  intro,
  updated,
  sections,
  other,
}: {
  title: string;
  intro: ReactNode;
  updated: string;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader nav>
        <AccountButton />
      </AppHeader>
      <main id="main" className="flex-1 px-4 pt-4 pb-20 sm:px-8 sm:pt-8">
        <article className="mx-auto w-full max-w-[68ch]">
          <header>
            <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">
              {title}
            </h1>
            <p className="mt-3 text-sm text-ink-muted">
              Berlaku sejak <time dateTime={updated}>{dateFormat.format(new Date(updated))}</time>
            </p>
            <div className="mt-6 text-lg leading-relaxed text-pretty">{intro}</div>
          </header>

          <nav aria-labelledby="legal-toc" className="mt-8 rounded-card bg-surface-muted px-5 py-4">
            <h2 id="legal-toc" className="text-sm font-heading tracking-wide uppercase text-ink-muted">
              Isi
            </h2>
            <ol className="mt-2 grid gap-1 sm:grid-cols-2 sm:gap-x-6">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="inline-flex min-h-9 items-center gap-2 rounded text-sm font-emphasis text-link hover:underline">
                    <span className="w-5 text-ink-muted tabular-nums">{i + 1}.</span>
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {sections.map((s, i) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="mt-10 scroll-mt-6">
              <h2 id={`${s.id}-t`} className="font-display text-xl leading-snug font-heading tracking-display sm:text-2xl">
                {i + 1}. {s.title}
              </h2>
              <div className="legal-body mt-3 space-y-3 leading-relaxed text-pretty">{s.body}</div>
            </section>
          ))}

          <footer className="mt-12 border-t-2 border-line pt-6 text-sm leading-relaxed text-ink-muted">
            Pertanyaan atau permintaan soal dokumen ini:{" "}
            <a href={`mailto:${SITE.contactEmail}`} className="font-emphasis text-link underline decoration-link/40 underline-offset-4">
              {SITE.contactEmail}
            </a>
            . Baca juga{" "}
            <Link href={other.href} className="font-emphasis text-link underline decoration-link/40 underline-offset-4">
              {other.label}
            </Link>
            .
          </footer>
        </article>
      </main>
    </div>
  );
}

/** Tautan email kontak di dalam isi dokumen. */
export function ContactLink() {
  return (
    <a href={`mailto:${SITE.contactEmail}`} className="font-emphasis text-link underline decoration-link/40 underline-offset-4">
      {SITE.contactEmail}
    </a>
  );
}
