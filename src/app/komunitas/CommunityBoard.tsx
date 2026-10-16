"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { AlertIcon, UsersIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { ProfileCard } from "@/components/story/StoryBits";
import { fieldClass } from "@/components/experience/form";
import { buttonClass } from "@/components/ui";
import { SAMPLE_STORIES, filterStories, type Story } from "@/lib/stories";
import { StoreError, listPublishedStories } from "@/lib/store";

type Tab = "mentor" | "komunitas";
const TABS: { value: Tab; label: string; empty: string }[] = [
  { value: "mentor", label: "Mentor", empty: "Belum ada mentor yang cocok." },
  { value: "komunitas", label: "Komunitas", empty: "Belum ada komunitas yang cocok." },
];

export function CommunityBoard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get("tab") === "komunitas" ? "komunitas" : "mentor";
  const [query, setQuery] = useState("");
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    listPublishedStories(["mentor", "komunitas"])
      .then((list) => active && setStories(list))
      .catch((e) => {
        if (!active) return;
        setError(e instanceof StoreError ? e.message : "Daftar gagal dimuat. Muat ulang halaman.");
        setStories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectTab = (next: Tab) => router.replace(`${pathname}?tab=${next}`, { scroll: false });
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "mentor" ? "komunitas" : "mentor";
    selectTab(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };

  const real = (stories ?? []).filter((s) => s.kind === tab);
  const samplesOnly = stories !== null && real.length === 0 && !error;
  const pool = samplesOnly ? SAMPLE_STORIES.filter((s) => s.kind === tab) : real;
  const shown = filterStories(pool, { query });
  const current = TABS.find((t) => t.value === tab)!;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">
            Komunitas
          </h1>
          <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">
            Cari mentor yang mau berbagi, atau komunitas untuk belajar bareng. Kontaknya dibagikan langsung oleh mereka.
          </p>
        </div>
        <div className="grid shrink-0 gap-3 sm:flex">
          <Link href="/share?jenis=mentor" className={buttonClass("primary", "lg")}>
            Jadi mentor
          </Link>
          <Link href="/share?jenis=komunitas" className={buttonClass("secondary", "lg")}>
            <UsersIcon className="size-5" />
            Daftarkan komunitas
          </Link>
        </div>
      </div>

      <div role="tablist" aria-label="Jenis" className="mt-8 flex gap-2 border-b-2 border-line pb-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            id={`${id}-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            aria-controls={`${id}-panel`}
            tabIndex={tab === t.value ? 0 : -1}
            onClick={() => selectTab(t.value)}
            onKeyDown={onTabKey}
            className={`min-h-11 rounded-full px-5 text-sm font-heading tracking-wide uppercase transition-colors ${
              tab === t.value ? "bg-brand-soft text-brand-ink ring-2 ring-brand/40 ring-inset" : "text-ink-muted hover:bg-surface-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="pt-6">
        <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-xl">
          <label className="block text-sm font-emphasis">
            {tab === "mentor" ? "Cari mentor" : "Cari komunitas"}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "mentor" ? "Mis. desain, CV, coding" : "Mis. beasiswa, online, Pantura"}
              className={fieldClass}
            />
          </label>
        </form>

        {error && (
          <p role="alert" className="mt-6 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
            <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
            {error}
          </p>
        )}
        {samplesOnly && (
          <p className="mt-6 flex max-w-2xl gap-2 rounded-2xl bg-sun-soft px-4 py-3 text-sm leading-relaxed text-on-sun">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            Belum ada {tab} yang mendaftar. Profil di bawah adalah contoh supaya kamu tahu bentuknya.
          </p>
        )}

        {stories === null ? (
          <div aria-hidden="true" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-card bg-surface-muted" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
            <Mascot pose="think" idle={false} className="h-20 w-auto" />
            {current.empty}
          </div>
        ) : (
          <ul aria-label={`Daftar ${current.label.toLowerCase()}`} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((s) => (
              <li key={s.id}>
                <ProfileCard story={s} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
