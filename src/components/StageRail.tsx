import { STAGES } from "@/lib/site";
import { ThreadNode, ThreadSegment, seq, type ThreadState } from "./Thread";

/**
 * Benang lima tahap TitikNol di atas halaman tahap (Drafting, Roadmap, …),
 * sambungan dari benang di /start. Visual saja; pembaca layar mendapat satu
 * kalimat posisi, karena navigasi utama sudah ada di header.
 */
export function StageRail({ current, completed = current }: { current: number; completed?: number }) {
  // `completed`: jumlah tahap awal yang benar-benar sudah dilalui. Halaman yang bisa dibuka
  // langsung (Experience, Share) tidak mengklaim tahap sebelumnya selesai.
  const stateOf = (i: number): ThreadState => (i === current ? "current" : i < completed ? "done" : "pending");
  return (
    <div className="mb-8 sm:mb-10">
      <p className="sr-only">
        Tahap {current + 1} dari {STAGES.length}: <span lang="en">{STAGES[current]}</span>
      </p>
      <div aria-hidden="true" className="grid grid-cols-5 gap-0">
        {STAGES.map((stage, i) => (
          <div key={stage} className="min-w-0">
            <div className="flex items-center">
              <ThreadNode state={stateOf(i)} size="sm" />
              {i < STAGES.length - 1 && <ThreadSegment done={i + 1 < completed || (i < completed && i + 1 === current)} className="mx-2 flex-1" />}
            </div>
            <p
              lang="en"
              className={`mt-2 hidden pr-3 text-xs leading-snug sm:block ${i === current ? "font-heading text-brand-ink" : "font-medium text-ink-muted"}`}
            >
              <span className="tabular-nums">{seq(i + 1)}</span> {stage}
            </p>
          </div>
        ))}
      </div>
      <p aria-hidden="true" lang="en" className="mt-2 text-xs font-heading text-brand-ink sm:hidden">
        <span className="text-ink-muted tabular-nums">{seq(current + 1)}</span> {STAGES[current]}
      </p>
    </div>
  );
}
