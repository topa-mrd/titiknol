"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { fieldClass } from "@/components/experience/form";
import { AlertIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { buttonClass } from "@/components/ui";
import {
  LEVEL_LABEL,
  MATCH_STATUS_LABEL,
  canTake,
  isPastDeadline,
  matchPlaceLabel,
  rankOpportunitiesForRequest,
  tierLevel,
} from "@/lib/opportunities";
import {
  StoreError,
  listMatchRequestsForAdmin,
  listOpenOpportunities,
  offerMatch,
  updateMatchByAdmin,
  type AdminMatch,
  type MatchAdminFilter,
} from "@/lib/store";
import type { MatchRequest, Opportunity } from "@/lib/types";

const FILTERS: { value: MatchAdminFilter; label: string }[] = [
  { value: "menunggu", label: "Menunggu" },
  { value: "ditawarkan", label: "Ditawarkan" },
  { value: "diterima", label: "Diterima" },
  { value: "semua", label: "Semua" },
];

const pill = (active: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-heading tracking-wide uppercase transition-colors ${
    active ? "bg-sky-soft text-link ring-2 ring-sky/40 ring-inset" : "text-ink-muted hover:bg-surface-muted"
  }`;

/** Admin mencarikan proyek untuk talenta yang menekan "Carikan untukku". */
export function MatchSection() {
  const [filter, setFilter] = useState<MatchAdminFilter>("menunggu");
  const [items, setItems] = useState<AdminMatch[] | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (f: MatchAdminFilter) => {
    setItems(null);
    setError(null);
    try {
      const [matches, open] = await Promise.all([listMatchRequestsForAdmin(f), listOpenOpportunities()]);
      // Lowongan contoh hanya ditawarkan di mode demo (di database belum ada lowongan sungguhan).
      setOpportunities(open.samplesOnly ? [] : open.items);
      setItems(matches);
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Permintaan gagal dimuat.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter), 0);
    return () => clearTimeout(t);
  }, [filter, load]);

  const onUpdated = (updated: MatchRequest, message: string) => {
    setItems((list) =>
      (list ?? []).flatMap((x) =>
        x.request.id !== updated.id ? [x] : filter === "semua" || filter === updated.status ? [{ ...x, request: updated }] : [],
      ),
    );
    setNotice(message);
  };

  return (
    <section aria-label="Dicarikan" className="mt-6">
      <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
        Talenta yang menekan “Carikan untukku” menunggu di sini bersama roadmap-nya. Pilih satu lowongan yang cocok dan
        terbuka untuk tingkatnya. Kalau talenta menerima, pendaftarannya langsung diteruskan ke mitra.
      </p>
      <div role="tablist" aria-label="Saring permintaan" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={filter === o.value}
            onClick={() => {
              setNotice(null);
              setFilter(o.value);
            }}
            className={pill(filter === o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm font-emphasis text-leaf-ink">
        {notice}
      </p>
      {error && (
        <p role="alert" className="mt-2 flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
          <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
          {error}
        </p>
      )}
      {items === null ? (
        <div aria-hidden="true" className="mt-4 h-64 animate-pulse rounded-card bg-surface-muted" />
      ) : items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
          <Mascot pose="cheer" idle={false} className="h-20 w-auto" />
          Tidak ada permintaan dengan status ini.
        </div>
      ) : (
        <ul className="mt-2 grid gap-4">
          {items.map((m) => (
            <MatchCard key={m.request.id} match={m} opportunities={opportunities} onUpdated={onUpdated} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MatchCard({
  match: { request: r, tier },
  opportunities,
  onUpdated,
}: {
  match: AdminMatch;
  opportunities: Opportunity[];
  onUpdated: (request: MatchRequest, message: string) => void;
}) {
  const id = useId();
  const [note, setNote] = useState(r.adminNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Yang bisa ditawarkan: terbuka untuk tingkat talenta dan belum lewat batas daftar.
  // Daerah pilihan talenta (atau online) didahulukan, lalu kecocokan dengan roadmap.
  const options = useMemo(() => {
    const takeable = opportunities.filter((o) => canTake(o.level, tier) && !isPastDeadline(o.deadline));
    const placeFit = (o: Opportunity) => (r.place === null ? 1 : r.place === "online" ? Number(o.remote) : Number(o.province === r.place || o.remote));
    return rankOpportunitiesForRequest(takeable, r, tier)
      .map((x, order) => ({ ...x, fit: placeFit(x.opportunity), order }))
      .sort((a, b) => b.fit - a.fit || a.order - b.order);
  }, [opportunities, r, tier]);
  const lockedCount = opportunities.length - options.length;
  const [choice, setChoice] = useState(r.offeredOpportunityId ?? options[0]?.opportunity.id ?? "");
  const offered = opportunities.find((o) => o.id === r.offeredOpportunityId);
  const open = r.status === "menunggu" || r.status === "ditawarkan";

  const run = async (task: () => Promise<MatchRequest>, message: (u: MatchRequest) => string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await task();
      onUpdated(updated, message(updated));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Perubahan gagal disimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-heading">{r.applicantName || "Talenta"}</h3>
          <p className="text-sm text-ink-muted">Tingkat terbuka: sampai {LEVEL_LABEL[tierLevel(tier)].toLowerCase()}</p>
        </div>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-heading text-brand-ink">{MATCH_STATUS_LABEL[r.status]}</span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-ink-muted">Plan yang dipilih</dt>
          <dd className="font-heading">{r.planTitle}</dd>
        </div>
        {r.dream && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Mimpi</dt>
            <dd className="leading-relaxed">{r.dream}</dd>
          </div>
        )}
        {r.profileSummary && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Ringkasan roadmap</dt>
            <dd className="leading-relaxed">{r.profileSummary}</dd>
          </div>
        )}
        <div>
          <dt className="text-ink-muted">Daerah</dt>
          <dd className="font-heading">{matchPlaceLabel(r.place)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Kontak</dt>
          <dd className="font-heading break-all">{r.contact}</dd>
        </div>
        {r.note && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Catatan talenta</dt>
            <dd className="leading-relaxed">{r.note}</dd>
          </div>
        )}
        {r.declined.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Pernah ditolak talenta</dt>
            <dd>{r.declined.join(", ")}</dd>
          </div>
        )}
        {r.status === "ditawarkan" && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Sedang ditawarkan</dt>
            <dd className="font-heading">{offered ? `${offered.title} · ${offered.orgName}` : "Lowongan sudah ditutup"}</dd>
          </div>
        )}
      </dl>

      {r.status === "diterima" && (
        <p className="mt-4 border-t-2 border-line pt-4 text-sm text-ink-muted">
          Tawaran diterima. Pendaftarannya sudah diteruskan ke mitra; bentuk squad di tab Squad bila perlu.
        </p>
      )}
      {r.status === "dibatalkan" && <p className="mt-4 border-t-2 border-line pt-4 text-sm text-ink-muted">Permintaan ini sudah ditutup.</p>}

      {open && (
        <div className="mt-5 grid gap-3 border-t-2 border-line pt-5">
          <div>
            {options.length > 0 ? (
              <label className="text-sm font-emphasis">
                Lowongan yang ditawarkan
                <select className={fieldClass} value={choice} onChange={(e) => setChoice(e.target.value)} aria-describedby={`${id}-hint`}>
                  {options.map(({ opportunity: o, matched, fit }) => (
                    <option key={o.id} value={o.id}>
                      {[
                        o.title,
                        o.orgName,
                        LEVEL_LABEL[o.level],
                        matched.length > 0 ? `cocok: ${matched.join(", ")}` : null,
                        fit ? null : "di luar daerah pilihan",
                        r.declined.includes(o.title) ? "pernah ditolak" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
                Belum ada lowongan terbuka untuk tingkat ini. Simpan catatan untuk talenta, lalu tawarkan saat ada lowongan baru.
              </p>
            )}
            <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
              Diurutkan: daerah pilihan, lalu kecocokan dengan roadmap.
              {lockedCount > 0 && ` ${lockedCount} lowongan lain disembunyikan karena tingkatnya belum terbuka atau batas daftarnya lewat.`}
            </p>
          </div>
          <label className="text-sm font-emphasis">
            Pesan untuk talenta
            <input
              className={fieldClass}
              value={note}
              maxLength={300}
              placeholder="Mis. proyek ini cocok dengan langkah desainmu minggu ini"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="flex gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm">
              <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {options.length > 0 && (
              <button
                type="button"
                disabled={busy || !choice}
                className={buttonClass("primary")}
                aria-label={`Tawarkan lowongan ke ${r.applicantName}`}
                onClick={() =>
                  void run(
                    () => offerMatch(r.id, choice, note),
                    () => `Tawaran dikirim ke ${r.applicantName}: ${opportunities.find((o) => o.id === choice)?.title ?? "lowongan"}.`,
                  )
                }
              >
                {r.status === "ditawarkan" ? "Ganti tawaran" : "Tawarkan"}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              className={buttonClass("secondary")}
              onClick={() =>
                void run(
                  () => updateMatchByAdmin(r.id, "menunggu", note),
                  () => (r.status === "ditawarkan" ? `Tawaran untuk ${r.applicantName} ditarik.` : `Catatan untuk ${r.applicantName} disimpan.`),
                )
              }
            >
              {r.status === "ditawarkan" ? "Tarik tawaran" : "Simpan catatan"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
