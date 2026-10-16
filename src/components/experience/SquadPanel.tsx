"use client";

import { useId, useState } from "react";
import { APPLICATION_STATUS_LABEL } from "@/lib/opportunities";
import type { Squad } from "@/lib/types";
import { ExternalIcon, UsersIcon } from "../icons";

/**
 * Squad: anggota, status izin, dan link grup. `onAvailability` hanya diisi
 * untuk talenta (mengatur izin dirinya sendiri); mitra dan admin hanya melihat.
 */
export function SquadPanel({
  squad,
  onAvailability,
}: {
  squad: Squad;
  onAvailability?: (availability: "siap" | "izin", note: string) => Promise<void>;
}) {
  const id = useId();
  const me = squad.members.find((m) => m.isMe);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(me?.availabilityNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (availability: "siap" | "izin") => {
    if (!onAvailability) return;
    if (availability === "izin" && note.trim().length < 3) {
      setError("Tulis alasan singkat, misalnya “sakit sampai Kamis”.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAvailability(availability, note);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status izin gagal disimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-t`} className="mt-3 rounded-2xl border-2 border-sky/40 bg-sky-soft/60 p-3 sm:p-4">
      <h3 id={`${id}-t`} className="flex items-center gap-2 font-heading">
        <UsersIcon className="size-4 text-link" />
        Squad: {squad.name}
      </h3>
      {squad.note && <p className="mt-1 text-sm leading-relaxed text-ink-muted">{squad.note}</p>}

      <ul aria-label={`Anggota ${squad.name}`} className="mt-2 space-y-1.5">
        {squad.members.map((m) => (
          <li key={m.applicationId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
            <span className="font-emphasis">
              {m.name}
              {m.isMe && <span className="font-medium text-ink-muted"> (kamu)</span>}
            </span>
            <span className="text-right">
              {m.availability === "izin" ? (
                <span className="rounded-full bg-sun-soft px-2 py-0.5 text-xs font-heading text-on-sun">
                  Izin{m.availabilityNote && `: ${m.availabilityNote}`}
                </span>
              ) : (
                <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-xs font-heading text-leaf-ink">Siap</span>
              )}
              <span className="ml-2 text-xs text-ink-muted">{APPLICATION_STATUS_LABEL[m.status]}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {squad.contactLink ? (
          <a
            href={squad.contactLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-2xl border-2 border-line bg-surface px-3 text-sm font-heading text-link hover:bg-surface-muted"
          >
            Buka grup squad
            <ExternalIcon className="size-3.5" />
            <span className="sr-only"> (tab baru)</span>
          </a>
        ) : (
          <p className="text-xs text-ink-muted">Link grup belum diisi admin.</p>
        )}
        {onAvailability && me && !editing && (
          me.availability === "izin" ? (
            <button type="button" disabled={busy} onClick={() => void save("siap")} className="min-h-10 rounded-2xl px-3 text-sm font-emphasis text-link hover:bg-surface">
              Aku sudah siap lagi
            </button>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="min-h-10 rounded-2xl px-3 text-sm font-emphasis text-link hover:bg-surface">
              Aku izin
            </button>
          )
        )}
      </div>

      {onAvailability && editing && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-emphasis text-ink-muted">
            Alasan izin (terlihat teman squad dan mitra)
            <input
              value={note}
              maxLength={120}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mis. sakit sampai Kamis"
              className="mt-1 block w-full rounded-2xl border-2 border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-sky focus:outline-none"
            />
          </label>
          <button type="button" disabled={busy} onClick={() => void save("izin")} className="min-h-10 rounded-2xl bg-link px-4 text-sm font-heading text-white disabled:opacity-60">
            Simpan izin
          </button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-10 rounded-2xl px-3 text-sm font-emphasis text-ink-muted hover:bg-surface">
            Batal
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
