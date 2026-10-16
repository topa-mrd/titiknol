import type { CSSProperties } from "react";
import { CheckIcon } from "./icons";

/**
 * Jalur tahap TitikNol. Status dibaca dari bentuk dan warna sekaligus:
 * selesai = node hijau bercentang + bar hijau; sekarang = node oranye berbibir;
 * belum = node abu kosong + bar abu.
 */
export type ThreadState = "done" | "current" | "pending";

const NODE = {
  done: "bg-leaf text-on-leaf shadow-[0_3px_0_var(--color-leaf-lip)]",
  current: "bg-brand text-on-brand shadow-[0_3px_0_var(--color-brand-lip)] ring-4 ring-brand/20",
  pending: "border-2 border-line-strong/50 bg-surface",
} as const;

/** Node besar berbibir (mini versi node roadmap), berisi nomor bila belum selesai. */
const NODE_LG = {
  done: "bg-leaf text-on-leaf shadow-[0_4px_0_var(--color-leaf-lip)]",
  current: "bg-brand text-on-brand shadow-[0_4px_0_var(--color-brand-lip)] ring-4 ring-brand/20",
  pending: "border-2 border-line bg-surface text-ink-muted shadow-[0_4px_0_var(--color-line)]",
} as const;

export function ThreadNode({
  state,
  size = "md",
  className = "",
  style,
  label,
}: {
  state: ThreadState;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
  /** Nomor di dalam node besar (hanya size "lg"). */
  label?: string;
}) {
  if (size === "lg") {
    return (
      <span
        aria-hidden="true"
        style={style}
        className={`${className.includes("absolute") ? "" : "relative"} grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-black ${NODE_LG[state]} ${className}`}
      >
        {state === "done" ? (
          <CheckIcon className="size-5 motion-safe:animate-[pop_420ms_var(--ease-out-expo)]" strokeWidth={3.5} />
        ) : (
          label
        )}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`${className.includes("absolute") ? "" : "relative"} grid ${size === "sm" ? "size-5" : "size-6"} shrink-0 place-items-center rounded-full ${NODE[state]} ${className}`}
    >
      {state === "done" && (
        <CheckIcon
          className={`${size === "sm" ? "size-3" : "size-3.5"} motion-safe:animate-[pop_420ms_var(--ease-out-expo)]`}
          strokeWidth={3.5}
        />
      )}
      {state === "current" && <span className={`${size === "sm" ? "size-1.5" : "size-2"} rounded-full bg-on-brand`} />}
    </span>
  );
}

/** Ruas di antara dua node. Ruas yang selesai "ditarik" sekali saat muncul. */
export function ThreadSegment({
  done,
  axis = "x",
  className = "",
  style,
}: {
  done: boolean;
  axis?: "x" | "y";
  className?: string;
  style?: CSSProperties;
}) {
  const tone = done ? "bg-leaf" : "bg-line";
  const draw = done
    ? axis === "x"
      ? "origin-left motion-safe:animate-[thread-draw_650ms_var(--ease-out-expo)]"
      : "origin-top motion-safe:animate-[thread-draw-y_650ms_var(--ease-out-expo)]"
    : "";
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`block rounded-full ${axis === "x" ? "h-1" : "w-1"} ${tone} ${draw} ${className}`}
    />
  );
}

/** Nomor urut dua digit (01, 02, …): urutannya memang informasi bagi pengguna. */
export const seq = (n: number) => String(n).padStart(2, "0");
