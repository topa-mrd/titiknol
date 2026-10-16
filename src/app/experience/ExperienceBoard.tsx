"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { ApplicationProgress, StatusChip } from "@/components/experience/ApplicationProgress";
import { ApplyDialog } from "@/components/experience/ApplyDialog";
import { OpportunityCard } from "@/components/experience/OpportunityCard";
import { AlertIcon, ArrowRightIcon, CheckIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { StageRail } from "@/components/StageRail";
import { buttonClass } from "@/components/ui";
import {
  APPLICATION_STATUS_LABEL,
  EMPTY_FILTER,
  POSITION_LABEL,
  filterOpportunities,
  rankOpportunities,
  type OpportunityFilter,
} from "@/lib/opportunities";
import { STRONG_MATCH } from "@/lib/projects";
import { PROVINCES } from "@/lib/regions";
import { loginHref } from "@/lib/safe-next";
import {
  StoreError,
  cancelApplication,
  getUser,
  listMyApplications,
  listOpenOpportunities,
  listRoadmaps,
  type AppUser,
} from "@/lib/store";
import { POSITION_CATEGORIES, type Application, type Opportunity, type RoadmapRow } from "@/lib/types";
import { journeyCompleted } from "@/lib/use-journey";

type Loaded = {
  user: AppUser | null;
  roadmap: RoadmapRow | null;
  opportunities: Opportunity[];
  samplesOnly: boolean;
  applications: Application[];
};

const field =
  "mt-1.5 block w-full rounded-2xl border-2 border-line-strong bg-surface px-4 py-2.5 text-base focus:border-sky focus:outline-none";

export function ExperienceBoard() {
  const router = useRouter();
  const id = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<OpportunityFilter>(EMPTY_FILTER);
  const [applying, setApplying] = useState<Opportunity | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const user = await getUser().catch(() => null);
      let roadmap: RoadmapRow | null = null;
      let applications: Application[] = [];
      let opportunities: Opportunity[] = [];
      let samplesOnly = false;
      try {
        const open = await listOpenOpportunities();
        opportunities = open.items;
        samplesOnly = open.samplesOnly;
        if (user) {
          const [roadmaps, mine] = await Promise.all([listRoadmaps(), listMyApplications()]);
          roadmap = roadmaps[0] ?? null;
          applications = mine;
        }
      } catch (e) {
        if (active) setError(e instanceof StoreError ? e.message : "Lowongan gagal dimuat. Muat ulang halaman.");
      }
      if (active) setLoaded({ user, roadmap, opportunities, samplesOnly, applications });
    })();
    return () => {
      active = false;
    };
  }, []);

  const ranked = useMemo(
    () => (loaded ? rankOpportunities(filterOpportunities(loaded.opportunities, filter), loaded.roadmap) : []),
    [loaded, filter],
  );
  const appliedTo = useMemo(
    () => new Map((loaded?.applications ?? []).filter((a) => a.status !== "dibatalkan").map((a) => [a.opportunityId, a])),
    [loaded],
  );
  const hasSamples = loaded?.opportunities.some((o) => o.sample) ?? false;
  const accepted = (loaded?.applications ?? []).some((a) => a.status !== "dibatalkan" && a.status !== "ditolak");

  const startApply = (o: Opportunity) => {
    if (!loaded?.user) {
      router.push(loginHref("/experience"));
      return;
    }
    setNotice(null);
    setApplying(o);
  };

  const onApplied = (application: Application) => {
    setLoaded((l) => (l ? { ...l, applications: [application, ...l.applications] } : l));
    setNotice("Pendaftaran terkirim. Tim TitikNol akan mengeceknya dan mengabarimu lewat kontak yang kamu tulis.");
  };

  const cancel = async (application: Application) => {
    try {
      const updated = await cancelApplication(application.id);
      setLoaded((l) => (l ? { ...l, applications: l.applications.map((a) => (a.id === updated.id ? updated : a)) } : l));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Lamaran gagal dibatalkan. Coba lagi.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <StageRail current={3} completed={journeyCompleted(!!loaded?.roadmap, accepted)} />
      <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">
        Cari pengalaman nyata
      </h1>
      <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">
        Magang, proyek, dan kerja dari mitra yang lowongannya sudah dicek tim TitikNol. Daftar ke posisi yang cocok, lalu
        tim kami yang menghubungkanmu dengan mitranya.
      </p>

      {error && (
        <p role="alert" className="mt-6 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}
      <p role="status" aria-live="polite" className={notice ? "mt-6 flex gap-2 rounded-2xl border-2 border-leaf bg-leaf-soft px-4 py-3 text-sm font-emphasis text-leaf-ink" : "sr-only"}>
        {notice && <CheckIcon className="mt-0.5 size-4 shrink-0" strokeWidth={3} />}
        {notice}
      </p>

      {loaded && loaded.applications.length > 0 && (
        <section aria-labelledby={`${id}-mine`} className="mt-8">
          <h2 id={`${id}-mine`} className="font-display text-xl font-heading">
            Lamaranku
          </h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {loaded.applications.map((a) => (
              <li key={a.id} className="card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-heading leading-snug">{a.opportunityTitle}</p>
                    <p className="text-sm text-ink-muted">{a.orgName}</p>
                  </div>
                  <StatusChip status={a.status} />
                </div>
                <ApplicationProgress status={a.status} />
                {a.adminNote && (
                  <p className="mt-3 rounded-xl bg-sky-soft px-3 py-2 text-sm leading-relaxed">
                    <span className="font-emphasis">Catatan tim TitikNol:</span> {a.adminNote}
                  </p>
                )}
                {a.orgNote && (
                  <p className="mt-2 rounded-xl bg-sun-soft px-3 py-2 text-sm leading-relaxed">
                    <span className="font-emphasis">Catatan mitra:</span> {a.orgNote}
                  </p>
                )}
                {(a.status === "dikirim" || a.status === "diproses") && (
                  <button
                    type="button"
                    onClick={() => void cancel(a)}
                    className={`${buttonClass("ghost")} mt-2 -ml-3 min-h-10 text-xs`}
                    aria-label={`Batalkan lamaran ${a.opportunityTitle}`}
                  >
                    Batalkan lamaran
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${id}-list`} className="mt-10">
        <h2 id={`${id}-list`} className="sr-only">
          Daftar lowongan
        </h2>
        <form
          role="search"
          onSubmit={(e) => e.preventDefault()}
          className="grid gap-3 rounded-card bg-surface-muted p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:p-5"
        >
          <label className="text-sm font-emphasis">
            Cari posisi
            <input
              type="search"
              className={field}
              value={filter.q}
              placeholder="Mis. desain, admin, magang IT"
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            />
          </label>
          <label className="text-sm font-emphasis">
            Bidang
            <select
              className={field}
              value={filter.category}
              onChange={(e) => setFilter({ ...filter, category: e.target.value as OpportunityFilter["category"] })}
            >
              <option value="semua">Semua bidang</option>
              {POSITION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {POSITION_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-emphasis">
            Daerah
            <select
              className={field}
              value={filter.place}
              onChange={(e) => setFilter({ ...filter, place: e.target.value as OpportunityFilter["place"] })}
            >
              <option value="semua">Semua daerah</option>
              <option value="online">Online / jarak jauh</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </form>

        {loaded && (
          <div className="mt-4 flex flex-col gap-1 text-sm text-ink-muted">
            <p aria-live="polite">
              <span className="font-heading text-ink">{ranked.length} lowongan</span>
              {(filter.q || filter.category !== "semua" || filter.place !== "semua") && (
                <button
                  type="button"
                  onClick={() => setFilter(EMPTY_FILTER)}
                  className="ml-3 font-emphasis text-link underline decoration-link/40 underline-offset-4"
                >
                  Hapus filter
                </button>
              )}
            </p>
            <p>
              {loaded.roadmap
                ? `Diurutkan berdasarkan kecocokan dengan roadmap "${loaded.roadmap.title}".`
                : loaded.user
                  ? "Buat roadmap dulu supaya lowongan diurutkan sesuai tujuanmu."
                  : "Masuk dan buat roadmap supaya lowongan diurutkan sesuai tujuanmu."}
            </p>
          </div>
        )}

        {hasSamples && (
          <p className="mt-4 flex max-w-2xl gap-2 rounded-2xl bg-sun-soft px-4 py-3 text-sm leading-relaxed text-on-sun">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-heading">Data contoh.</span> Lowongan berlabel “(contoh)” fiktif untuk keperluan demo.
              {loaded?.samplesOnly && " Lowongan sungguhan akan tampil setelah mitra mendaftarkannya."}
            </span>
          </p>
        )}

        {!loaded ? (
          <div aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 animate-pulse rounded-card bg-surface-muted" />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
            <Mascot pose="think" idle={false} className="h-20 w-auto" />
            Belum ada lowongan yang cocok dengan filter ini. Coba bidang atau daerah lain.
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ranked.map(({ opportunity: o, matched }) => {
              const mine = appliedTo.get(o.id);
              return (
                <li key={o.id}>
                  <OpportunityCard opportunity={o} matched={matched.length >= STRONG_MATCH ? matched : []}>
                    {mine ? (
                      <p className="flex items-center justify-between gap-3 rounded-2xl bg-leaf-soft px-4 py-3 text-sm font-emphasis text-leaf-ink">
                        Sudah daftar
                        <span className="font-medium">{APPLICATION_STATUS_LABEL[mine.status]}</span>
                      </p>
                    ) : loaded.samplesOnly ? (
                      <p className="rounded-2xl bg-surface-muted px-4 py-3 text-center text-sm font-emphasis text-ink-muted">
                        Lowongan contoh, belum bisa didaftar
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startApply(o)}
                        className={`${buttonClass("secondary")} w-full`}
                        aria-label={`Daftar ke ${o.title}`}
                      >
                        Daftar
                        <ArrowRightIcon className="size-4" />
                      </button>
                    )}
                  </OpportunityCard>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12 flex flex-col items-start gap-4 rounded-card bg-surface-muted p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h2 className="font-display text-xl font-heading">Punya lowongan magang atau proyek?</h2>
          <p className="mt-1 text-ink-muted">Buka lowongan sebagai mitra. Tim kami mengeceknya sebelum tampil di sini.</p>
        </div>
        <Link href="/mitra" className={`${buttonClass("secondary")} shrink-0`}>
          Buka lowongan
        </Link>
      </section>

      <ApplyDialog
        opportunity={applying}
        roadmap={loaded?.roadmap ? { id: loaded.roadmap.id, title: loaded.roadmap.title } : null}
        onClose={() => setApplying(null)}
        onApplied={onApplied}
      />
    </div>
  );
}
