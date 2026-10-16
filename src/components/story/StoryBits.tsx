"use client";

import Link from "next/link";
import { useState } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { STORY_KIND_LABEL, contactHref, readingMinutes, whatsappLink, type Story } from "@/lib/stories";
import { ChatIcon, CheckIcon, ExternalIcon, LinkIcon, ShareIcon } from "../icons";
import { Sep } from "../Sep";
import { buttonClass } from "../ui";

export const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" });

export const storyHref = (id: string) => `/blog/baca?id=${id}`;

/** Tanggal terbit (atau tanggal dibuat untuk draf). */
export function StoryDate({ story }: { story: Pick<Story, "published_at" | "created_at"> }) {
  const at = story.published_at ?? story.created_at;
  return <time dateTime={at}>{dateFormat.format(new Date(at))}</time>;
}

export function TagList({ tags, linked = false }: { tags: readonly string[]; linked?: boolean }) {
  if (tags.length === 0) return null;
  return (
    <ul aria-label="Tag" className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <li key={t}>
          {linked ? (
            <Link
              href={`/blog?tag=${encodeURIComponent(t)}`}
              className="inline-flex min-h-8 items-center rounded-full bg-sky-soft px-3 text-xs font-emphasis text-link hover:ring-2 hover:ring-sky/40"
            >
              #{t}
            </Link>
          ) : (
            <span className="inline-flex items-center rounded-full bg-sky-soft px-2.5 py-0.5 text-xs font-emphasis text-link">#{t}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function SampleBadge() {
  return <span className="inline-flex items-center rounded-full bg-sun-soft px-2.5 py-0.5 text-xs font-heading text-on-sun">Contoh</span>;
}

/** Kartu artikel di Blog: seluruh kartu bisa diklik lewat judulnya. */
export function ArticleCard({ story }: { story: Story }) {
  return (
    <article className="card group relative flex h-full flex-col p-5 transition-transform duration-150 has-[a:hover]:-translate-y-0.5 sm:p-6">
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        {story.sample && <SampleBadge />}
        <span>
          <StoryDate story={story} />
          <Sep />
          {readingMinutes(story.body)} menit baca
        </span>
      </div>
      <h3 className="mt-2 text-xl leading-snug font-display font-heading tracking-display text-balance">
        <Link href={storyHref(story.id)} className="after:absolute after:inset-0 after:rounded-card hover:text-brand-ink">
          {story.title}
        </Link>
      </h3>
      {story.summary && <p className="mt-2 line-clamp-3 leading-relaxed text-pretty text-ink-muted">{story.summary}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <span className="text-sm font-emphasis">{story.author_name}</span>
        <TagList tags={story.tags.slice(0, 3)} />
      </div>
    </article>
  );
}

/** Tombol kontak publik: WhatsApp → wa.me, link https dibuka di tab baru. */
export function ContactButton({ story, className = "" }: { story: Story; className?: string }) {
  if (story.sample) {
    return <p className={`text-sm text-ink-muted ${className}`}>Profil contoh, belum bisa dihubungi.</p>;
  }
  const href = story.contact ? contactHref(story.contact) : null;
  if (!href) return null;
  const wa = whatsappLink(story.contact!);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`${buttonClass("secondary")} ${className}`}>
      {wa ? <ChatIcon className="size-4" /> : <ExternalIcon className="size-4" />}
      {wa ? "Chat WhatsApp" : "Buka kontak"}
      <span className="sr-only">
        {" "}
        {story.author_name} (buka di tab baru)
      </span>
    </a>
  );
}

/** Kartu mentor/komunitas: profil singkat + kontak langsung. */
export function ProfileCard({ story }: { story: Story }) {
  return (
    <article className="card flex h-full flex-col p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-heading text-brand-ink">
          {STORY_KIND_LABEL[story.kind]}
        </span>
        {story.sample && <SampleBadge />}
      </div>
      <p className="mt-3 font-emphasis">{story.author_name}</p>
      <h3 className="mt-1 text-lg leading-snug font-display font-heading tracking-display text-balance">{story.title}</h3>
      {story.summary && <p className="mt-2 leading-relaxed text-pretty text-ink-muted">{story.summary}</p>}
      <div className="mt-3">
        <TagList tags={story.tags.slice(0, 4)} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
        <ContactButton story={story} />
        <Link
          href={storyHref(story.id)}
          className="rounded px-1 text-sm font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link"
        >
          Baca profil<span className="sr-only"> {story.author_name}</span>
        </Link>
      </div>
    </article>
  );
}

/** Bagikan tulisan: menu bagikan bawaan HP bila ada, salin link, dan WhatsApp. */
export function ShareBar({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = () => new URL(path, window.location.origin).toString();

  const nativeShare = async () => {
    try {
      await navigator.share({ title, url: url() });
    } catch {
      // dibatalkan pengguna: tidak perlu pesan
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  };
  const openWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${title}\n${url()}`)}`, "_blank", "noopener,noreferrer");
  };
  // Baru diketahui setelah hidrasi; server selalu merender tanpa tombol ini.
  const canShare = useHydrated() && "share" in navigator;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Bagikan tulisan">
      {canShare && (
        <button type="button" onClick={() => void nativeShare()} className={buttonClass("secondary")}>
          <ShareIcon className="size-4" />
          Bagikan
        </button>
      )}
      <button type="button" onClick={() => void copy()} className={buttonClass("secondary")}>
        {copied ? <CheckIcon className="size-4 text-leaf" /> : <LinkIcon className="size-4" />}
        {copied ? "Link tersalin" : "Salin link"}
      </button>
      <button type="button" onClick={openWhatsapp} className={buttonClass("secondary")}>
        <ChatIcon className="size-4" />
        WhatsApp
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Link tulisan sudah disalin." : ""}
      </span>
      {failed && (
        <p role="alert" className="w-full text-sm text-danger">
          Browser tidak mengizinkan menyalin otomatis. Salin link dari bilah alamat.
        </p>
      )}
    </div>
  );
}
