"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertIcon, ArrowLeftIcon, PenIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Sep } from "@/components/Sep";
import { ContactButton, SampleBadge, ShareBar, StoryDate, TagList, storyHref } from "@/components/story/StoryBits";
import { buttonClass } from "@/components/ui";
import { STORY_KIND_LABEL, paragraphs, readingMinutes, type Story } from "@/lib/stories";
import { StoreError, getStory, getUser } from "@/lib/store";

type State = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "ready"; story: Story; mine: boolean };

export function StoryReader() {
  const id = useSearchParams().get("id") ?? "";
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [story, user] = await Promise.all([getStory(id), getUser().catch(() => null)]);
        if (!active) return;
        if (!story) return setState({ status: "missing" });
        setState({ status: "ready", story, mine: !!user && story.user_id === user.id });
        document.title = `${story.title} · TitikNol`;
      } catch (e) {
        if (active) setState({ status: "error", message: e instanceof StoreError ? e.message : "Tulisan gagal dimuat. Muat ulang halaman." });
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <div aria-hidden="true" className="mx-auto w-full max-w-2xl space-y-4">
        <div className="h-6 w-32 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-12 animate-pulse rounded-2xl bg-surface-muted" />
        <div className="h-64 animate-pulse rounded-card bg-surface-muted" />
      </div>
    );
  }

  if (state.status !== "ready") {
    return (
      <div className="card mx-auto flex w-full max-w-xl flex-col items-center p-8 text-center">
        <Mascot pose="think" idle={false} className="h-24 w-auto" />
        <h1 className="mt-4 text-2xl font-display font-heading tracking-display">
          {state.status === "missing" ? "Tulisan tidak ditemukan" : "Tulisan gagal dimuat"}
        </h1>
        <p className="mt-2 leading-relaxed text-ink-muted">
          {state.status === "missing"
            ? "Mungkin sudah dihapus penulisnya, masih berupa draf, atau linknya terpotong."
            : state.message}
        </p>
        <Link href="/blog" className={`${buttonClass("secondary")} mt-6`}>
          Ke Blog
        </Link>
      </div>
    );
  }

  const { story, mine } = state;
  const isArticle = story.kind === "artikel";
  const back = isArticle ? { href: "/blog", label: "Semua tulisan" } : { href: `/komunitas?tab=${story.kind}`, label: "Kembali ke Komunitas" };

  return (
    <article className="mx-auto w-full max-w-2xl">
      <Link
        href={back.href}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 text-sm font-emphasis text-ink-muted hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" />
        {back.label}
      </Link>

      {mine && story.status !== "terbit" && (
        <p
          role="status"
          className={`mt-4 flex gap-2 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            story.status === "diturunkan" ? "bg-danger-soft" : "bg-sun-soft text-on-sun"
          }`}
        >
          <AlertIcon className={`mt-0.5 size-4 shrink-0 ${story.status === "diturunkan" ? "text-danger" : ""}`} />
          {story.status === "draf"
            ? "Ini masih draf. Hanya kamu yang bisa melihatnya sampai kamu menerbitkannya."
            : "Tulisan ini diturunkan admin dan tidak tampil untuk orang lain. Hubungi tim TitikNol bila menurutmu ini keliru."}
        </p>
      )}

      <header className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          {!isArticle && (
            <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-heading text-brand-ink">
              {STORY_KIND_LABEL[story.kind]}
            </span>
          )}
          {story.sample && <SampleBadge />}
        </div>
        <h1 className="mt-3 font-display text-[2rem] leading-[1.15] font-heading tracking-display text-balance sm:text-[2.625rem]">
          {story.title}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          <span className="font-emphasis text-ink">{story.author_name}</span>
          <Sep />
          <StoryDate story={story} />
          <Sep />
          {readingMinutes(story.body)} menit baca
        </p>
        <div className="mt-4">
          <TagList tags={story.tags} linked />
        </div>
      </header>

      {story.summary && <p className="mt-8 text-xl leading-relaxed font-medium text-pretty">{story.summary}</p>}

      <div className="mt-6 space-y-5 text-lg leading-[1.75] text-pretty">
        {paragraphs(story.body).map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>

      {!isArticle && (
        <section aria-label="Kontak" className="mt-8 rounded-card bg-surface-muted p-5">
          <p className="text-sm leading-relaxed text-ink-muted">
            Kontak ini dibagikan sendiri oleh {story.author_name}. Perkenalkan dirimu dengan sopan, dan jangan pernah
            mengirim uang atau data pribadi.
          </p>
          <ContactButton story={story} className="mt-4" />
        </section>
      )}

      <footer className="mt-10 border-t-2 border-line pt-6">
        {story.status === "terbit" && !story.sample && <ShareBar title={story.title} path={storyHref(story.id)} />}
        <div className="mt-8 flex flex-col items-start gap-4 rounded-card bg-brand-soft p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="font-display text-lg font-heading tracking-display">
            {mine ? "Mau mengubah tulisan ini?" : "Punya cerita juga? Ceritakan lewat suara."}
          </p>
          <Link href={mine ? `/share?edit=${story.id}` : "/share"} className={`${buttonClass("primary")} shrink-0`}>
            <PenIcon className="size-4" strokeWidth={2.25} />
            {mine ? "Edit di studio" : "Tulis cerita"}
          </Link>
        </div>
      </footer>
    </article>
  );
}
