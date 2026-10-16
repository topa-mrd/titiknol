import { LEVEL_HINT, LEVEL_LABEL, canTake, levelRank, tierLevel, unlockHint } from "@/lib/opportunities";
import { OPPORTUNITY_LEVELS, type OpportunityLevel } from "@/lib/types";
import { CheckIcon, LockIcon } from "../icons";

const TONE: Record<OpportunityLevel, string> = {
  kecil: "bg-leaf-soft text-leaf-ink",
  sedang: "bg-sun-soft text-on-sun",
  tinggi: "bg-brand-soft text-brand-ink",
};

/** Label tingkat proyek di kartu lowongan. */
export function LevelBadge({ level }: { level: OpportunityLevel }) {
  return <span className={`rounded-full px-2.5 py-1 ${TONE[level]}`}>{LEVEL_LABEL[level]}</span>;
}

/**
 * Tangga proyek: kecil → sedang → tinggi. Talenta baru selalu diarahkan ke
 * proyek kecil; tingkat berikutnya terbuka setelah ada proyek yang selesai.
 */
export function ProjectLadder({ tier, signedIn }: { tier: number; signedIn: boolean }) {
  const current = tierLevel(tier);
  return (
    <section aria-labelledby="tangga-title" className="card mt-8 p-5 sm:p-6">
      <h2 id="tangga-title" className="font-display text-xl font-heading">
        Tangga proyek
      </h2>
      <p className="mt-1 max-w-prose leading-relaxed text-ink-muted">
        {current === "kecil"
          ? "Mulai dari proyek kecil: risikonya rendah dan tugasnya jelas. Selesaikan satu proyek kecil untuk membuka proyek sedang."
          : current === "sedang"
            ? "Kamu sudah menyelesaikan proyek kecil, jadi proyek sedang sekarang terbuka. Selesaikan satu proyek sedang untuk membuka proyek tinggi."
            : "Semua tingkat terbuka. Kamu sudah teruji di proyek sedang."}
        {!signedIn && " Masuk supaya kemajuanmu tercatat."}
      </p>
      <ol aria-label="Tingkat proyek" className="mt-4 grid gap-2 sm:grid-cols-3">
        {OPPORTUNITY_LEVELS.map((level) => {
          const open = canTake(level, tier);
          const here = level === current;
          const done = levelRank(level) < tier;
          return (
            <li
              key={level}
              aria-current={here ? "step" : undefined}
              className={`rounded-2xl border-2 p-3 ${here ? "border-brand bg-brand-soft" : open ? "border-line" : "border-dashed border-line bg-surface-muted"}`}
            >
              <p className="flex items-center gap-2 font-heading">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-xs ${
                    done ? "bg-leaf text-on-leaf" : here ? "bg-brand text-on-brand" : "border-2 border-line-strong text-ink-muted"
                  }`}
                >
                  {done ? <CheckIcon className="size-3.5" strokeWidth={3.5} /> : open ? levelRank(level) : <LockIcon className="size-3.5" strokeWidth={2.25} />}
                </span>
                {LEVEL_LABEL[level]}
                <span className="sr-only">{done ? "(sudah dilewati)" : here ? "(tingkatmu sekarang)" : open ? "(terbuka)" : "(terkunci)"}</span>
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{open ? LEVEL_HINT[level] : unlockHint(level)}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
