import type { ReactNode } from "react";
import { Mascot } from "./Mascot";

/** Layar masalah bersama (404, error): Titik berpikir, judul, penjelasan, lalu aksi. */
export function ProblemScreen({ code, title, children, actions }: { code?: string; title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <section aria-labelledby="problem-title" className="mx-auto flex w-full max-w-xl flex-col items-center py-6 text-center sm:py-12">
      <Mascot pose="think" className="h-28 w-auto sm:h-36" />
      {code && <p className="mt-6 font-display text-sm font-heading tracking-wide text-brand-ink uppercase">{code}</p>}
      <h1 id="problem-title" className="mt-2 font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance">
        {title}
      </h1>
      <div className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">{children}</div>
      <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">{actions}</div>
    </section>
  );
}
