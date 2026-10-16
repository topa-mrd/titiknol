"use client";

import { useCallback, useEffect, useState } from "react";
import { ApplicationProgress, StatusChip } from "@/components/experience/ApplicationProgress";
import { OpportunityCard } from "@/components/experience/OpportunityCard";
import { fieldClass } from "@/components/experience/form";
import { AlertIcon, ExternalIcon } from "@/components/icons";
import { Mascot } from "@/components/Mascot";
import { Sep } from "@/components/Sep";
import { buttonClass } from "@/components/ui";
import { APPLICATION_STATUS_LABEL } from "@/lib/opportunities";
import {
  StoreError,
  listApplicationsForAdmin,
  listOpportunitiesForAdmin,
  reviewOpportunity,
  updateApplicationByAdmin,
  type AdminOpportunity,
  type ApplicationAdminFilter,
  type OpportunityAdminFilter,
} from "@/lib/store";
import { ADMIN_APPLICATION_STATUSES, type Application, type ApplicationStatus, type OpportunityReview } from "@/lib/types";

const pill = (active: boolean) =>
  `min-h-10 rounded-full px-4 text-sm font-heading tracking-wide uppercase transition-colors ${
    active ? "bg-sky-soft text-link ring-2 ring-sky/40 ring-inset" : "text-ink-muted hover:bg-surface-muted"
  }`;

function Filters<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)} className={pill(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-card border-2 border-dashed border-line px-6 py-10 text-center font-emphasis text-ink-muted">
      <Mascot pose="cheer" idle={false} className="h-20 w-auto" />
      {children}
    </div>
  );
}

// ───────────────────────── Verifikasi lowongan ─────────────────────────

export function OpportunityReviewSection() {
  const [filter, setFilter] = useState<OpportunityAdminFilter>("menunggu");
  const [items, setItems] = useState<AdminOpportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (f: OpportunityAdminFilter) => {
    setItems(null);
    setError(null);
    try {
      setItems(await listOpportunitiesForAdmin(f));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Lowongan gagal dimuat.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter), 0);
    return () => clearTimeout(t);
  }, [filter, load]);

  const decide = async (o: AdminOpportunity, review: OpportunityReview, note: string) => {
    try {
      const updated = await reviewOpportunity(o.id, review, note);
      setItems((list) => (list ?? []).flatMap((x) => (x.id !== o.id ? [x] : filter === "semua" || filter === updated.review ? [{ ...x, ...updated }] : [])));
      setNotice(`“${updated.title}” ${review === "disetujui" ? "disetujui dan tayang" : review === "ditolak" ? "ditolak" : "dikembalikan ke antrean"}.`);
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Verifikasi gagal disimpan.");
    }
  };

  return (
    <section aria-label="Verifikasi lowongan" className="mt-6">
      <Filters
        label="Saring lowongan"
        value={filter}
        onChange={(v) => {
          setNotice(null);
          setFilter(v);
        }}
        options={[
          { value: "menunggu", label: "Menunggu" },
          { value: "disetujui", label: "Tayang" },
          { value: "ditolak", label: "Ditolak" },
          { value: "semua", label: "Semua" },
        ]}
      />
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm font-emphasis text-leaf-ink">
        {notice}
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {items === null ? (
        <div aria-hidden="true" className="mt-4 h-64 animate-pulse rounded-card bg-surface-muted" />
      ) : items.length === 0 ? (
        <Empty>Tidak ada lowongan dengan status ini.</Empty>
      ) : (
        <ul className="mt-2 grid gap-4 md:grid-cols-2">
          {items.map((o) => (
            <li key={o.id}>
              <ReviewCard opportunity={o} onDecide={decide} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewCard({ opportunity: o, onDecide }: { opportunity: AdminOpportunity; onDecide: (o: AdminOpportunity, r: OpportunityReview, note: string) => Promise<void> }) {
  const [note, setNote] = useState(o.adminNote);
  const [busy, setBusy] = useState(false);
  const run = async (r: OpportunityReview) => {
    setBusy(true);
    await onDecide(o, r, note);
    setBusy(false);
  };
  return (
    <OpportunityCard
      opportunity={o}
      badge={
        <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-heading text-ink-muted">
          {o.review === "menunggu" ? "Menunggu" : o.review === "disetujui" ? (o.closed ? "Ditutup mitra" : "Tayang") : "Ditolak"}
        </span>
      }
    >
      <p className="mb-3 text-sm text-ink-muted">
        Kontak mitra: <span className="font-emphasis text-ink">{o.orgContactName}</span>
        <Sep />
        <span className="font-emphasis break-all text-ink">{o.orgContact}</span>
      </p>
      <label className="block text-sm font-emphasis">
        Catatan untuk mitra <span className="font-medium text-ink-muted">(wajib bila ditolak)</span>
        <input className={fieldClass} value={note} maxLength={300} placeholder="Mis. lengkapi imbalan dan jam kerja" onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        {o.review !== "disetujui" && (
          <button type="button" disabled={busy} onClick={() => void run("disetujui")} className={buttonClass("secondary")} aria-label={`Setujui lowongan ${o.title}`}>
            Setujui
          </button>
        )}
        {o.review !== "ditolak" && (
          <button
            type="button"
            disabled={busy || note.trim().length < 5}
            onClick={() => void run("ditolak")}
            className={`${buttonClass("ghost")} text-danger hover:text-danger`}
            aria-label={`Tolak lowongan ${o.title}`}
          >
            Tolak
          </button>
        )}
      </div>
    </OpportunityCard>
  );
}

// ───────────────────────── Pendaftar ─────────────────────────

export function ApplicationReviewSection() {
  const [filter, setFilter] = useState<ApplicationAdminFilter>("dikirim");
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (f: ApplicationAdminFilter) => {
    setItems(null);
    setError(null);
    try {
      setItems(await listApplicationsForAdmin(f));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Pendaftar gagal dimuat.");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter), 0);
    return () => clearTimeout(t);
  }, [filter, load]);

  return (
    <section aria-label="Pendaftar" className="mt-6">
      <Filters
        label="Saring pendaftar"
        value={filter}
        onChange={(v) => {
          setNotice(null);
          setFilter(v);
        }}
        options={[
          { value: "dikirim", label: "Baru" },
          { value: "diproses", label: "Diproses" },
          { value: "diteruskan", label: "Diteruskan" },
          { value: "bekerja", label: "Bekerja" },
          { value: "semua", label: "Semua" },
        ]}
      />
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm font-emphasis text-leaf-ink">
        {notice}
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {items === null ? (
        <div aria-hidden="true" className="mt-4 h-64 animate-pulse rounded-card bg-surface-muted" />
      ) : items.length === 0 ? (
        <Empty>Tidak ada pendaftar dengan status ini.</Empty>
      ) : (
        <ul className="mt-2 grid gap-4">
          {items.map((a) => (
            <ApplicantCard
              key={a.id}
              application={a}
              onUpdated={(u) => {
                setItems((list) => (list ?? []).flatMap((x) => (x.id !== u.id ? [x] : filter === "semua" || filter === u.status ? [u] : [])));
                setNotice(`${u.applicantName}: ${APPLICATION_STATUS_LABEL[u.status].toLowerCase()}.`);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApplicantCard({ application: a, onUpdated }: { application: Application; onUpdated: (a: Application) => void }) {
  const [status, setStatus] = useState<ApplicationStatus>(a.status === "dikirim" ? "diproses" : a.status);
  const [note, setNote] = useState(a.adminNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminCanSet = (ADMIN_APPLICATION_STATUSES as readonly string[]).includes(a.status) || a.status === "dibatalkan";

  const save = async (next: ApplicationStatus) => {
    setBusy(true);
    setError(null);
    try {
      onUpdated(await updateApplicationByAdmin(a.id, next, note));
    } catch (e) {
      setError(e instanceof StoreError ? e.message : "Status gagal disimpan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-heading">{a.applicantName || "Talenta"}</h3>
          <p className="text-sm text-ink-muted">
            {a.opportunityTitle}
            <Sep />
            {a.orgName}
          </p>
        </div>
        <StatusChip status={a.status} />
      </div>
      <ApplicationProgress status={a.status} />
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Kontak</dt>
          <dd className="font-heading break-all">{a.contact}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Portofolio & CV</dt>
          <dd className="flex flex-wrap gap-x-4">
            {a.portfolioUrl ? (
              <a href={a.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-emphasis text-link underline decoration-link/40 underline-offset-4">
                Portofolio <ExternalIcon aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
            {a.cvUrl ? (
              <a href={a.cvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-emphasis text-link underline decoration-link/40 underline-offset-4">
                CV <ExternalIcon aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
            {!a.portfolioUrl && !a.cvUrl && <span className="text-ink-muted">Tidak dilampirkan</span>}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-ink-muted">Alasan</dt>
          <dd className="leading-relaxed">{a.motivation}</dd>
        </div>
        {a.profileSummary && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Ringkasan roadmap</dt>
            <dd className="leading-relaxed">{a.profileSummary}</dd>
          </div>
        )}
        {a.orgNote && (
          <div className="sm:col-span-2">
            <dt className="text-ink-muted">Catatan mitra</dt>
            <dd className="leading-relaxed">{a.orgNote}</dd>
          </div>
        )}
      </dl>

      {adminCanSet ? (
        <div className="mt-5 grid gap-3 border-t-2 border-line pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
          <label className="text-sm font-emphasis">
            Status
            <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
              {ADMIN_APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {APPLICATION_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-emphasis">
            Catatan untuk talenta
            <input className={fieldClass} value={note} maxLength={300} placeholder="Mis. kami teruskan ke mitra, tunggu kabar 3 hari" onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="button" disabled={busy} onClick={() => void save(status)} className={buttonClass("secondary")} aria-label={`Simpan status ${a.applicantName}`}>
            {busy ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      ) : (
        <p className="mt-4 border-t-2 border-line pt-4 text-sm text-ink-muted">Sudah ditangani mitra. Status berikutnya diatur oleh mitra.</p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </li>
  );
}

function ErrorBox({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-3 flex gap-2 rounded-2xl border-2 border-danger/40 bg-danger-soft px-4 py-3 text-sm">
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-danger" />
      {children}
    </p>
  );
}
