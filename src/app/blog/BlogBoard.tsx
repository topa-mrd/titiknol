"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { AlertIcon, PenIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { ArticleCard } from "@/components/story/StoryBits";
import { fieldClass } from "@/components/experience/form";
import { buttonClass } from "@/components/ui";
import { SAMPLE_STORIES, filterStories, popularTags, toTag, type Story } from "@/lib/stories";
import { StoreError, listPublishedStories } from "@/lib/store";

const SAMPLE_ARTICLES = SAMPLE_STORIES.filter((s) => s.kind === "artikel");

export function BlogBoard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tag = toTag(params.get("tag") ?? "") || null;
  const [query, setQuery] = useState("");
  const [stories, setStories] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    listPublishedStories(["artikel"])
      .then((list) => active && setStories(list))
      .catch((e) => {
        if (!active) return;
        setError(e instanceof StoreError ? e.message : "Tulisan gagal dimuat. Muat ulang halaman.");
        setStories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  // Belum ada tulisan pengguna: tampilkan contoh berlabel supaya bentuknya terbayang.
  const samplesOnly = stories !== null && stories.length === 0 && !error;
  const pool = useMemo(() => (samplesOnly ? [...SAMPLE_ARTICLES] : (stories ?? [])), [samplesOnly, stories]);
  const tags = useMemo(() => popularTags(pool), [pool]);
  const shown = filterStories(pool, { tag, query });

  const setTag = (next: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set("tag", next);
    else sp.delete("tag");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">Blog</h1>
          <p className="mt-3 max-w-prose text-lg leading-relaxed text-pretty text-ink-muted">
            Cerita nyata dari anak muda yang mulai dari titik nol. Ditulis lewat suara, dirapikan AI, diperiksa penulisnya
            sendiri.
          </p>
        </div>
        <Link href="/share" className={`${buttonClass("primary", "lg")} shrink-0`}>
          <PenIcon className="size-5" strokeWidth={2.25} />
          Tulis cerita
        </Link>
      </div>

      <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-8 rounded-card bg-surface-muted p-4 sm:p-5">
        <label className="block text-sm font-emphasis">
          Cari tulisan
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Mis. beasiswa, belajar dari HP, magang"
            className={fieldClass}
          />
        </label>
        {tags.length > 0 && (
          <div className="mt-4">
            <p id={`${id}-tags`} className="text-sm font-emphasis">
              Tag
            </p>
            <ul aria-labelledby={`${id}-tags`} className="mt-2 flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t}>
                  <button
                    type="button"
                    aria-pressed={tag === t}
                    onClick={() => setTag(tag === t ? null : t)}
                    className={`min-h-10 rounded-full px-4 text-sm font-emphasis transition-colors ${
                      tag === t ? "bg-link text-white" : "border-2 border-line bg-surface text-link hover:border-sky/60"
                    }`}
                  >
                    #{t}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
          Belum ada tulisan dari pengguna. Tulisan di bawah adalah contoh supaya kamu tahu bentuknya.
        </p>
      )}

      <section aria-labelledby={`${id}-list`} className="mt-6">
        <h2 id={`${id}-list`} className="sr-only">
          Daftar tulisan
        </h2>
        {stories === null ? (
          <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-card bg-surface-muted" />
            ))}
          </div>
        ) : (
          <>
            <p aria-live="polite" className="mb-4 text-sm text-ink-muted">
              <span className="font-heading text-ink">{shown.length} tulisan</span>
              {(tag || query) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setTag(null);
                  }}
                  className="ml-3 font-emphasis text-link underline decoration-link/40 underline-offset-4"
                >
                  Hapus filter
                </button>
              )}
            </p>
            {shown.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
                <Mascot pose="think" idle={false} className="h-20 w-auto" />
                Belum ada tulisan yang cocok. Coba kata lain, atau tulis ceritamu sendiri.
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shown.map((s) => (
                  <li key={s.id}>
                    <ArticleCard story={s} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
