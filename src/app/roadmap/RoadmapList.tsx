"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertIcon, ArrowRightIcon, MicIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { currentIndex, stats } from "@/lib/progress";
import { loginHref } from "@/lib/safe-next";
import { StoreError, deleteRoadmap, getUser, listRoadmaps } from "@/lib/store";
import type { RoadmapRow } from "@/lib/types";
import { Sep } from "@/components/Sep";

type State = { kind: "loading" } | { kind: "ready"; roadmaps: RoadmapRow[] } | { kind: "error"; message: string };

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

export function RoadmapList() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getUser().catch(() => null);
      if (!user) {
        router.replace(loginHref("/roadmap"));
        return;
      }
      try {
        const roadmaps = await listRoadmaps();
        if (active) setState({ kind: "ready", roadmaps });
      } catch (error) {
        if (active) {
          setState({ kind: "error", message: error instanceof StoreError ? error.message : "Daftar roadmap gagal dimuat." });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const remove = async (id: string) => {
    setActionError(null);
    try {
      await deleteRoadmap(id);
      setState((s) => (s.kind === "ready" ? { ...s, roadmaps: s.roadmaps.filter((r) => r.id !== id) } : s));
    } catch (error) {
      setActionError(error instanceof StoreError ? error.message : "Roadmap gagal dihapus. Coba lagi.");
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display sm:text-[2.625rem]">Roadmap saya</h1>
        </div>
        {state.kind === "ready" && state.roadmaps.length > 0 && (
          <Link href="/start" className={buttonClass("secondary")}>
            Buat roadmap baru
          </Link>
        )}
      </div>

      {actionError && (
        <p role="alert" className="mt-6 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {actionError}
        </p>
      )}

      {state.kind === "loading" && (
        <div aria-hidden="true" className="mt-8 grid animate-pulse gap-4 sm:grid-cols-2">
          <div className="h-48 rounded-card bg-line" />
          <div className="h-48 rounded-card bg-line" />
        </div>
      )}

      {state.kind === "error" && (
        <p role="alert" className="mt-8 flex gap-2 rounded-card bg-danger-soft p-4">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
          {state.message}
        </p>
      )}

      {state.kind === "ready" && state.roadmaps.length === 0 && (
        <div className="mt-8 rounded-card border border-dashed border-line px-6 py-14 text-center">
          <h2 className="text-xl font-display font-heading">Belum ada roadmap</h2>
          <p className="mx-auto mt-2 max-w-sm leading-relaxed text-ink-muted">
            Ceritakan mimpimu, pilih satu plan, dan roadmapmu akan tersimpan di sini.
          </p>
          <Link href="/start" className={`${buttonClass("primary", "lg")} mt-6`}>
            <MicIcon className="size-5" />
            Ceritakan mimpimu
          </Link>
        </div>
      )}

      {state.kind === "ready" && state.roadmaps.length > 0 && (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {state.roadmaps.map((roadmap) => {
            const s = stats(roadmap.steps, roadmap.progress);
            const next = currentIndex(roadmap.steps, roadmap.progress);
            return (
              <li key={roadmap.id} className="flex flex-col card p-5 sm:p-6">
                <h2 className="text-xl leading-snug font-display font-heading tracking-display text-balance">{roadmap.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Plan {roadmap.plan.id}
                  <Sep />
                  dibuat {dateFormat.format(new Date(roadmap.created_at))}
                </p>
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{roadmap.summary}</p>

                <div className="mt-4">
                  <div className="flex justify-between text-sm font-medium">
                    <span>
                      {s.doneSteps}/{s.totalSteps} langkah
                    </span>
                    <span className="text-ink-muted">{s.percent}%</span>
                  </div>
                  <div aria-hidden="true" className="mt-1.5 h-3 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-leaf" style={{ width: `${s.percent}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">
                    {s.complete ? "Semua langkah selesai" : `Berikutnya: ${roadmap.steps[next]?.title}`}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-5">
                  {confirming === roadmap.id ? (
                    <div role="group" aria-label="Konfirmasi hapus" className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">Hapus roadmap ini?</span>
                      <button type="button" onClick={() => void remove(roadmap.id)} className="min-h-10 rounded-full bg-danger px-4 text-sm font-emphasis text-white">
                        Ya, hapus
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className={`${buttonClass("ghost")} min-h-10 text-sm`}>
                        Batal
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setConfirming(roadmap.id)}
                        className={`${buttonClass("ghost")} -ml-3 min-h-10 text-sm`}
                        aria-label={`Hapus ${roadmap.title}`}
                      >
                        Hapus
                      </button>
                      <Link href={`/roadmap/view?id=${roadmap.id}`} className={buttonClass("secondary")}>
                        {s.doneSteps === 0 ? "Mulai" : s.complete ? "Lihat" : "Lanjutkan"}
                        <ArrowRightIcon className="size-5" />
                      </Link>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
