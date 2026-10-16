"use client";

import { useEffect, useRef } from "react";
import { formatRange } from "@/lib/costs";
import { todoKey, type Progress, type ResolvedStep, type ResourceLink } from "@/lib/types";
import { RESOURCE_TYPE_LABEL } from "@/lib/labels";
import { CheckIcon, CloseIcon, ExternalIcon } from "./icons";
import { buttonClass } from "./ui";
import { Sep } from "./Sep";


const COST_TONE: Record<ResourceLink["cost"], string> = {
  Gratis: "bg-leaf-soft",
  Berbayar: "bg-danger-soft",
  Bervariasi: "bg-sun-soft",
};

type StepSheetProps = {
  step: ResolvedStep | null;
  index: number;
  progress: Progress;
  onToggleTodo: (stepId: string, todoIndex: number) => void;
  onSetDone: (step: ResolvedStep, done: boolean) => void;
  onClose: () => void;
};

/** Detail langkah dalam <dialog> modal: bottom sheet di HP, kotak di tengah di desktop. */
export function StepSheet({ step, index, progress, onToggleTodo, onSetDone, onClose }: StepSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = step !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const done = step ? progress.doneSteps.includes(step.id) : false;
  const titleId = "step-sheet-title";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // Klik di backdrop (di luar kotak) menutup dialog.
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-full overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-surface p-0 text-ink backdrop:bg-ink/45 sm:m-auto sm:max-w-lg sm:rounded-[1.75rem]"
    >
      {step && (
        <div className="px-5 pt-3 pb-6 sm:px-7 sm:pt-6">
          <span aria-hidden="true" className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-line sm:hidden" />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-2xl leading-tight font-display font-heading tracking-display text-balance">
                {step.title}
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Langkah {index + 1}
                <Sep />
                sekitar {step.weeks} minggu
              </p>
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Tutup detail langkah"
              className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>

          <p className="mt-3 leading-relaxed">{step.description}</p>
          <div className="mt-4 rounded-card bg-surface-muted px-4 py-3">
            <p className="text-sm font-emphasis">Kenapa langkah ini penting</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{step.why}</p>
          </div>

          <fieldset className="mt-6">
            <legend className="font-display font-heading">To-do minggu ini</legend>
            <ul className="mt-2 space-y-1">
              {step.todos.map((todo, i) => {
                const checked = progress.doneTodos.includes(todoKey(step.id, i));
                return (
                  <li key={todo}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted">
                      <span className="relative mt-0.5 grid size-6 shrink-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleTodo(step.id, i)}
                          className="peer size-6 cursor-pointer appearance-none rounded-lg border-2 border-line-strong bg-surface checked:border-leaf-lip checked:bg-leaf"
                        />
                        <CheckIcon
                          strokeWidth={3}
                          className="pointer-events-none absolute inset-1 size-4 text-on-leaf opacity-0 peer-checked:opacity-100 peer-checked:motion-safe:animate-[pop_300ms_var(--ease-out-expo)]"
                        />
                      </span>
                      <span className={`leading-relaxed ${checked ? "text-ink-muted line-through" : ""}`}>{todo}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {step.resources.length > 0 && (
            <section className="mt-6" aria-labelledby="step-resources">
              <h3 id="step-resources" className="font-display font-heading">
                Sumber dari katalog
              </h3>
              <ul className="mt-2 space-y-2">
                {step.resources.map((r) => (
                  <li key={r.id}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center justify-between gap-3 rounded-2xl border-2 border-b-4 border-line px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span className="min-w-0">
                        <span className="block font-emphasis underline decoration-transparent underline-offset-4 group-hover:decoration-link/60">{r.title}</span>
                        <span className="mt-0.5 block truncate text-sm text-ink-muted">{r.provider}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium">
                          <span className="rounded-full bg-surface-muted px-2 py-0.5">{RESOURCE_TYPE_LABEL[r.type]}</span>
                          {r.origin === "web" && r.review !== "disetujui" && (
                            <span className="rounded-full bg-sky-soft px-2 py-0.5 text-link">Dari web, belum dicek</span>
                          )}
                          <span className={`rounded-full px-2 py-0.5 ${COST_TONE[r.cost]}`}>
                            {r.price && r.price.max > 0
                              ? `${formatRange(r.price)}${r.price.unit === "sekali" ? "" : ` ${r.price.unit}`}`
                              : r.cost}
                          </span>
                        </span>
                        {r.reason && <span className="mt-2 block text-sm leading-relaxed text-ink">{r.reason}</span>}
                      </span>
                      <ExternalIcon aria-hidden="true" className="size-5 shrink-0 text-ink-muted group-hover:text-ink" />
                      <span className="sr-only">(buka di tab baru)</span>
                    </a>
                  </li>
                ))}
              </ul>
              {step.resources.some((r) => r.origin === "web" && r.review !== "disetujui") && (
                <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                  Sumber bertanda “dari web” ditemukan lewat pencarian Google dan masih menunggu dicek tim TitikNol. Pastikan
                  kamu membuka situs resminya sebelum mendaftar atau membayar.
                </p>
              )}
            </section>
          )}

          {step.skills.length > 0 && (
            <div className="mt-6">
              <h3 className="font-display font-heading">Skill yang terbangun</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5 text-sm font-medium">
                {step.skills.map((s) => (
                  <li key={s} className="rounded-full bg-leaf-soft px-2.5 py-1">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 mt-6 border-t border-line bg-surface px-5 pt-4 sm:-mx-7 sm:px-7">
            {done ? (
              <button type="button" onClick={() => onSetDone(step, false)} className={`${buttonClass("secondary", "lg")} w-full`}>
                Tandai belum selesai
              </button>
            ) : (
              <button type="button" onClick={() => onSetDone(step, true)} className={`${buttonClass("primary", "lg")} w-full`}>
                <CheckIcon className="size-5" strokeWidth={3} />
                Tandai selesai
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
