"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Sep } from "@/components/Sep";
import { StoryDate, storyHref } from "@/components/story/StoryBits";
import { buttonClass } from "@/components/ui";
import { STORY_KIND_LABEL, STORY_STATUS_LABEL, type Story } from "@/lib/stories";
import { StoreError, listStoriesForAdmin, moderateStory, type StoryAdminFilter } from "@/lib/store";

const FILTERS: { value: StoryAdminFilter; label: string }[] = [
  { value: "terbit", label: "Tayang" },
  { value: "diturunkan", label: "Diturunkan" },
  { value: "semua", label: "Semua" },
];

const pill = (active: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-heading tracking-wide uppercase transition-colors ${
    active ? "bg-sky-soft text-link ring-2 ring-sky/40 ring-inset" : "text-ink-muted hover:bg-surface-muted"
  }`;

/** Moderasi Blog & Komunitas: tulisan langsung terbit, admin bisa menurunkan dan menayangkan lagi. */
export function StoryModerationSection() {
  const [filter, setFilter] = useState<StoryAdminFilter>("terbit");
  const [items, setItems] = useState<Story[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (f: StoryAdminFilter) => {
    setItems(null);
    setError(null);
    try {
      setItems(await listStoriesForAdmin(f));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Tulisan gagal dimuat.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter), 0);
    return () => clearTimeout(t);
  }, [filter, load]);

  const decide = async (story: Story, status: "terbit" | "diturunkan") => {
    setError(null);
    try {
      const updated = await moderateStory(story.id, status);
      setItems((list) =>
        (list ?? []).flatMap((x) => (x.id !== story.id ? [x] : filter === "semua" || filter === updated.status ? [updated] : [])),
      );
      setNotice(`“${updated.title}” ${status === "diturunkan" ? "diturunkan dan tidak tampil lagi untuk publik" : "tayang lagi"}.`);
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Moderasi gagal disimpan.");
    }
  };

  return (
    <section aria-label="Blog dan komunitas" className="mt-6">
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        Tulisan pengguna langsung terbit. Turunkan yang melanggar (spam, penipuan, data pribadi orang lain); penulis tetap
        bisa melihat dan memperbaikinya, tapi hanya admin yang bisa menayangkannya lagi.
      </p>
      <div role="tablist" aria-label="Status tulisan" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.value} type="button" role="tab" aria-selected={filter === f.value} onClick={() => setFilter(f.value)} className={pill(filter === f.value)}>
            {f.label}
          </button>
        ))}
      </div>

      <p role="status" className={notice ? "mt-4 rounded-2xl bg-leaf-soft px-4 py-3 text-sm" : "sr-only"}>
        {notice ?? ""}
      </p>
      {error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}

      {items === null ? (
        <div aria-hidden="true" className="mt-4 h-40 animate-pulse rounded-card bg-surface-muted" />
      ) : items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
          <Mascot pose="cheer" idle={false} className="h-20 w-auto" />
          {filter === "diturunkan" ? "Tidak ada tulisan yang diturunkan." : "Belum ada tulisan."}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((s) => (
            <li key={s.id}>
              <article className="card p-5">
                <p className="text-xs text-ink-muted">
                  <span className="font-heading text-ink">{STORY_KIND_LABEL[s.kind]}</span>
                  <Sep />
                  {STORY_STATUS_LABEL[s.status]}
                  <Sep />
                  {s.author_name}
                  <Sep />
                  <StoryDate story={s} />
                </p>
                <h3 className="mt-1.5 text-lg leading-snug font-display font-heading tracking-display">{s.title}</h3>
                <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-ink-muted">{s.summary || s.body}</p>
                {s.contact && (
                  <p className="mt-2 text-sm">
                    <span className="font-emphasis">Kontak publik:</span> <span className="break-all">{s.contact}</span>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {s.status === "terbit" ? (
                    <button type="button" onClick={() => void decide(s, "diturunkan")} className={buttonClass("secondary")}>
                      Turunkan<span className="sr-only"> {s.title}</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => void decide(s, "terbit")} className={buttonClass("secondary")}>
                      Tayangkan lagi<span className="sr-only"> {s.title}</span>
                    </button>
                  )}
                  <Link href={storyHref(s.id)} className="rounded px-1 text-sm font-emphasis text-link underline decoration-link/40 underline-offset-4">
                    Buka tulisan<span className="sr-only"> {s.title}</span>
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
