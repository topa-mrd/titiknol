"use client";

import { useEffect, useState } from "react";
import { Mascot } from "./Mascot";
import { Sep } from "./Sep";
import { ThreadNode, ThreadSegment, type ThreadState } from "./Thread";

const DRAFT_MESSAGES = [
  "Membaca ceritamu…",
  "Memetakan kondisi dan kendalamu…",
  "Mencari jalur yang realistis…",
  "Menyusun Plan A, B, dan C…",
];

type LoaderProps = {
  /** Nama tahap (sengaja bahasa Inggris). */
  stage?: string;
  messages?: readonly string[];
  note?: string;
};

/** Layar tunggu saat AI bekerja. Pesan berganti tiap beberapa detik. */
export function DraftingLoader({
  stage = "Drafting",
  messages = DRAFT_MESSAGES,
  note = "Biasanya kurang dari setengah menit. Jangan tutup halaman ini.",
}: LoaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => Math.min(i + 1, messages.length - 1)), 2_800);
    return () => clearInterval(timer);
  }, [messages.length]);

  return (
    <div className="mx-auto w-full max-w-md py-10 sm:py-16">
      <Mascot pose="think" className="mb-6 h-28 w-auto sm:h-32" />
      <p
        key={index}
        role="status"
        aria-live="polite"
        className="min-h-[2.3em] font-display motion-safe:animate-[rise_500ms_var(--ease-out-expo)_both] text-[1.75rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2rem]"
      >
        {messages[index]}
      </p>
      <p className="mt-3 text-ink-muted">
        <span lang="en" className="font-medium text-ink">
          {stage}
        </span>
        <Sep />
        {note}
      </p>
      <ol aria-hidden="true" className="mt-10">
        {messages.map((m, i) => {
          const state: ThreadState = i < index ? "done" : i === index ? "current" : "pending";
          return (
            <li key={m} className="relative pb-6 pl-10 last:pb-0">
              {i < messages.length - 1 && <ThreadSegment done={i < index} axis="y" className="absolute top-7 bottom-0.5 left-[10px]" />}
              <ThreadNode state={state} className="absolute top-0 left-0" />
              <p className={`text-sm leading-6 ${state === "current" ? "font-heading text-ink" : "font-medium text-ink-muted"}`}>
                {m.replace(/…$/, "")}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
