"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { DraftSessionSchema, draftSessionSnapshot, subscribeDraftSession } from "@/lib/draft-session";
import { ArrowRightIcon } from "./icons";

/** Muncul hanya jika pengguna punya draf atau jawaban yang belum selesai di perangkat ini. */
export function ResumeDraftLink() {
  const raw = useSyncExternalStore(subscribeDraftSession, draftSessionSnapshot, () => null);
  const session = useMemo(() => {
    if (!raw) return null;
    try {
      const parsed = DraftSessionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }, [raw]);

  if (!session) return null;
  const target = session.draft
    ? { href: "/draft", label: "Lanjutkan draf rencanamu" }
    : session.answers.dream.trim()
      ? { href: "/start", label: "Lanjutkan ceritamu" }
      : null;
  if (!target) return null;

  return (
    <Link
      href={target.href}
      className="group inline-flex items-center gap-1.5 rounded-full font-emphasis text-link underline decoration-link/40 underline-offset-4 hover:decoration-link"
    >
      {target.label}
      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
