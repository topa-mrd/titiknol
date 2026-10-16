"use client";

import { stepStatus, todoCount, type StepStatus } from "@/lib/progress";
import type { Progress, ResolvedStep } from "@/lib/types";
import { CheckIcon, TrophyIcon } from "./icons";
import { Mascot } from "./Mascot";

/** Tata letak jalur (px vertikal, % horizontal). */
const ROW = 136;
const TOP = 84;
const BOTTOM = 96;
const X_PATTERN = [50, 74, 50, 26] as const;

const xOf = (i: number) => X_PATTERN[i % X_PATTERN.length];
const yOf = (i: number) => TOP + i * ROW;

/** Kurva halus antar node; koordinat x dalam %, y dalam px (viewBox tanpa menjaga rasio). */
function pathThrough(count: number): string {
  if (count === 0) return "";
  let d = `M ${xOf(0)} ${yOf(0)}`;
  for (let i = 1; i < count; i++) {
    const half = ROW / 2;
    d += ` C ${xOf(i - 1)} ${yOf(i - 1) + half}, ${xOf(i)} ${yOf(i) - half}, ${xOf(i)} ${yOf(i)}`;
  }
  return d;
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "selesai",
  current: "sedang kamu kerjakan",
  upcoming: "belum dimulai",
};

/** Node bulat 3D ala Duolingo: tertekan saat diketuk. */
const NODE_CLASS: Record<StepStatus, string> = {
  done: "bg-leaf text-on-leaf shadow-[0_6px_0_var(--color-leaf-lip)]",
  current: "bg-brand text-on-brand shadow-[0_6px_0_var(--color-brand-lip)]",
  upcoming: "border-2 border-line bg-surface-muted text-ink-muted shadow-[0_6px_0_var(--color-line)]",
};

type RoadPathProps = {
  steps: ResolvedStep[];
  progress: Progress;
  onOpen: (index: number) => void;
};

export function RoadPath({ steps, progress, onOpen }: RoadPathProps) {
  // Satu titik ekstra di ujung jalur untuk piala.
  const height = TOP + steps.length * ROW + BOTTOM - 40;
  const doneUntil = (() => {
    // Jalan berwarna hijau sampai langkah selesai terakhir yang berurutan dari awal.
    let i = 0;
    while (i < steps.length && progress.doneSteps.includes(steps[i].id)) i++;
    return i;
  })();
  const walked = Math.min(doneUntil + 1, steps.length);

  return (
    <div className="relative mx-auto w-full max-w-xl" style={{ height }}>
      <svg
        aria-hidden="true"
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <path
          d={pathThrough(steps.length + 1)}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={26}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {walked > 1 && (
          <path
            d={pathThrough(walked)}
            fill="none"
            stroke="#bfe6a1"
            strokeWidth={26}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={pathThrough(steps.length + 1)}
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeDasharray="2 12"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <ol aria-label="Langkah roadmap" className="absolute inset-0">
        {steps.map((step, i) => {
          const status = stepStatus(steps, progress, i);
          const x = xOf(i);
          const labelOnLeft = x > 50;
          const todos = todoCount(step, progress);
          return (
            // li selebar 0 = titik jangkar di pusat node; label diukur dari pusat ini.
            <li
              key={step.id}
              id={`langkah-${i + 1}`}
              className="absolute w-0 motion-safe:animate-[rise_600ms_var(--ease-out-expo)_both]"
              style={{ left: `${x}%`, top: yOf(i), animationDelay: `${Math.min(i, 6) * 80}ms` }}
            >
              {status === "current" && (
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute top-0 -translate-y-[60%] ${labelOnLeft ? "left-11" : "right-11"}`}
                  style={{ width: `min(4.5rem, calc(min(100vw - 2rem, 36rem) * ${(labelOnLeft ? 100 - x : x) / 100} - 3rem))` }}
                >
                  <Mascot pose="wave" className={`w-full ${labelOnLeft ? "-scale-x-100" : ""}`} />
                </div>
              )}
              <div className="relative w-[4.5rem] -translate-x-1/2 -translate-y-1/2">
                {status === "current" && (
                  <span className="absolute bottom-full left-1/2 mb-5 -translate-x-1/2 motion-safe:animate-[bob_1s_ease-in-out_infinite_alternate]">
                    <span className="relative block rounded-xl border-2 border-line bg-surface px-3 py-1.5 text-xs font-heading tracking-wide whitespace-nowrap text-brand-ink uppercase shadow-[0_3px_0_var(--color-line)] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[7px] after:border-transparent after:border-t-line">
                      Kamu di sini
                    </span>
                  </span>
                )}
                {status === "current" && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-brand/40 motion-safe:animate-[halo_2s_ease-out_infinite] motion-reduce:hidden"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onOpen(i)}
                  aria-label={`Langkah ${i + 1}: ${step.title}, ${STATUS_TEXT[status]}. Buka detail.`}
                  className={`relative grid size-[4.5rem] place-items-center rounded-full font-display text-2xl font-black transition-transform duration-100 active:translate-y-1.5 active:shadow-none ${NODE_CLASS[status]}`}
                >
                  {status === "done" ? (
                    <CheckIcon className="size-8 motion-safe:animate-[pop_450ms_var(--ease-out-expo)]" strokeWidth={3.5} />
                  ) : (
                    i + 1
                  )}
                </button>
              </div>
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute top-0 -translate-y-1/2 ${labelOnLeft ? "right-12 text-right" : "left-12"}`}
                // Ruang label = jarak dari node ke tepi wadah jalur (lebar wadah = min(layar − 2rem, 36rem)).
                style={{ width: `min(14rem, calc(min(100vw - 2rem, 36rem) * ${(labelOnLeft ? x : 100 - x) / 100} - 3.75rem))` }}
              >
                <p className="text-xs font-emphasis text-ink-muted">{step.weeks} minggu</p>
                <p
                  className={`mt-0.5 text-sm leading-snug font-heading text-balance ${status === "upcoming" ? "text-ink-muted" : ""}`}
                >
                  {step.title}
                </p>
                {status !== "upcoming" && (
                  <p className="mt-0.5 text-xs font-medium text-ink-muted">
                    {todos.done}/{todos.total} to-do
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Piala di ujung jalur: tujuan yang menunggu. */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{ left: `${xOf(steps.length)}%`, top: yOf(steps.length) }}
      >
        <span
          className={`grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl ${
            doneUntil === steps.length
              ? "bg-sun text-on-sun shadow-[0_5px_0_var(--color-sun-lip)]"
              : "border-2 border-line bg-surface-muted text-line-strong shadow-[0_5px_0_var(--color-line)]"
          }`}
        >
          <TrophyIcon className="size-8" strokeWidth={2.25} />
        </span>
      </div>
    </div>
  );
}
