"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { DraftingLoader } from "@/components/DraftingLoader";
import { AlertIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { readDraftSession, updateDraftSession } from "@/lib/draft-session";
import { postJson } from "@/lib/http-client";
import { loginHref } from "@/lib/safe-next";
import { StoreError, createRoadmap, getRoadmap, getUser } from "@/lib/store";
import { ResolvedRoadmapSchema } from "@/lib/types";
import { DraftWorkspace } from "./DraftWorkspace";
import { play } from "@/lib/sound";

const BUILD_MESSAGES = [
  "Menyiapkan roadmap dari plan pilihanmu…",
  "Memecah tujuan jadi langkah mingguan…",
  "Mencocokkan sertifikasi dan beasiswa dari katalog…",
  "Menyimpan roadmapmu…",
];

const BUILD_PATH = "/draft?build=1";

export function DraftPageClient() {
  return (
    <Suspense fallback={null}>
      <DraftWithBuild />
    </Suspense>
  );
}

type Phase = { kind: "idle" } | { kind: "building" } | { kind: "error"; message: string };

function DraftWithBuild() {
  const router = useRouter();
  const autoBuild = useSearchParams().get("build") === "1";
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const startedRef = useRef(false);

  /**
   * Belum login → simpan pilihan (sudah di localStorage) lalu ke /login?next=/draft?build=1.
   * Sudah login → pakai roadmap yang sudah dibuat dari draf ini bila ada (anti-duplikat),
   * kalau belum: minta roadmap ke AI, simpan lewat store, buka roadmap-nya.
   */
  const build = useCallback(async () => {
    const session = readDraftSession();
    const plan = session?.draft?.plans.find((p) => p.id === session.selectedPlanId);
    if (!session?.draft || !plan) {
      router.replace("/draft");
      return;
    }

    const user = await getUser().catch(() => null);
    if (!user) {
      router.push(loginHref(BUILD_PATH));
      return;
    }

    setPhase({ kind: "building" });
    try {
      if (session.roadmapId) {
        const existing = await getRoadmap(session.roadmapId).catch(() => null);
        if (existing) {
          router.replace(`/roadmap/view?id=${existing.id}`);
          return;
        }
      }

      const result = await postJson("/api/roadmap", { profile: session.draft.profile, plan }, ResolvedRoadmapSchema);
      if (!result.ok) {
        play("galat");
        setPhase({ kind: "error", message: result.error });
        return;
      }

      const row = await createRoadmap({
        title: result.data.title,
        summary: result.data.summary,
        dream: session.draft.profile.dream,
        profile: session.draft.profile,
        plan,
        steps: result.data.steps,
      });
      updateDraftSession({ roadmapId: row.id });
      // Momen utama: roadmap pertama jadi.
      play("selesai");
      router.replace(`/roadmap/view?id=${row.id}`);
    } catch (error) {
      if (error instanceof StoreError && error.code === "auth") {
        router.push(loginHref(BUILD_PATH));
        return;
      }
      setPhase({
        kind: "error",
        message: error instanceof StoreError ? error.message : "Roadmap gagal disimpan. Coba lagi sebentar lagi.",
      });
    }
  }, [router]);

  useEffect(() => {
    if (!autoBuild || startedRef.current) return;
    // Ditunda satu tick: efek ini memulai proses async, bukan menyinkronkan state.
    // Penanda dipasang di dalam timer agar efek ganda Strict Mode (dev) tidak membatalkannya.
    const timer = setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      void build();
    }, 0);
    return () => clearTimeout(timer);
  }, [autoBuild, build]);

  if (phase.kind === "building") {
    return (
      <DraftingLoader
        stage="Roadmap"
        messages={BUILD_MESSAGES}
        note="Biasanya kurang dari satu menit. Jangan tutup halaman ini."
      />
    );
  }

  return (
    <>
      {phase.kind === "error" && (
        <div role="alert" className="mx-auto mb-6 flex w-full max-w-6xl gap-3 rounded-card border border-danger/30 bg-danger-soft p-4">
          <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="font-emphasis">Roadmap belum berhasil dibuat</p>
            <p className="mt-1 text-sm leading-relaxed">{phase.message}</p>
          </div>
          <button type="button" onClick={() => void build()} className={`${buttonClass("primary")} shrink-0 self-center`}>
            Coba lagi
          </button>
        </div>
      )}
      <DraftWorkspace onBuild={() => void build()} />
    </>
  );
}
