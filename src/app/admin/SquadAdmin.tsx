"use client";

import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { fieldClass } from "@/components/experience/form";
import { SquadPanel } from "@/components/experience/SquadPanel";
import { AlertIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { buttonClass } from "@/components/ui";
import { APPLICATION_STATUS_LABEL } from "@/lib/opportunities";
import { StoreError, assignToSquad, deleteSquad, listApplicationsForAdmin, listSquadsForAdmin, saveSquad } from "@/lib/store";
import { MAX_SQUAD_SIZE, type Application, type Squad } from "@/lib/types";

/** Yang boleh dimasukkan ke squad: sudah diteruskan dan masih berjalan (sama dengan trigger database). */
const SQUADABLE = new Set(["diteruskan", "diterima", "bekerja"]);

type Group = { opportunityId: string; title: string; orgName: string; applicants: Application[]; squads: Squad[] };

/** Admin mencocokkan talenta yang sudah diteruskan ke dalam squad kecil (2–4 orang) per lowongan. */
export function SquadSection() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [apps, squads] = await Promise.all([listApplicationsForAdmin("semua"), listSquadsForAdmin()]);
      const byOpp = new Map<string, Group>();
      for (const a of apps.filter((x) => SQUADABLE.has(x.status))) {
        const g = byOpp.get(a.opportunityId) ?? { opportunityId: a.opportunityId, title: a.opportunityTitle, orgName: a.orgName, applicants: [], squads: [] };
        g.applicants.push(a);
        byOpp.set(a.opportunityId, g);
      }
      for (const sq of squads) byOpp.get(sq.opportunityId)?.squads.push(sq);
      setGroups([...byOpp.values()]);
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Data squad gagal dimuat.");
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const run = async (task: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await task();
      setNotice(done);
      await load();
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Perubahan squad gagal disimpan.");
    }
  };

  return (
    <section aria-label="Squad" className="mt-6">
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        Kelompokkan talenta yang sudah diteruskan ke mitra menjadi squad kecil (maks. {MAX_SQUAD_SIZE} orang). Kalau satu
        anggota izin, proyek tetap berjalan. Anggota melihat nama dan status izin temannya serta link grup, tanpa kontak
        pribadi.
      </p>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm font-emphasis text-leaf-ink">
        {notice}
      </p>
      {error && (
        <p role="alert" className="mt-2 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}
      {groups === null ? (
        <div aria-hidden="true" className="mt-4 h-64 animate-pulse rounded-card bg-surface-muted" />
      ) : groups.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
          <Mascot pose="think" idle={false} className="h-20 w-auto" />
          Belum ada talenta yang diteruskan. Teruskan pendaftar di tab Pendaftar dulu, lalu bentuk squad di sini.
        </div>
      ) : (
        <ul className="mt-2 grid gap-5">
          {groups.map((g) => (
            <li key={g.opportunityId}>
              <OpportunitySquads
                group={g}
                onCreate={(input) => run(() => saveSquad(g.opportunityId, input), `Squad “${input.name}” dibuat.`)}
                onDelete={(sq) => run(() => deleteSquad(sq.id), `Squad “${sq.name}” dihapus.`)}
                onAssign={(a, squadId) =>
                  run(
                    () => assignToSquad(a.id, squadId),
                    squadId ? `${a.applicantName} masuk ${g.squads.find((s) => s.id === squadId)?.name}.` : `${a.applicantName} dikeluarkan dari squad.`,
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpportunitySquads({
  group: g,
  onCreate,
  onDelete,
  onAssign,
}: {
  group: Group;
  onCreate: (input: { name: string; contactLink: string | null; note: string }) => Promise<void>;
  onDelete: (squad: Squad) => Promise<void>;
  onAssign: (application: Application, squadId: string | null) => Promise<void>;
}) {
  const id = useId();
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onCreate({ name, contactLink: link.trim() || null, note });
    setBusy(false);
    setName("");
    setLink("");
    setNote("");
  };

  return (
    <article aria-labelledby={`${id}-t`} className="card p-5 sm:p-6">
      <h3 id={`${id}-t`} className="font-display text-lg font-heading">
        {g.title}
      </h3>
      <p className="text-sm text-ink-muted">{g.orgName}</p>

      {g.squads.length > 0 && (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {g.squads.map((sq) => (
            <li key={sq.id}>
              <SquadPanel squad={sq} />
              <button type="button" onClick={() => void onDelete(sq)} className={`${buttonClass("ghost")} mt-1 min-h-9 text-xs`}>
                Hapus squad<span className="sr-only"> {sq.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h4 className="mt-5 text-sm font-heading tracking-wide text-ink-muted uppercase">Talenta yang diteruskan</h4>
      <ul className="mt-2 divide-y divide-line rounded-2xl border-2 border-line">
        {g.applicants.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0">
              <span className="font-emphasis">{a.applicantName}</span>
              <span className="ml-2 text-xs text-ink-muted">{APPLICATION_STATUS_LABEL[a.status]}</span>
              {a.availability === "izin" && (
                <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-xs font-heading text-on-sun">Izin</span>
              )}
            </span>
            <label className="text-xs font-emphasis text-ink-muted">
              Squad
              <select
                value={a.squadId ?? ""}
                disabled={g.squads.length === 0}
                onChange={(e) => void onAssign(a, e.target.value || null)}
                aria-label={`Squad untuk ${a.applicantName}`}
                className="ml-2 rounded-xl border-2 border-line-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-sky focus:outline-none disabled:opacity-60"
              >
                <option value="">Tanpa squad</option>
                {g.squads.map((sq) => (
                  <option key={sq.id} value={sq.id}>
                    {sq.name} ({sq.members.length}/{MAX_SQUAD_SIZE})
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} aria-label={`Squad baru untuk ${g.title}`} className="mt-5 grid gap-3 rounded-2xl bg-surface-muted p-4 sm:grid-cols-2">
        <label className="text-sm font-emphasis">
          Nama squad
          <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mis. Squad Katalog A" className={fieldClass} />
        </label>
        <label className="text-sm font-emphasis">
          Link grup (https)
          <input type="url" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://chat.whatsapp.com/…" className={fieldClass} />
        </label>
        <label className="text-sm font-emphasis sm:col-span-2">
          Catatan untuk squad (opsional)
          <input maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mis. Rapat pertama Senin pukul 19.00" className={fieldClass} />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy || name.trim().length < 2} className={buttonClass("secondary")}>
            Buat squad
          </button>
        </div>
      </form>
    </article>
  );
}
