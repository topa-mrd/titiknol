"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const COST_SAVE_DELAY_MS = 700;
import { CostCalculator } from "@/components/CostCalculator";
import { AlertIcon, ArrowRightIcon, CheckIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { RoadPath } from "@/components/RoadPath";
import { StepSheet } from "@/components/StepSheet";
import { buttonClass } from "@/components/ui";
import { setStepDone, stats, toggleTodo } from "@/lib/progress";
import { loginHref } from "@/lib/safe-next";
import { StoreError, getCatalogLinks, getRoadmap, getUser, updateRoadmapCosts, updateRoadmapProgress } from "@/lib/store";
import { todoKey, type CatalogLink, type Progress, type ResolvedStep, type RoadmapCosts, type RoadmapRow } from "@/lib/types";
import { StageRail } from "@/components/StageRail";
import { play } from "@/lib/sound";

type State =
  | { kind: "loading" }
  | { kind: "ready"; roadmap: RoadmapRow }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export function RoadmapView() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getUser().catch(() => null);
      if (!user) {
        router.replace(loginHref(`/roadmap/view?id=${encodeURIComponent(id)}`));
        return;
      }
      try {
        const roadmap = id ? await getRoadmap(id) : null;
        if (active) setState(roadmap ? { kind: "ready", roadmap } : { kind: "missing" });
      } catch (error) {
        if (active) {
          setState({ kind: "error", message: error instanceof StoreError ? error.message : "Roadmap gagal dimuat. Muat ulang halaman." });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id, router]);

  if (state.kind === "loading") return <RoadmapSkeleton />;
  if (state.kind === "missing") {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display">Roadmap tidak ditemukan</h1>
        <p className="mt-3 text-lg text-ink-muted">Mungkin sudah dihapus, atau milik akun lain.</p>
        <Link href="/roadmap" className={`${buttonClass("primary", "lg")} mt-8`}>
          Lihat roadmap saya
        </Link>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <p role="alert" className="mx-auto flex max-w-xl gap-2 rounded-card bg-danger-soft p-4">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
        {state.message}
      </p>
    );
  }
  return <RoadmapJourney roadmap={state.roadmap} />;
}

function RoadmapJourney({ roadmap }: { roadmap: RoadmapRow }) {
  const [progress, setProgress] = useState<Progress>(roadmap.progress);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [cheer, setCheer] = useState(0);

  // Simpan berurutan; bila gagal, kembali ke progres terakhir yang benar-benar tersimpan.
  const savedRef = useRef<Progress>(roadmap.progress);
  const latestRef = useRef<Progress>(roadmap.progress);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  /** Perubahan dihitung dari progres terbaru (bukan dari closure render) agar klik beruntun tidak hilang. */
  const persist = (update: (current: Progress) => Progress) => {
    const next = update(latestRef.current);
    latestRef.current = next;
    setProgress(next);
    setSaveError(null);
    setSaveState("saving");
    pendingRef.current += 1;
    chainRef.current = chainRef.current.then(async () => {
      try {
        const row = await updateRoadmapProgress(roadmap.id, next);
        savedRef.current = row.progress;
        if (pendingRef.current === 1) setSaveState("saved");
      } catch (error) {
        latestRef.current = savedRef.current;
        setProgress(savedRef.current);
        setSaveState("idle");
        setSaveError(
          error instanceof StoreError
            ? `Progres belum tersimpan: ${error.message}`
            : "Progres belum tersimpan. Periksa koneksimu lalu coba lagi.",
        );
      } finally {
        pendingRef.current -= 1;
      }
    });
  };

  // Kalkulator biaya: disimpan setelah pengguna berhenti mengetik sebentar.
  const [costs, setCosts] = useState<RoadmapCosts>(roadmap.costs);
  const [costLabel, setCostLabel] = useState("");
  const savedCostsRef = useRef<RoadmapCosts>(roadmap.costs);
  const costTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changeCosts = (next: RoadmapCosts) => {
    setCosts(next);
    setCostLabel("Menyimpan…");
    if (costTimerRef.current) clearTimeout(costTimerRef.current);
    costTimerRef.current = setTimeout(() => {
      chainRef.current = chainRef.current.then(async () => {
        try {
          const row = await updateRoadmapCosts(roadmap.id, next);
          savedCostsRef.current = row.costs;
          setCostLabel("Tersimpan");
        } catch (error) {
          setCosts(savedCostsRef.current);
          setCostLabel(
            error instanceof StoreError
              ? `Belum tersimpan: ${error.message}`
              : "Belum tersimpan. Periksa koneksimu lalu coba lagi.",
          );
        }
      });
    }, COST_SAVE_DELAY_MS);
  };

  useEffect(
    () => () => {
      if (costTimerRef.current) clearTimeout(costTimerRef.current);
    },
    [],
  );

  // Sumber disegarkan dari katalog: revisi admin langsung berlaku, sumber yang ditolak disembunyikan.
  const [links, setLinks] = useState<Map<string, CatalogLink> | null>(null);
  useEffect(() => {
    let active = true;
    const ids = roadmap.steps.flatMap((s) => s.resources.map((r) => r.id));
    void getCatalogLinks(ids).then((list) => {
      if (active && list) setLinks(new Map(list.map((l) => [l.id, l])));
    });
    return () => {
      active = false;
    };
  }, [roadmap.id, roadmap.steps]);
  const steps = useMemo(
    () =>
      links
        ? roadmap.steps.map((s) => ({
            ...s,
            resources: s.resources.flatMap((r) => {
              const fresh = links.get(r.id);
              return fresh ? [{ ...r, ...fresh }] : [];
            }),
          }))
        : roadmap.steps,
    [roadmap.steps, links],
  );
  const summary = stats(steps, progress);
  const openStep = openIndex !== null ? steps[openIndex] : null;

  const handleSetDone = (step: ResolvedStep, done: boolean) => {
    persist((current) => setStepDone(current, step, done));
    if (done) play("selesai");
    setOpenIndex(null);
    const index = steps.findIndex((s) => s.id === step.id);
    if (done) {
      setCheer((n) => n + 1);
      // Pastikan node yang baru selesai terlihat di atas bilah pujian (terutama di HP).
      requestAnimationFrame(() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById(`langkah-${index + 1}`)?.scrollIntoView({
          block: "center",
          behavior: reduce ? "auto" : "smooth",
        });
      });
    }
    setAnnouncement(
      done
        ? index + 1 < steps.length
          ? `Langkah ${index + 1} selesai. Lanjut ke langkah berikutnya!`
          : `Langkah ${index + 1} selesai.`
        : `Langkah ${index + 1} ditandai belum selesai.`,
    );
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header>
        <StageRail current={2} />
        <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">{roadmap.title}</h1>
        <p className="mt-3 text-sm font-emphasis text-ink-muted">Plan {roadmap.plan.id}</p>
        <p className="mt-4 text-lg leading-relaxed text-pretty text-ink-muted">{roadmap.summary}</p>

        {saveError && (
          <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm leading-relaxed">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            {saveError}
          </p>
        )}
        <p className="sr-only" role="status">
          {announcement}
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-xl rounded-card bg-brand px-5 py-4 text-on-brand shadow-[0_5px_0_var(--color-brand-lip)] sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-display text-xl font-black">
            {summary.doneSteps} dari {summary.totalSteps} langkah selesai
          </p>
          <p className="text-sm font-emphasis">
            {summary.complete ? "Semua langkah tuntas" : `Sisa sekitar ${summary.weeksLeft} minggu`}
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="Kemajuan roadmap"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.percent}
          className="mt-3 h-4 overflow-hidden rounded-full bg-brand-lip/45"
        >
          <div
            className="relative h-full rounded-full bg-white transition-[width] duration-700 ease-out"
            style={{ width: `${summary.percent}%` }}
          >
            <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-sun/60" />
          </div>
        </div>
        <p className="mt-2 flex h-5 items-center gap-1.5 text-xs font-emphasis" aria-live="polite">
          {saveState === "saved" && <CheckIcon aria-hidden="true" className="size-3.5" strokeWidth={3} />}
          {saveState === "saving" ? "Menyimpan…" : saveState === "saved" ? "Tersimpan" : ""}
        </p>
      </div>

      <div className="mt-6">
        <RoadPath steps={steps} progress={progress} onOpen={setOpenIndex} />
      </div>

      <div className="mt-10">
        <CostCalculator steps={steps} costs={costs} onChange={changeCosts} saveLabel={costLabel} />
      </div>

      {summary.complete && (
        <section className="mt-6 rounded-card border-2 border-b-4 border-leaf bg-leaf-soft p-6 text-center">
          <Mascot pose="cheer" className="mx-auto h-28 w-auto" />
          <h2 className="mt-4 text-2xl font-display font-heading tracking-display">Semua langkah selesai</h2>
          <p className="mx-auto mt-2 max-w-md leading-relaxed text-ink-muted">
            Kamu sudah sampai di ujung roadmap ini. Saatnya menguji kemampuanmu lewat proyek nyata.
          </p>
          <Link href="/experience" className={`${buttonClass("primary", "lg")} mt-6`}>
            Cari proyek di <span lang="en">Experience</span>
            <ArrowRightIcon className="size-5" />
          </Link>
        </section>
      )}

      <div className="mt-10 flex flex-wrap justify-between gap-3 border-t border-line pt-6">
        <Link href="/roadmap" className={buttonClass("ghost")}>
          Semua roadmap saya
        </Link>
        <Link href="/draft" className={buttonClass("ghost")}>
          Kembali ke draf
        </Link>
      </div>

      {cheer > 0 && <CheerToast key={cheer} />}

      <StepSheet
        step={openStep}
        index={openIndex ?? 0}
        progress={progress}
        onToggleTodo={(stepId, i) => {
          if (!progress.doneTodos.includes(todoKey(stepId, i))) play("benar");
          persist((current) => toggleTodo(current, stepId, i));
        }}
        onSetDone={handleSetDone}
        onClose={() => setOpenIndex(null)}
      />
    </div>
  );
}

function RoadmapSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-3xl motion-safe:animate-pulse">
      <div className="h-10 w-3/4 rounded-xl bg-surface" />
      <div className="mt-4 h-5 w-1/3 rounded-full bg-surface" />
      <div className="mt-8 h-24 rounded-card bg-surface-muted" />
      <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="size-11 shrink-0 rounded-full bg-surface" />
            <div className="h-6 flex-1 rounded-lg bg-surface" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pujian singkat setelah menandai langkah selesai (visual saja; pengumuman pembaca layar terpisah). */
function CheerToast() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t-2 border-leaf bg-leaf-soft motion-safe:animate-[rise_400ms_var(--ease-out-expo)_both]"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3">
        <Mascot pose="cheer" idle={false} className="h-16 w-auto shrink-0" />
        <p className="font-display text-xl font-black text-leaf-ink">Mantap, satu langkah beres!</p>
      </div>
    </div>
  );
}
